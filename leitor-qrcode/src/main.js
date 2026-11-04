import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SERVER_URL } from './config.js';
import { ReaderApi } from './api.js';
import { ScanController } from './scan-controller.js';
import { createCamera } from './camera.js';
import './styles.css';

const $ = id => document.getElementById(id);
const api = new ReaderApi(SERVER_URL);
let sessionEpoch = 0;
let expiryTimer;
let sessionExpiresAt = 0;
let camera;
let cameraWanted = false;
let cameraTask;
let cameraFailure = '';
let foreground = !document.hidden;
let torch = false;
const periodLabels = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };

function connection(text, state = 'neutral') {
  $('connectionText').textContent = text;
  $('connectionState').dataset.state = state;
}

function showScanMessage(text, state = 'error', retryable = false) {
  $('scanMessage').textContent = text;
  $('scanMessage').dataset.state = state;
  $('scanMessage').hidden = !text;
  $('retryButton').hidden = !retryable;
}

function renderAttendance(member) {
  $('waitingState').hidden = true;
  $('lastAttendance').hidden = false;
  $('confirmationText').textContent = member.alreadyRecorded ? 'Presença já confirmada' : 'Presença confirmada';
  $('confirmationTitle').dataset.duplicate = String(Boolean(member.alreadyRecorded));
  const names = String(member.nome || 'Membro').trim().split(/\s+/);
  $('memberInitials').textContent = (names[0][0] + (names.length > 1 ? names.at(-1)[0] : '')).toLocaleUpperCase('pt-BR');
  $('memberName').textContent = member.nome || 'Membro';
  $('memberRole').textContent = [member.cargo || 'Membro', member.ministerio ? `Ministério de ${member.ministerio}` : null].filter(Boolean).join(' • ');
  $('memberRegistration').textContent = member.matricula ? `Matrícula ${member.matricula}` : '';
  $('memberRegistration').hidden = !member.matricula;
  $('memberTime').textContent = [periodLabels[member.periodo], member.data, member.horario].filter(Boolean).join(' • ');
  $('nextReading').textContent = cameraWanted ? 'Pronto para a próxima leitura' : 'Ative a câmera para continuar';
}

const controller = new ScanController({
  serverUrl: SERVER_URL,
  register: id => api.register(id),
  online: () => navigator.onLine !== false,
  onState: state => {
    if (state.kind === 'expired') return logout(state.message);
    if (state.kind === 'sending') {
      showScanMessage(state.message, 'sending');
      $('nextReading').textContent = 'Confirmando a próxima presença…';
    } else if (state.kind === 'confirmed') {
      showScanMessage('');
      renderAttendance(state.attendance);
      connection('Conectado', 'online');
      navigator.vibrate?.(40);
    } else {
      showScanMessage(state.message, 'error', state.retryable);
      $('nextReading').textContent = cameraWanted ? 'Câmera pronta para outra leitura' : 'Ative a câmera para continuar';
      if (navigator.onLine === false) connection('Sem conexão', 'offline');
      else if (state.kind === 'error') connection('Verifique o aviso', 'neutral');
    }
  }
});

function cameraError(error) {
  cameraWanted = false;
  cameraFailure = error?.message || 'Não foi possível acessar a câmera. Verifique a permissão do aplicativo.';
  $('cameraPlaceholder').hidden = false;
  $('cameraMessage').textContent = cameraFailure;
  $('restartCameraButton').hidden = false;
  $('torchButton').hidden = true;
  $('nextReading').textContent = 'Ative a câmera para continuar';
  syncCamera();
}

function syncCamera() {
  if (cameraTask) return cameraTask;
  cameraTask = (async () => {
    for (;;) {
      const desired = Boolean(cameraWanted && foreground && api.token);
      if (!desired) {
        if (camera?.running) await camera.stop().catch(() => {});
        if (cameraWanted && foreground && api.token) continue;
        torch = false;
        $('torchButton').setAttribute('aria-pressed', 'false');
        $('torchButton').hidden = true;
        if (api.token) {
          $('cameraPlaceholder').hidden = false;
          $('cameraMessage').textContent = cameraFailure || (foreground ? 'Câmera pausada' : 'Câmera pausada enquanto o aplicativo está em segundo plano');
        }
        return;
      }
      if (camera?.running) return;
      const epoch = sessionEpoch;
      try {
        $('restartCameraButton').hidden = true;
        cameraFailure = '';
        $('cameraMessage').textContent = 'Preparando câmera…';
        camera ||= await createCamera({ onRead: raw => { if (foreground && api.token) controller.read(raw); }, onError: cameraError });
        if (epoch !== sessionEpoch || !cameraWanted || !foreground || !api.token) continue;
        await camera.start();
        if (epoch !== sessionEpoch || !cameraWanted || !foreground || !api.token) {
          await camera.stop().catch(() => {});
          continue;
        }
        $('cameraPlaceholder').hidden = true;
        const hasTorch = await camera.hasTorch().catch(() => false);
        if (epoch !== sessionEpoch || !cameraWanted || !foreground || !api.token) continue;
        $('torchButton').hidden = !hasTorch;
        $('nextReading').textContent = 'Pronto para a próxima leitura';
        return;
      } catch (error) {
        if (epoch !== sessionEpoch && cameraWanted && foreground && api.token) continue;
        if (epoch === sessionEpoch && api.token) {
          cameraWanted = false;
          cameraFailure = error?.message || 'Não foi possível acessar a câmera. Verifique a permissão do aplicativo.';
          $('cameraPlaceholder').hidden = false;
          $('cameraMessage').textContent = cameraFailure;
          $('restartCameraButton').hidden = false;
        }
        return;
      }
    }
  })().finally(() => { cameraTask = null; });
  return cameraTask;
}

function logout(message = '') {
  sessionEpoch++;
  clearTimeout(expiryTimer);
  sessionExpiresAt = 0;
  controller.deactivate();
  api.clear();
  cameraWanted = false;
  cameraFailure = '';
  syncCamera();
  $('scannerScreen').hidden = true;
  $('loginScreen').hidden = false;
  $('senha').value = '';
  $('senha').type = 'password';
  $('togglePassword').setAttribute('aria-pressed', 'false');
  $('togglePassword').setAttribute('aria-label', 'Mostrar senha');
  $('loginMessage').textContent = message;
  $('loginMessage').hidden = !message;
  $('loginButton').disabled = false;
  $('loginButton').querySelector('span').textContent = 'Escanear QRCODE';
  $('lastAttendance').hidden = true;
  $('waitingState').hidden = false;
  showScanMessage('');
  document.documentElement.classList.remove('native-camera-active');
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const epoch = ++sessionEpoch;
  $('loginButton').disabled = true;
  $('loginButton').querySelector('span').textContent = 'Verificando acesso…';
  $('loginMessage').hidden = true;
  try {
    const result = await api.login($('email').value.trim(), $('senha').value);
    if (epoch !== sessionEpoch) return;
    const expiration = new Date(result.expiresAt).getTime();
    if (typeof result.token !== 'string' || !result.token || !Number.isFinite(expiration) || expiration <= Date.now()) throw new Error('O servidor devolveu um acesso inválido. Tente novamente.');
    api.token = result.token;
    sessionExpiresAt = expiration;
    $('senha').value = '';
    $('loginScreen').hidden = true;
    $('scannerScreen').hidden = false;
    $('cameraPlaceholder').hidden = false;
    controller.activate();
    connection(navigator.onLine === false ? 'Sem conexão' : 'Conectado', navigator.onLine === false ? 'offline' : 'online');
    expiryTimer = setTimeout(() => logout('Seu acesso expirou. Entre novamente.'), Math.min(expiration - Date.now(), 86400000));
    cameraWanted = true;
    syncCamera();
  } catch (error) {
    if (epoch !== sessionEpoch) return;
    $('loginMessage').textContent = error.message || 'Não foi possível entrar. Verifique a conexão.';
    $('loginMessage').hidden = false;
  } finally {
    if (epoch === sessionEpoch) {
      $('loginButton').disabled = false;
      $('loginButton').querySelector('span').textContent = 'Escanear QRCODE';
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
$('retryButton').addEventListener('click', () => controller.retry());
$('restartCameraButton').addEventListener('click', () => { cameraWanted = true; syncCamera(); });
$('torchButton').addEventListener('click', async () => {
  if (!camera?.running) return;
  const epoch = sessionEpoch;
  try {
    await camera.setTorch(!torch);
    if (epoch !== sessionEpoch || !camera.running) return;
    torch = !torch;
    $('torchButton').setAttribute('aria-pressed', String(torch));
  } catch { showScanMessage('A lanterna não está disponível nesta câmera.'); }
});

function updatePeriod() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  $('currentPeriod').textContent = hour < 12 ? 'Manhã' : hour < 18 ? 'Tarde' : 'Noite';
}
function setForeground(value) {
  foreground = value;
  if (value && api.token && Date.now() >= sessionExpiresAt) return logout('Seu acesso expirou. Entre novamente.');
  syncCamera();
  if (value) updatePeriod();
}
document.addEventListener('visibilitychange', () => setForeground(!document.hidden));
window.addEventListener('offline', () => { connection('Sem conexão', 'offline'); if (api.token) showScanMessage('Sem conexão. Nenhuma leitura será confirmada até o servidor responder.'); });
window.addEventListener('online', () => connection('Aguardando confirmação', 'neutral'));
window.addEventListener('pagehide', () => { cameraWanted = false; syncCamera(); });
window.addEventListener('pageshow', event => { if (event.persisted && api.token) { cameraWanted = true; setForeground(!document.hidden); } });
if (Capacitor.isNativePlatform()) App.addListener('appStateChange', ({ isActive }) => setForeground(isActive)).catch(() => {});
updatePeriod();
setInterval(updatePeriod, 60000);
