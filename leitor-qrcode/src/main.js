import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SERVER_URL } from './config.js';
import { ReaderApi } from './api.js';
import { ScanController } from './scan-controller.js';
import { createCamera } from './camera.js';
import { SavedSession } from '../../mobile-shared/session.js';
import './styles.css';

const $ = id => document.getElementById(id);
const api = new ReaderApi(SERVER_URL);
const savedSession = new SavedSession({ app: 'leitor', serverUrl: SERVER_URL,
  native: Capacitor.isNativePlatform(), secure: registerPlugin('SecureSession') });
let sessionEpoch = 0;
let expiryTimer;
let sessionExpiresAt = 0;
let camera;
let cameraWanted = false;
let cameraTask;
let cameraFailure = '';
let foreground = !document.hidden;
let torch = false;
let activeScreen = 'login';
let rememberedSession = null;
let sessionTask = null;
let forgetTask = Promise.resolve();
let loginPending = false;
const periodLabels = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };

function showScreen(screen) {
  activeScreen = screen;
  $('loginScreen').hidden = screen !== 'login';
  $('homeScreen').hidden = screen !== 'home';
  $('scannerScreen').hidden = screen !== 'scanner';
  if (screen !== 'scanner') document.documentElement.classList.remove('native-camera-active');
}

function hasValidSession() {
  if (!api.token) return false;
  if (Date.now() >= sessionExpiresAt) {
    renewAccess();
    return false;
  }
  return true;
}

function validateAccess(result) {
  const expiration = new Date(result?.expiresAt).getTime();
  if (typeof result?.token !== 'string' || !result.token || !Number.isFinite(expiration) || expiration <= Date.now()) {
    throw new Error('O servidor devolveu um acesso inválido. Tente novamente.');
  }
  return expiration;
}

function applyAccess(result, initial = true) {
  const expiration = validateAccess(result);
  api.token = result.token;
  sessionExpiresAt = expiration;
  clearTimeout(expiryTimer);
  $('senha').value = '';
  if (initial) {
    showScreen('home');
    cameraWanted = false;
    $('cameraPlaceholder').hidden = false;
    controller.activate();
  } else if (!controller.active) controller.activate();
  connection(navigator.onLine === false ? 'Sem conexão' : 'Conectado', navigator.onLine === false ? 'offline' : 'online');
  const renewEarly = rememberedSession ? 5000 : 0;
  expiryTimer = setTimeout(renewAccess, Math.max(1, Math.min(expiration - Date.now() - renewEarly, 86400000)));
}

function renewAccess() {
  if (!rememberedSession) return logout('Seu acesso expirou. Entre novamente.');
  return restoreSavedAccess(true);
}

function restoreSavedAccess(renewing = false) {
  if (loginPending) return Promise.resolve(false);
  if (sessionTask) return sessionTask.promise;
  const epoch = sessionEpoch;
  const task = { promise: null };
  sessionTask = task;
  if (activeScreen === 'login') {
    $('loginButton').disabled = true;
    $('loginButton').querySelector('span').textContent = 'Retomando acesso…';
  }
  task.promise = (async () => {
    try {
      const saved = rememberedSession || await savedSession.load();
      if (epoch !== sessionEpoch) return false;
      if (!saved) {
        if (renewing) logout('Seu acesso expirou. Entre novamente.');
        return false;
      }
      const refreshExpiration = new Date(saved.refreshExpiresAt).getTime();
      if (!Number.isFinite(refreshExpiration) || refreshExpiration <= Date.now()) {
        logout('Seu acesso salvo expirou. Entre novamente.');
        return false;
      }
      rememberedSession = saved;
      $('rememberMe').checked = true;
      const result = await api.refresh(saved.refreshToken);
      if (epoch !== sessionEpoch) return false;
      validateAccess(result);
      // The saved credential has a fixed validity and is not rotated on renewal.
      // Keeping it unchanged also preserves login through a lost network response.
      applyAccess(result, !renewing || activeScreen === 'login');
      $('loginMessage').hidden = true;
      syncCamera();
      return true;
    } catch (error) {
      if (epoch !== sessionEpoch) return false;
      if (error.status === 401 || error.status === 403) {
        logout(error.message || 'Seu acesso salvo foi encerrado. Entre novamente.');
      } else if (renewing && api.token && Date.now() < sessionExpiresAt) {
        expiryTimer = setTimeout(() => restoreSavedAccess(true), Math.max(1000, Math.min(30000, sessionExpiresAt - Date.now())));
      } else {
        resetLogin(error.message || 'Não foi possível retomar seu acesso. Verifique a conexão.', false);
      }
      return false;
    } finally {
      if (sessionTask === task) sessionTask = null;
      if (epoch === sessionEpoch && activeScreen === 'login') {
        $('loginButton').disabled = false;
        $('loginButton').querySelector('span').textContent = 'Entrar';
      }
    }
  })();
  return task.promise;
}

function openScanner() {
  if (!hasValidSession()) return;
  showScreen('scanner');
  cameraWanted = true;
  syncCamera();
}

function backToHome() {
  if (!hasValidSession()) return;
  cameraWanted = false;
  showScreen('home');
  syncCamera();
}

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
    if (state.kind === 'expired') return rememberedSession ? restoreSavedAccess(true) : logout(state.message);
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
      const desired = Boolean(cameraWanted && activeScreen === 'scanner' && foreground && api.token);
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
        camera ||= await createCamera({ onRead: raw => { if (cameraWanted && activeScreen === 'scanner' && foreground && hasValidSession()) controller.read(raw); }, onError: cameraError });
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

function resetLogin(message = '', forget = true) {
  sessionEpoch++;
  sessionTask = null;
  loginPending = false;
  clearTimeout(expiryTimer);
  sessionExpiresAt = 0;
  controller.deactivate();
  api.clear();
  cameraWanted = false;
  cameraFailure = '';
  syncCamera();
  showScreen('login');
  $('senha').value = '';
  $('senha').type = 'password';
  $('togglePassword').setAttribute('aria-pressed', 'false');
  $('togglePassword').setAttribute('aria-label', 'Mostrar senha');
  $('loginMessage').textContent = message;
  $('loginMessage').hidden = !message;
  $('loginButton').disabled = false;
  $('loginButton').querySelector('span').textContent = 'Entrar';
  $('lastAttendance').hidden = true;
  $('waitingState').hidden = false;
  showScanMessage('');
  document.documentElement.classList.remove('native-camera-active');
  if (forget) {
    const remembered = rememberedSession;
    const refresh = remembered ? Promise.resolve(remembered) : savedSession.load().catch(() => null);
    rememberedSession = null;
    $('rememberMe').checked = false;
    // Removal is queued before another login can save a new credential.
    const removal = savedSession.clear();
    forgetTask = Promise.allSettled([refresh, removal]).then(async results => {
      const saved = results[0].status === 'fulfilled' ? results[0].value : null;
      await api.logout(saved?.refreshToken).catch(() => {});
    });
  }
}

function logout(message = '') {
  resetLogin(message, true);
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const epoch = ++sessionEpoch;
  loginPending = true;
  sessionTask = null;
  clearTimeout(expiryTimer);
  const rememberMe = $('rememberMe').checked === true;
  $('loginButton').disabled = true;
  $('loginButton').querySelector('span').textContent = 'Verificando acesso…';
  $('loginMessage').hidden = true;
  try {
    await forgetTask;
    if (epoch !== sessionEpoch) return;
    api.clear();
    const result = await api.login($('email').value.trim(), $('senha').value, rememberMe);
    if (epoch !== sessionEpoch) return;
    validateAccess(result);
    $('senha').value = '';
    if (rememberMe) {
      rememberedSession = { refreshToken: result.refreshToken, refreshExpiresAt: result.refreshExpiresAt };
      let saved;
      try { saved = await savedSession.save(result); }
      catch {
        if (epoch === sessionEpoch) logout('Não foi possível salvar o acesso neste aparelho. Entre novamente sem marcar Mantenha-me conectado.');
        return;
      }
      if (epoch !== sessionEpoch) return;
      rememberedSession = saved;
    } else {
      await savedSession.clear();
      if (epoch !== sessionEpoch) return;
      rememberedSession = null;
    }
    applyAccess(result);
  } catch (error) {
    if (epoch !== sessionEpoch) return;
    $('loginMessage').textContent = error.message || 'Não foi possível entrar. Verifique a conexão.';
    $('loginMessage').hidden = false;
  } finally {
    if (epoch === sessionEpoch) {
      loginPending = false;
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
$('homeLogoutButton').addEventListener('click', () => logout());
$('startScannerButton').addEventListener('click', openScanner);
$('backButton').addEventListener('click', backToHome);
$('retryButton').addEventListener('click', () => controller.retry());
$('restartCameraButton').addEventListener('click', () => { if (activeScreen === 'scanner') openScanner(); });
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
  if (value && api.token && Date.now() >= sessionExpiresAt) return renewAccess();
  if (value && !api.token && rememberedSession && !sessionTask) restoreSavedAccess();
  syncCamera();
  if (value) updatePeriod();
}
document.addEventListener('visibilitychange', () => setForeground(!document.hidden));
window.addEventListener('offline', () => { connection('Sem conexão', 'offline'); if (api.token) showScanMessage('Sem conexão. Nenhuma leitura será confirmada até o servidor responder.'); });
window.addEventListener('online', () => {
  connection('Aguardando confirmação', 'neutral');
  if (foreground && !api.token && rememberedSession) restoreSavedAccess();
});
window.addEventListener('pagehide', () => setForeground(false));
window.addEventListener('pageshow', event => { if (event.persisted && api.token) setForeground(!document.hidden); });
if (Capacitor.isNativePlatform()) {
  App.addListener('appStateChange', ({ isActive }) => setForeground(isActive)).catch(() => {});
  App.addListener('backButton', () => {
    if (activeScreen === 'scanner' && api.token) backToHome();
    else App.minimizeApp().catch(() => {});
  }).catch(() => {});
}
updatePeriod();
setInterval(updatePeriod, 60000);
restoreSavedAccess();
