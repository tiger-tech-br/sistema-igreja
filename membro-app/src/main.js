import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SERVER_URL } from './config.js';
import { MemberApi } from './api.js';
import { PresenceObserver } from './presence-observer.js';
import { PullToRefresh } from '../../mobile-shared/pull-to-refresh.js';
import { renderCredential } from '../../js/credencial-view.js';
import { SavedSession } from '../../mobile-shared/session.js';
import './styles.css';

const $ = id => document.getElementById(id);
const api = new MemberApi(SERVER_URL);
const savedSession = new SavedSession({
  app: 'membro', serverUrl: SERVER_URL, native: Capacitor.isNativePlatform(),
  secure: registerPlugin('SecureSession')
});
let savedRecord = null;
let restoreTask = null;
let forgetTask = Promise.resolve();
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
let loginBusy = false;
let registrationConfig = null;
let registrationAbort = null;
let registrationRequest = 0;
let registrationBusy = false;
let accountReturnView = 'qr';
let accountBusy = false;
let accountAbort = null;
let accountProfileRequest = 0;
let accountProfileAbort = null;
let accountProfileBusy = false;
let accountProfileMemberId = null;
let accountProfileLoaded = false;
const identificationRequests = new Set();
const accountProfileFields = [
  ['accountName', 'nome'], ['accountBirth', 'data_nascimento'], ['accountEmail', 'email'], ['accountRegistration', 'matricula'],
  ['accountSex', 'sexo', 'accountSexRow'], ['accountCivilStatus', 'estado_civil', 'accountCivilStatusRow'],
  ['accountCellphone', 'celular', 'accountCellphoneRow'], ['accountTelephone', 'telefone', 'accountTelephoneRow'],
  ['accountAddress', 'endereco', 'accountAddressRow'], ['accountRole', 'cargo', 'accountRoleRow'],
  ['accountMinistry', 'ministerio', 'accountMinistryRow'], ['accountValidity', 'validade', 'accountValidityRow']
];

const initials = name => {
  const parts = String(name || 'Membro').trim().split(/\s+/);
  return (parts[0]?.[0] || 'M') + (parts.length > 1 ? parts.at(-1)[0] : '');
};

function showView(next) {
  const changed = view !== next;
  view = next;
  $('loginScreen').hidden = next !== 'login';
  $('registrationScreen').hidden = next !== 'registration';
  $('memberScreen').hidden = !['qr', 'credential', 'account'].includes(next);
  $('qrScreen').hidden = next !== 'qr';
  $('credentialScreen').hidden = next !== 'credential';
  $('confirmationScreen').hidden = next !== 'confirmation';
  $('accountScreen').hidden = next !== 'account';
  if (changed) {
    pullRefresh.reset();
    window.scrollTo?.(0, 0);
  }
}

function validSession() {
  if (!api.token) return false;
  if (Date.now() >= expiresAt) {
    renewOrLogout('Seu acesso expirou. Entre novamente.');
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
    if (state.kind === 'expired') return renewOrLogout(state.message, true);
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

const pullRefresh = new PullToRefresh({
  canRefresh: () => foreground && ['qr', 'credential', 'account'].includes(view) && Boolean(api.token) && Date.now() < expiresAt && !restoreTask && !observer.busy && !accountBusy && !accountProfileBusy && identificationRequests.size === 0,
  scrollTop: () => window.scrollY || document.scrollingElement?.scrollTop || 0,
  refresh: () => view === 'account' ? loadAccountProfile() : view === 'qr' ? loadQrCode() : loadCredential(),
  onState: ({ phase, distance }) => {
    if (phase === 'pulling' || phase === 'ready') observer.pause();
    else if (phase === 'idle' && foreground && view === 'qr' && qrReady && api.token && identificationRequests.size === 0) observer.resume();
    $('pullRefreshIndicator').hidden = phase === 'idle' || (phase !== 'refreshing' && distance <= 10);
    $('pullRefreshIndicator').dataset.phase = phase;
    $('pullRefreshIndicator').style.setProperty('--pull-height', `${Math.min(distance * .7, 72)}px`);
    const text = phase === 'refreshing' ? 'Atualizando…' : phase === 'ready' ? 'Solte para atualizar' : 'Puxe para atualizar';
    if ($('pullRefreshText').textContent !== text) $('pullRefreshText').textContent = text;
  }
});
$('memberScreen').addEventListener('touchstart', event => pullRefresh.start(event), { passive: true });
$('memberScreen').addEventListener('touchmove', event => pullRefresh.move(event), { passive: false });
$('memberScreen').addEventListener('touchend', () => pullRefresh.end(), { passive: true });
$('memberScreen').addEventListener('touchcancel', () => pullRefresh.cancel(), { passive: true });

function formMessage(id, message = '', state = 'error') {
  $(id).textContent = message;
  $(id).hidden = !message;
  $(id).dataset.state = state;
}

function resetPasswordToggle(input, button, label) {
  $(input).type = 'password';
  $(button).setAttribute('aria-pressed', 'false');
  $(button).setAttribute('aria-label', label);
}

function clearRegistration() {
  registrationRequest++;
  registrationAbort?.abort();
  registrationAbort = null;
  registrationConfig = null;
  registrationBusy = false;
  for (const id of ['registrationName', 'registrationBirth', 'registrationEmail', 'registrationPassword', 'registrationConfirmPassword']) $(id).value = '';
  for (const id of ['registrationNotice', 'registrationConsent']) { $(id).checked = false; $(id).disabled = true; }
  resetPasswordToggle('registrationPassword', 'toggleRegistrationPassword', 'Mostrar nova senha');
  $('registrationSubmitButton').disabled = true;
  $('registrationSubmitButton').querySelector('span').textContent = 'Criar meu cadastro';
  $('registrationDuplicateActions').hidden = true;
  formMessage('registrationMessage');
}

function clearAccountForm() {
  accountAbort?.abort();
  accountAbort = null;
  accountBusy = false;
  $('deletePassword').value = '';
  $('deleteConfirmation').checked = false;
  resetPasswordToggle('deletePassword', 'toggleDeletePassword', 'Mostrar senha atual');
  for (const id of ['deleteAccountButton', 'accountBackButton', 'cancelDeleteAccountButton', 'retryAccountProfileButton']) $(id).disabled = false;
  $('deleteAccountButton').querySelector('span').textContent = 'Excluir minha conta';
  formMessage('deleteAccountMessage');
}

function configurePublicLinks() {
  const server = new URL(SERVER_URL);
  if (server.protocol !== 'https:' && !(server.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(server.hostname))) return;
  $('registrationPrivacyLink').setAttribute('href', new URL('/privacidade', server).href);
  $('registrationRecoveryLink').setAttribute('href', new URL('/esqueci-senha', server).href);
}

async function loadRegistrationConfig() {
  if (view !== 'registration' || registrationBusy) return;
  registrationAbort?.abort();
  registrationAbort = new AbortController();
  registrationConfig = null;
  const currentEpoch = epoch;
  const request = ++registrationRequest;
  $('registrationSubmitButton').disabled = true;
  $('retryRegistrationConfigButton').hidden = true;
  $('registrationConfigStatus').hidden = false;
  $('registrationConfigStatus').textContent = 'Carregando as informações de privacidade...';
  $('registrationController').hidden = true;
  for (const id of ['registrationNotice', 'registrationConsent']) { $(id).checked = false; $(id).disabled = true; }
  $('registrationNoticeText').textContent = 'Aguarde o carregamento do aviso.';
  $('registrationConsentText').textContent = 'Aguarde o carregamento da autorização.';
  formMessage('registrationMessage');
  try {
    const config = await api.registrationConfig({ signal: registrationAbort.signal });
    if (currentEpoch !== epoch || request !== registrationRequest || view !== 'registration') return;
    if (!config || typeof config.version !== 'string' || !config.version || config.version.length > 100 ||
      typeof config.noticeText !== 'string' || !config.noticeText || config.noticeText.length > 10000 ||
      typeof config.consentText !== 'string' || !config.consentText || config.consentText.length > 10000) throw new Error('Não foi possível conferir as informações de privacidade. Tente novamente.');
    $('registrationNoticeText').textContent = config.noticeText;
    $('registrationConsentText').textContent = config.consentText;
    $('registrationController').textContent = [config.controller, config.contact].filter(value => typeof value === 'string' && value).join(' • ');
    $('registrationController').hidden = !$('registrationController').textContent;
    if (config.configured !== true) throw new Error('Cadastro temporariamente indisponível. O responsável pela igreja precisa configurar as informações de privacidade.');
    registrationConfig = { version: config.version };
    $('registrationConfigStatus').hidden = true;
    $('registrationSubmitButton').disabled = false;
    for (const id of ['registrationNotice', 'registrationConsent']) $(id).disabled = false;
  } catch (error) {
    if (currentEpoch !== epoch || request !== registrationRequest || view !== 'registration' || error.name === 'AbortError') return;
    $('registrationConfigStatus').textContent = error.message || 'Não foi possível carregar as informações. Confira a conexão e tente novamente.';
    $('retryRegistrationConfigButton').hidden = false;
  }
}

function openRegistration() {
  if (view !== 'login' || loginBusy) return;
  logout();
  clearRegistration();
  showView('registration');
  return loadRegistrationConfig();
}

function closeRegistration() {
  if (view !== 'registration') return;
  const email = $('registrationEmail').value.trim();
  resetLogin();
  if (email) $('email').value = email;
}

function maskBirthDate(event) {
  const input = $('registrationBirth');
  const raw = input.value;
  const cursor = typeof input.selectionStart === 'number' ? input.selectionStart : raw.length;
  const beforeCursor = Math.min(raw.slice(0, cursor).replace(/\D/g, '').length, 8);
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const formatted = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
  let position = 0;
  let seen = 0;
  while (position < formatted.length && seen < beforeCursor) {
    if (/\d/.test(formatted[position])) seen++;
    position++;
  }
  // Forward deletion can remove an inserted slash. Move past it so the next
  // Delete reaches a digit; Backspace naturally stays before the slash.
  if (event.inputType === 'deleteContentForward' && formatted[position] === '/') position++;
  input.value = formatted;
  input.setSelectionRange?.(position, position);
}

function registrationData() {
  const nome = $('registrationName').value.trim();
  const email = $('registrationEmail').value.trim().toLowerCase();
  const senha = $('registrationPassword').value;
  const birth = $('registrationBirth').value.trim();
  if (!/^[A-Za-zÀ-ÿ\s]{3,150}$/.test(nome)) throw new Error('Informe seu nome completo com pelo menos 3 letras.');
  if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(birth);
  if (!match) throw new Error('Informe uma data de nascimento válida.');
  const [, dayText, monthText, yearText] = match;
  const [year, month, day] = [yearText, monthText, dayText].map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const age = Number(today.year) - year - (Number(today.month) < month || (Number(today.month) === month && Number(today.day) < day) ? 1 : 0);
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || age < 18) throw new Error('O cadastro é para pessoas com 18 anos ou mais. Confira sua data de nascimento.');
  if (senha.length < 12 || new TextEncoder().encode(senha).length > 72) throw new Error('Use uma senha com pelo menos 12 caracteres e no máximo 72 bytes.');
  if (senha !== $('registrationConfirmPassword').value) throw new Error('As senhas não são iguais. Digite a mesma senha nos dois campos.');
  if (!$('registrationNotice').checked || !$('registrationConsent').checked) throw new Error('Leia o aviso e marque as duas opções de privacidade e autorização para continuar.');
  if (!registrationConfig) throw new Error('Carregue as informações de privacidade antes de continuar.');
  return { nome, email, senha, dataNascimento: `${dayText}/${monthText}/${yearText}`, cienciaPrivacidade: true, consentimento: true, privacyVersion: registrationConfig.version };
}

async function submitRegistration(event) {
  event.preventDefault();
  if (view !== 'registration' || registrationBusy) return;
  formMessage('registrationMessage');
  $('registrationDuplicateActions').hidden = true;
  let data;
  try { data = registrationData(); }
  catch (error) { formMessage('registrationMessage', error.message); return; }
  const currentEpoch = epoch;
  const request = ++registrationRequest;
  registrationBusy = true;
  registrationAbort = new AbortController();
  $('registrationSubmitButton').disabled = true;
  $('registrationSubmitButton').querySelector('span').textContent = 'Criando cadastro...';
  try {
    await forgetTask;
    if (currentEpoch !== epoch || request !== registrationRequest || view !== 'registration') return;
    const result = await api.registerMember(data, { signal: registrationAbort.signal });
    if (currentEpoch !== epoch || request !== registrationRequest || view !== 'registration') return;
    if (result?.registered !== true) throw new Error('O servidor não confirmou o cadastro. Tente novamente.');
    const email = data.email;
    resetLogin('Cadastro realizado! Entre com seu e-mail e senha para apresentar seu QR Code.');
    $('email').value = email;
    $('rememberMe').checked = false;
    $('loginMessage').dataset.state = 'success';
  } catch (error) {
    if (currentEpoch !== epoch || request !== registrationRequest || view !== 'registration' || error.name === 'AbortError') return;
    formMessage('registrationMessage', error.message || 'Não foi possível criar seu cadastro. Confira a conexão e tente novamente.');
    if (error.status === 409) $('registrationDuplicateActions').hidden = false;
    if (error.status === 503) {
      registrationConfig = null;
      $('retryRegistrationConfigButton').hidden = false;
    }
  } finally {
    if (currentEpoch === epoch && request === registrationRequest && view === 'registration') {
      registrationBusy = false;
      $('registrationSubmitButton').disabled = !registrationConfig;
      $('registrationSubmitButton').querySelector('span').textContent = 'Criar meu cadastro';
      $('registrationPassword').value = '';
      $('registrationConfirmPassword').value = '';
    }
    data.senha = '';
  }
}

function openAccount() {
  if (!['qr', 'credential'].includes(view) || !validSession()) return;
  accountReturnView = view;
  qrRequest++;
  credentialRequest++;
  observer.pause();
  clearAccountForm();
  showView('account');
  return loadAccountProfile();
}

function closeAccount() {
  if (view !== 'account' || accountBusy) return;
  cancelAccountProfile();
  clearAccountForm();
  if (!validSession()) return;
  if (accountReturnView === 'credential') return loadCredential();
  return loadQrCode();
}

function cancelAccountProfile() {
  accountProfileRequest++;
  accountProfileAbort?.abort();
  accountProfileAbort = null;
  accountProfileBusy = false;
  $('accountProfileLoading').hidden = true;
  $('retryAccountProfileButton').disabled = false;
}

function clearAccountProfile() {
  cancelAccountProfile();
  accountProfileMemberId = null;
  accountProfileLoaded = false;
  for (const [id, , row] of accountProfileFields) {
    $(id).textContent = '';
    if (row) $(row).hidden = true;
  }
  $('accountProfileCards').hidden = true;
  formMessage('accountProfileMessage');
  $('retryAccountProfileButton').hidden = true;
}

function renderAccountProfile(profile) {
  if (typeof profile?.id !== 'string' || profile.id !== memberId) throw new Error('Não foi possível conferir os dados da sua conta. Tente novamente.');
  for (const [id, key, row] of accountProfileFields) {
    const value = typeof profile[key] === 'string' ? profile[key].trim() : '';
    $(id).textContent = value || (row ? '' : 'Não informado');
    if (row) $(row).hidden = !value;
  }
  accountProfileMemberId = memberId;
  accountProfileLoaded = true;
  $('accountProfileCards').hidden = false;
}

async function loadAccountProfile({ renewed = false } = {}) {
  if (view !== 'account' || accountBusy || accountProfileBusy || !validSession()) return;
  if (accountProfileMemberId && accountProfileMemberId !== memberId) clearAccountProfile();
  const currentEpoch = epoch;
  const requestedMemberId = memberId;
  const request = ++accountProfileRequest;
  accountProfileAbort = new AbortController();
  accountProfileBusy = true;
  $('accountProfileLoading').textContent = accountProfileLoaded ? 'Atualizando seus dados...' : 'Carregando seus dados...';
  $('accountProfileLoading').hidden = false;
  formMessage('accountProfileMessage');
  $('retryAccountProfileButton').hidden = true;
  $('retryAccountProfileButton').disabled = true;
  const current = () => currentEpoch === epoch && request === accountProfileRequest && view === 'account' && requestedMemberId === memberId;
  try {
    const profile = await api.profile({ signal: accountProfileAbort.signal });
    if (!current()) return;
    renderAccountProfile(profile);
  } catch (error) {
    if (!current() || error.name === 'AbortError') return;
    if (error.status === 401) {
      if (renewed) return logout(error.message);
      await renewOrLogout(error.message, true);
      if (current() && api.token) {
        accountProfileBusy = false;
        return loadAccountProfile({ renewed: true });
      }
      return;
    }
    if (error.status === 403) return logout(error.message);
    const message = error.message || 'Não foi possível carregar seus dados. Confira a conexão e tente novamente.';
    formMessage('accountProfileMessage', message + (accountProfileLoaded ? ' Os dados exibidos são da última consulta.' : ''));
    $('retryAccountProfileButton').hidden = false;
  } finally {
    if (current()) {
      accountProfileBusy = false;
      accountProfileAbort = null;
      $('accountProfileLoading').hidden = true;
      $('retryAccountProfileButton').disabled = false;
    }
  }
}

async function submitDeleteAccount(event) {
  event.preventDefault();
  if (view !== 'account' || accountBusy || !validSession()) return;
  const senha = $('deletePassword').value;
  if (!senha || new TextEncoder().encode(senha).length > 72) return formMessage('deleteAccountMessage', 'Informe sua senha atual para confirmar a exclusão.');
  if (!$('deleteConfirmation').checked) return formMessage('deleteAccountMessage', 'Marque a confirmação de exclusão permanente para continuar.');
  const currentEpoch = epoch;
  cancelAccountProfile();
  accountBusy = true;
  accountAbort = new AbortController();
  for (const id of ['deleteAccountButton', 'accountBackButton', 'cancelDeleteAccountButton', 'retryAccountProfileButton']) $(id).disabled = true;
  $('deleteAccountButton').querySelector('span').textContent = 'Excluindo cadastro...';
  formMessage('deleteAccountMessage');
  try {
    const result = await api.deleteAccount(senha, { signal: accountAbort.signal });
    if (currentEpoch !== epoch || view !== 'account') return;
    if (result?.deleted !== true) throw new Error('O servidor não confirmou a exclusão. Tente novamente.');
    logout('Seu cadastro foi excluído. Seu acesso e os dados deste aplicativo foram removidos.');
    $('email').value = '';
    $('loginMessage').dataset.state = 'success';
  } catch (error) {
    if (currentEpoch !== epoch || view !== 'account' || error.name === 'AbortError') return;
    formMessage('deleteAccountMessage', error.message || 'Não foi possível confirmar a exclusão. Confira a conexão e tente novamente.');
  } finally {
    if (currentEpoch === epoch && view === 'account') {
      accountBusy = false;
      $('deletePassword').value = '';
      for (const id of ['deleteAccountButton', 'accountBackButton', 'cancelDeleteAccountButton', 'retryAccountProfileButton']) $(id).disabled = false;
      if (!accountProfileLoaded) $('retryAccountProfileButton').hidden = false;
      $('deleteAccountButton').querySelector('span').textContent = 'Excluir minha conta';
    }
  }
}

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
  const requestTicket = {};
  identificationRequests.add(requestTicket);
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
    if (error.status === 401) return renewOrLogout(error.message, true);
    if (error.status === 403) return logout(error.message);
    $('qrLoading').textContent = 'Seu QR Code ainda não está disponível.';
    readingStatus('QR Code indisponível', 'error');
    qrMessage(error.message || 'Não foi possível carregar seu QR Code.', true);
  } finally {
    identificationRequests.delete(requestTicket);
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
  const requestTicket = {};
  identificationRequests.add(requestTicket);
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
    if (error.status === 401) return renewOrLogout(error.message, true);
    $('credentialMessage').textContent = error.message || 'Sua credencial não pôde ser conferida. Tente novamente.';
    $('credentialMessage').hidden = false;
    $('retryCredentialButton').hidden = false;
  } finally {
    identificationRequests.delete(requestTicket);
    if (currentEpoch === epoch && request === credentialRequest) $('credentialLoading').hidden = true;
  }
}

function resetLogin(message = '') {
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
  loginBusy = false;
  observer.stop();
  pullRefresh.reset();
  identificationRequests.clear();
  clearRegistration();
  clearAccountForm();
  clearAccountProfile();
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
  $('loginMessage').dataset.state = 'error';
  $('loginButton').disabled = false;
  $('openRegistrationButton').disabled = false;
  $('loginButton').querySelector('span').textContent = 'Entrar';
  showView('login');
}

function logout(message = '') {
  const previous = savedRecord;
  savedRecord = null;
  $('rememberMe').checked = false;
  resetLogin(message);
  forgetTask = (async () => {
    try { await savedSession.clear(); }
    catch { $('loginMessage').textContent = 'Não foi possível apagar o acesso salvo neste aparelho. Tente novamente.'; $('loginMessage').hidden = false; }
    await api.logout(previous?.refreshToken).catch(() => {});
  })();
}

function accessDetails(access) {
  const expiration = new Date(access?.expiresAt).getTime();
  if (typeof access?.token !== 'string' || !access.token || !Number.isFinite(expiration) || expiration <= Date.now() || !/^[1-9]\d{0,9}$/.test(String(access.membro?.id))) {
    throw new Error('O servidor devolveu um acesso inválido. Tente novamente.');
  }
  return { expiration, id: String(access.membro.id) };
}

function useAccess(access) {
  const details = accessDetails(access);
  if (accountProfileMemberId && accountProfileMemberId !== details.id) clearAccountProfile();
  clearTimeout(expiryTimer);
  api.token = access.token;
  expiresAt = details.expiration;
  memberId = details.id;
  $('senha').value = '';
  $('memberName').textContent = access.membro.nome || 'Membro';
  expiryTimer = setTimeout(() => renewOrLogout('Seu acesso expirou. Entre novamente.'), Math.min(expiresAt - Date.now(), 86400000));
}

function renewOrLogout(message, rejected = false) {
  if (!savedRecord || (rejected && restoreTask)) return logout(message);
  observer.pause();
  return restoreSavedAccess();
}

function restoreSavedAccess() {
  if (restoreTask) return restoreTask;
  const currentEpoch = epoch;
  restoreTask = (async () => {
    try {
      await forgetTask;
      if (currentEpoch !== epoch) return;
      const record = await savedSession.load();
      if (currentEpoch !== epoch) return;
      if (!record) {
        savedRecord = null;
        if (api.token && Date.now() >= expiresAt) logout('Seu acesso expirou. Entre novamente.');
        return;
      }
      savedRecord = record;
      $('rememberMe').checked = true;
      $('loginButton').disabled = true;
      $('loginButton').querySelector('span').textContent = 'Retomando acesso...';
      observer.pause();
      const access = await api.refresh(record.refreshToken);
      if (currentEpoch !== epoch) return;
      useAccess(access);
      if (view !== 'account') await loadQrCode();
    } catch (error) {
      if (currentEpoch !== epoch) return;
      if (error.status === 401 || error.status === 403) logout(error.message);
      else resetLogin(error.message || 'Não foi possível retomar o acesso salvo. Verifique a conexão.');
    } finally {
      if (currentEpoch === epoch) {
        $('loginButton').disabled = false;
        $('loginButton').querySelector('span').textContent = 'Entrar';
      }
    }
  })().finally(() => { restoreTask = null; });
  return restoreTask;
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (view !== 'login' || loginBusy) return;
  loginBusy = true;
  const currentEpoch = ++epoch;
  $('loginButton').disabled = true;
  $('openRegistrationButton').disabled = true;
  $('loginButton').querySelector('span').textContent = 'Entrando...';
  $('loginMessage').hidden = true;
  $('loginMessage').dataset.state = 'error';
  const rememberMe = $('rememberMe').checked;
  let access;
  try {
    await forgetTask;
    if (currentEpoch !== epoch) return;
    api.clear();
    access = await api.login($('email').value.trim(), $('senha').value, rememberMe);
    if (currentEpoch !== epoch) {
      if (access?.refreshToken) await api.logout(access.refreshToken).catch(() => {});
      return;
    }
    accessDetails(access);
    const previous = savedRecord;
    const nextSavedRecord = rememberMe ? await savedSession.save(access) : (await savedSession.clear(), null);
    if (currentEpoch !== epoch) {
      if (access?.refreshToken) await api.logout(access.refreshToken).catch(() => {});
      return;
    }
    savedRecord = nextSavedRecord;
    if (Capacitor.isNativePlatform() && previous?.refreshToken && previous.refreshToken !== savedRecord?.refreshToken) {
      api.logout(previous.refreshToken).catch(() => {});
    }
    useAccess(access);
    await loadQrCode();
  } catch (error) {
    if (currentEpoch !== epoch) return;
    if (access?.refreshExpiresAt) {
      forgetTask = (async () => {
        await savedSession.clear().catch(() => {});
        await api.logout(access.refreshToken).catch(() => {});
      })();
    }
    $('loginMessage').textContent = error.message || 'Não foi possível entrar. Verifique a conexão.';
    $('loginMessage').hidden = false;
  } finally {
    if (currentEpoch === epoch) {
      loginBusy = false;
      $('loginButton').disabled = false;
      $('openRegistrationButton').disabled = false;
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
$('openRegistrationButton').addEventListener('click', openRegistration);
$('registrationBackButton').addEventListener('click', closeRegistration);
$('registrationCancelButton').addEventListener('click', closeRegistration);
$('registrationLoginButton').addEventListener('click', closeRegistration);
$('retryRegistrationConfigButton').addEventListener('click', loadRegistrationConfig);
$('registrationForm').addEventListener('submit', submitRegistration);
$('registrationBirth').addEventListener('input', maskBirthDate);
$('qrAccountButton').addEventListener('click', openAccount);
$('credentialAccountButton').addEventListener('click', openAccount);
$('accountBackButton').addEventListener('click', closeAccount);
$('retryAccountProfileButton').addEventListener('click', () => loadAccountProfile());
$('cancelDeleteAccountButton').addEventListener('click', closeAccount);
$('deleteAccountForm').addEventListener('submit', submitDeleteAccount);
for (const [button, input, label] of [['toggleRegistrationPassword', 'registrationPassword', 'nova senha'], ['toggleDeletePassword', 'deletePassword', 'senha atual']]) {
  $(button).addEventListener('click', () => {
    const visible = $(input).type === 'password';
    $(input).type = visible ? 'text' : 'password';
    $(button).setAttribute('aria-pressed', String(visible));
    $(button).setAttribute('aria-label', `${visible ? 'Ocultar' : 'Mostrar'} ${label}`);
  });
}
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
  if (!active) pullRefresh.reset();
  if (active && view === 'login' && !api.token && savedRecord) { restoreSavedAccess(); return; }
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
  else if (view === 'login' && savedRecord) restoreSavedAccess();
});
if (Capacitor.isNativePlatform()) {
  App.addListener('appStateChange', ({ isActive }) => setForeground(isActive)).catch(() => {});
  App.addListener('backButton', () => {
    if (view === 'registration') closeRegistration();
    else if (view === 'account') closeAccount();
    else if (['credential', 'confirmation'].includes(view) && api.token) loadQrCode();
    else App.minimizeApp().catch(() => {});
  }).catch(() => {});
}
configurePublicLinks();
restoreSavedAccess();
