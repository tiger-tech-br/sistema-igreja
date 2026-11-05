import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SERVER_URL } from './config.js';
import { MemberApi } from './api.js';
import { PresenceObserver } from './presence-observer.js';
import { renderCredential } from '../../js/credencial-view.js';
import './styles.css';

const $ = id => document.getElementById(id);
const api = new MemberApi(SERVER_URL);
let epoch = 0;
let qrRequest = 0;
let credentialRequest = 0;
let expiresAt = 0;
let memberId = null;
let expiryTimer;
let successTimer;
let confirmationFinished = false;
let view = 'login';
let foreground = !document.hidden;
let qrReady = false;

const initials = name => {
  const parts = String(name || 'Membro').trim().split(/\s+/);
  return (parts[0]?.[0] || 'M') + (parts.length > 1 ? parts.at(-1)[0] : '');
};

function showView(next) {
  view = next;
  $('loginScreen').hidden = next !== 'login';
  $('memberScreen').hidden = !['qr', 'credential'].includes(next);
  $('qrScreen').hidden = next !== 'qr';
  $('credentialScreen').hidden = next !== 'credential';
  $('confirmationScreen').hidden = next !== 'confirmation';
}

function validSession() {
  if (!api.token) return false;
  if (Date.now() >= expiresAt) {
    logout('Seu acesso expirou. Entre novamente.');
    return false;
  }
  return true;
}

function qrMessage(message = '', retryable = false) {
  $('qrMessage').textContent = message;
  $('qrMessage').hidden = !message;
  $('retryQrButton').hidden = !retryable;
}

function readingStatus(text, state = 'waiting') {
  $('readingStatus').textContent = text;
  $('readingStatus').dataset.state = state;
}

const observer = new PresenceObserver({
  read: cursor => api.presence(cursor),
  online: () => navigator.onLine !== false,
  onState: state => {
    if (state.kind === 'expired') return logout(state.message);
    if (view !== 'qr' || !api.token) return;
    if (state.kind === 'confirmed') return confirmPresence(state.attendance);
    if (state.kind === 'waiting') {
      readingStatus('Aguardando leitura');
      qrMessage();
    } else if (state.status === 400) {
      observer.stop();
      qrReady = false;
      $('qrImage').hidden = true;
      $('qrLoading').hidden = false;
      $('qrLoading').textContent = 'Prepare novamente seu QR Code para continuar.';
      readingStatus('Atualize seu QR Code', 'error');
      qrMessage(state.message, true);
    } else {
      readingStatus(navigator.onLine === false ? 'Sem conexão' : 'Aguardando confirmação', 'error');
      qrMessage(state.message, true);
    }
  }
});

async function loadQrCode() {
  if (!validSession()) return;
  const currentEpoch = epoch;
  const request = ++qrRequest;
  credentialRequest++;
  clearTimeout(successTimer);
  successTimer = null;
  confirmationFinished = false;
  observer.stop();
  qrReady = false;
  $('qrImage').onload = null;
  $('qrImage').onerror = null;
  $('qrImage').hidden = true;
  $('qrImage').removeAttribute('src');
  $('qrLoading').hidden = false;
  $('qrLoading').textContent = 'Preparando seu QR Code...';
  $('credentialCard').hidden = true;
  readingStatus('Preparando leitura');
  qrMessage();
  showView('qr');
  try {
    const result = await api.qrCode();
    if (currentEpoch !== epoch || request !== qrRequest || view !== 'qr') return;
    if (String(result.membro?.id) !== memberId || typeof result.qrDataUrl !== 'string' || result.qrDataUrl.length > 300000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(result.qrDataUrl)) throw new Error('Não foi possível carregar seu QR Code. Tente novamente.');
    const member = result.membro;
    $('memberInitials').textContent = initials(member.nome).toLocaleUpperCase('pt-BR');
    $('memberName').textContent = member.nome || 'Membro';
    $('memberRole').textContent = [member.cargo || 'Membro', member.ministerio ? `Ministério de ${member.ministerio}` : null].filter(Boolean).join(' • ');
    $('memberRegistration').textContent = member.matricula ? `Matrícula ${member.matricula}` : '';
    $('memberRegistration').hidden = !member.matricula;
    $('qrImage').onload = () => {
      if (currentEpoch !== epoch || request !== qrRequest || view !== 'qr') return;
      try {
        observer.arm(result.cursor);
        if (!foreground) observer.pause();
        qrReady = true;
        $('qrImage').hidden = false;
        $('qrLoading').hidden = true;
        readingStatus('Aguardando leitura');
      } catch (error) {
        $('qrLoading').textContent = 'Seu QR Code não pôde ser conferido.';
        readingStatus('QR Code indisponível', 'error');
        qrMessage(error.message, true);
      }
    };
    $('qrImage').onerror = () => {
      if (currentEpoch !== epoch || request !== qrRequest || view !== 'qr') return;
      observer.stop();
      qrReady = false;
      $('qrImage').hidden = true;
      $('qrLoading').textContent = 'Seu QR Code não pôde ser exibido.';
      readingStatus('QR Code indisponível', 'error');
      qrMessage('Não foi possível exibir seu QR Code. Tente novamente.', true);
    };
    $('qrImage').src = result.qrDataUrl;
  } catch (error) {
    if (currentEpoch !== epoch || request !== qrRequest || view !== 'qr') return;
    if (error.status === 401 || error.status === 403) return logout(error.message);
    $('qrLoading').textContent = 'Seu QR Code ainda não está disponível.';
    readingStatus('QR Code indisponível', 'error');
    qrMessage(error.message || 'Não foi possível carregar seu QR Code.', true);
  }
}

function confirmPresence(attendance) {
  if (!validSession() || !foreground || view !== 'qr') return;
  observer.pause();
  showView('confirmation');
  $('confirmationTitle').textContent = attendance.alreadyRecorded ? 'Presença já confirmada' : 'Presença confirmada';
  confirmationFinished = false;
  const currentEpoch = epoch;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  successTimer = setTimeout(() => {
    successTimer = null;
    if (currentEpoch !== epoch || view !== 'confirmation') return;
    confirmationFinished = true;
    if (foreground) loadCredential();
  }, reducedMotion ? 700 : 1300);
}

async function loadCredential() {
  if (!validSession()) return;
  const currentEpoch = epoch;
  const request = ++credentialRequest;
  observer.pause();
  showView('credential');
  $('credentialCard').hidden = true;
  $('credentialLoading').hidden = false;
  $('credentialMessage').hidden = true;
  $('retryCredentialButton').hidden = true;
  try {
    const credential = await api.credential();
    if (currentEpoch !== epoch || request !== credentialRequest || view !== 'credential') return;
    if (String(credential.id) !== memberId) throw new Error('Não foi possível conferir sua credencial.');
    renderCredential(credential, {
      name: $('credentialName'), role: $('credentialRole'), roleArea: $('credentialRoleArea'),
      registration: $('credentialRegistration'), validity: $('credentialValidity')
    });
    $('credentialInitials').textContent = initials(credential.nome).toLocaleUpperCase('pt-BR');
    $('credentialCard').hidden = false;
  } catch (error) {
    if (currentEpoch !== epoch || request !== credentialRequest || view !== 'credential') return;
    if (error.status === 401) return logout(error.message);
    $('credentialMessage').textContent = error.message || 'Sua credencial não pôde ser conferida. Tente novamente.';
    $('credentialMessage').hidden = false;
    $('retryCredentialButton').hidden = false;
  } finally {
    if (currentEpoch === epoch && request === credentialRequest) $('credentialLoading').hidden = true;
  }
}

function logout(message = '') {
  epoch++;
  qrRequest++;
  credentialRequest++;
  clearTimeout(expiryTimer);
  clearTimeout(successTimer);
  successTimer = null;
  expiresAt = 0;
  memberId = null;
  qrReady = false;
  confirmationFinished = false;
  observer.stop();
  api.clear();
  $('senha').value = '';
  $('senha').type = 'password';
  $('togglePassword').setAttribute('aria-pressed', 'false');
  $('togglePassword').setAttribute('aria-label', 'Mostrar senha');
  $('qrImage').onload = null;
  $('qrImage').onerror = null;
  $('qrImage').removeAttribute('src');
  $('qrImage').hidden = true;
  $('credentialCard').hidden = true;
  for (const id of ['memberInitials', 'memberName', 'memberRole', 'memberRegistration', 'credentialInitials', 'credentialName', 'credentialRole', 'credentialRegistration', 'credentialValidity']) $(id).textContent = '';
  $('loginMessage').textContent = message;
  $('loginMessage').hidden = !message;
  $('loginButton').disabled = false;
  $('loginButton').querySelector('span').textContent = 'Entrar';
  showView('login');
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const currentEpoch = ++epoch;
  $('loginButton').disabled = true;
  $('loginButton').querySelector('span').textContent = 'Entrando...';
  $('loginMessage').hidden = true;
  try {
    const access = await api.login($('email').value.trim(), $('senha').value);
    if (currentEpoch !== epoch) return;
    const expiration = new Date(access.expiresAt).getTime();
    if (typeof access.token !== 'string' || !access.token || !Number.isFinite(expiration) || expiration <= Date.now() || !/^[1-9]\d{0,9}$/.test(String(access.membro?.id))) throw new Error('O servidor devolveu um acesso inválido. Tente novamente.');
    api.token = access.token;
    expiresAt = expiration;
    memberId = String(access.membro.id);
    $('senha').value = '';
    $('memberName').textContent = access.membro.nome || 'Membro';
    expiryTimer = setTimeout(() => logout('Seu acesso expirou. Entre novamente.'), Math.min(expiration - Date.now(), 86400000));
    await loadQrCode();
  } catch (error) {
    if (currentEpoch !== epoch) return;
    $('loginMessage').textContent = error.message || 'Não foi possível entrar. Verifique a conexão.';
    $('loginMessage').hidden = false;
  } finally {
    if (currentEpoch === epoch) {
      $('loginButton').disabled = false;
      $('loginButton').querySelector('span').textContent = 'Entrar';
    }
  }
});

$('togglePassword').addEventListener('click', () => {
  const visible = $('senha').type === 'password';
  $('senha').type = visible ? 'text' : 'password';
  $('togglePassword').setAttribute('aria-pressed', String(visible));
  $('togglePassword').setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
});
$('logoutButton').addEventListener('click', () => logout());
$('confirmationLogoutButton').addEventListener('click', () => logout());
$('backQrButton').addEventListener('click', loadQrCode);
$('retryCredentialButton').addEventListener('click', loadCredential);
$('retryQrButton').addEventListener('click', () => {
  if (!validSession() || view !== 'qr') return;
  if (qrReady && observer.cursor !== null) {
    observer.pause();
    if (foreground) observer.resume();
  } else loadQrCode();
});

function setForeground(active) {
  foreground = active;
  if (active && api.token && !validSession()) return;
  if (!active) observer.pause();
  else if (view === 'qr' && qrReady) observer.resume();
  else if (view === 'confirmation' && confirmationFinished) loadCredential();
}

document.addEventListener('visibilitychange', () => setForeground(!document.hidden));
window.addEventListener('pagehide', () => setForeground(false));
window.addEventListener('pageshow', event => { if (event.persisted) setForeground(!document.hidden); });
window.addEventListener('offline', () => {
  if (view === 'qr') {
    readingStatus('Sem conexão', 'error');
    qrMessage('Sem conexão. A presença só será confirmada quando o servidor responder.', true);
  }
});
window.addEventListener('online', () => {
  if (view === 'qr' && foreground && qrReady) { observer.pause(); observer.resume(); }
});
if (Capacitor.isNativePlatform()) {
  App.addListener('appStateChange', ({ isActive }) => setForeground(isActive)).catch(() => {});
  App.addListener('backButton', () => {
    if (['credential', 'confirmation'].includes(view) && api.token) loadQrCode();
    else App.minimizeApp().catch(() => {});
  }).catch(() => {});
}
