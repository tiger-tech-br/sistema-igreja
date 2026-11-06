import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ScanController } from '../src/scan-controller.js';

// Executa o controlador real da tela, substituindo somente câmera, rede e DOM.
// Nenhum teste usa servidor, credenciais ou câmera de verdade.
const script = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const server = 'https://igreja.example';
const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

async function settle(until = () => false) {
  for (let step = 0; step < 60; step++) {
    await Promise.resolve();
    if (until()) return;
  }
}

function fixture({ startGate, stopGate, native = false, storage = { record: null }, loadGate, saveError,
  refresh, logoutGate, register = async id => ({ id, nome: 'Membro de teste', periodo: 'noite', horario: '19:42:00' }) } = {}) {
  const elements = new Map();
  const docHandlers = new Map();
  const windowHandlers = new Map();
  const classes = new Set();
  const appHandlers = new Map();
  const timers = new Map();
  let clock = Date.now();
  let nextTimer = 0;
  let loginCalls = 0;
  let minimized = 0;
  const savedCalls = { loads: 0, saves: [], clears: 0, refreshes: [], logouts: [], logins: [], events: [] };
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const camera = {
    running: false, starts: 0, stops: 0,
    async start() { this.starts++; if (startGate) await startGate.promise; this.running = true; },
    async stop() { this.stops++; if (stopGate) await stopGate.promise; this.running = false; },
    async hasTorch() { return true; },
    async setTorch() {}
  };
  function element(id, tag = '', attributes = '') {
    const handlers = new Map(), values = new Map();
    for (const match of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) values.set(match[1], match[2]);
    const result = {
      id, tag, dataset: {}, textContent: '', value: '', disabled: false,
      checked: /\bchecked(?:\s|>|$)/.test(attributes),
      hidden: /\bhidden(?:\s|>|$)/.test(attributes),
      type: values.get('type') || (tag === 'button' ? 'submit' : ''),
      addEventListener(name, handler) { handlers.set(name, handler); },
      setAttribute(name, value) { values.set(name, value); },
      getAttribute(name) { return values.get(name); },
      querySelector(selector) {
        if (selector !== 'span') throw new Error('Seletor inesperado no teste');
        return this.label ||= { textContent: '' };
      },
      async fire(name, event = {}) { return handlers.get(name)?.({ preventDefault() {}, ...event }); }
    };
    elements.set(id, result);
    return result;
  }
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) element(match[3], match[1], match[2]);
  const document = {
    hidden: false,
    getElementById(id) { assert.ok(elements.has(id), `Elemento existente: ${id}`); return elements.get(id); },
    documentElement: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } },
    addEventListener(name, handler) { docHandlers.set(name, handler); }
  };
  class FakeApi {
    constructor() { this.token = null; }
    async login(email, senha, rememberMe) {
      loginCalls++;
      savedCalls.events.push('login');
      savedCalls.logins.push({ email, senha, rememberMe });
      return { token: 'fixture-only', expiresAt: new Date(clock + 7200000).toISOString(),
        ...(rememberMe ? { refreshToken: 'saved-fixture-token', refreshExpiresAt: new Date(clock + 30 * 86400000).toISOString() } : {}) };
    }
    async refresh(token) {
      savedCalls.refreshes.push(token);
      if (refresh) return refresh(token, clock);
      return { token: 'restored-fixture-token', expiresAt: new Date(clock + 7200000).toISOString(),
        refreshExpiresAt: storage.record?.refreshExpiresAt };
    }
    async logout(token) {
      savedCalls.logouts.push(token);
      savedCalls.events.push('logout-start');
      if (logoutGate) await logoutGate.promise;
      savedCalls.events.push('logout-end');
      return { loggedOut: true };
    }
    register(id) { return register(id); }
    clear() { this.token = null; savedCalls.events.push('clear-api'); }
  }
  class FakeSavedSession {
    async load() {
      savedCalls.loads++;
      if (loadGate) await loadGate.promise;
      return storage.record ? { ...storage.record } : null;
    }
    async save(access) {
      savedCalls.saves.push(access);
      if (saveError) throw saveError;
      storage.record = { refreshToken: access.refreshToken, refreshExpiresAt: access.refreshExpiresAt };
      return { ...storage.record };
    }
    async clear() { savedCalls.clears++; storage.record = null; }
  }
  const context = vm.createContext({
    document,
    window: { addEventListener(name, handler) { windowHandlers.set(name, handler); } },
    navigator: { onLine: true, vibrate() {} },
    Capacitor: { isNativePlatform: () => native },
    registerPlugin: () => ({}), SavedSession: FakeSavedSession,
    App: {
      async addListener(name, handler) { appHandlers.set(name, handler); },
      async minimizeApp() { minimized++; }
    }, SERVER_URL: server,
    ReaderApi: FakeApi, ScanController,
    createCamera: async callbacks => { Object.assign(camera, callbacks); return camera; },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() { return 2; },
    URL, Intl, Date: FixtureDate, console
  });
  vm.runInContext(script, context, { filename: 'main.js' });
  return {
    camera, elements, classes, storage, savedCalls,
    async ready() { await settle(); },
    get loginCalls() { return loginCalls; }, get minimized() { return minimized; },
    async login() {
      await settle();
      elements.get('email').value = 'fixture@example.invalid';
      elements.get('senha').value = 'fixture-only';
      await elements.get('loginForm').fire('submit');
      await settle();
    },
    async openScanner() { await this.click('startScannerButton'); },
    async click(id) {
      const target = elements.get(id);
      await target.fire('click');
      const formMarkup = html.slice(html.indexOf('<form id="loginForm"'), html.indexOf('</form>'));
      if (target.type === 'submit' && formMarkup.includes(`id="${id}"`)) await elements.get('loginForm').fire('submit');
      await settle();
    },
    async visibility(hidden) {
      document.hidden = hidden;
      docHandlers.get('visibilitychange')?.();
      await settle();
    },
    async windowEvent(name, event = {}) {
      windowHandlers.get(name)?.(event);
      await settle();
    },
    async appEvent(name, event = {}) {
      appHandlers.get(name)?.(event);
      await settle();
    },
    advance(milliseconds) { clock += milliseconds; },
    async expire() {
      clock += 7200001;
      for (const callback of [...timers.values()]) callback();
      await settle();
    }
  };
}

test('Entrar abre a tela inicial e só Escanear QRCode abre a câmera', async () => {
  const screen = fixture();
  assert.equal(screen.elements.get('loginScreen').hidden, false);
  assert.equal(screen.camera.starts, 0);
  await screen.login();
  assert.equal(screen.elements.get('loginButton').querySelector('span').textContent, 'Entrar');
  assert.equal(screen.elements.get('loginScreen').hidden, true);
  assert.equal(screen.elements.get('homeScreen').hidden, false);
  assert.equal(screen.elements.get('scannerScreen').hidden, true);
  assert.equal(screen.camera.starts, 0);
  await screen.visibility(true);
  await screen.visibility(false);
  await screen.windowEvent('pagehide');
  await screen.windowEvent('pageshow', { persisted: true });
  assert.equal(screen.camera.starts, 0);
  await screen.openScanner();
  assert.equal(screen.elements.get('homeScreen').hidden, true);
  assert.equal(screen.elements.get('scannerScreen').hidden, false);
  assert.equal(screen.camera.starts, 1);
  assert.equal(screen.camera.running, true);
  assert.equal(screen.loginCalls, 1);
});

test('Voltar desliga câmera e lanterna, mantém o acesso e bloqueia leituras atrasadas', async () => {
  const registrations = [];
  const screen = fixture({ register: async id => {
    registrations.push(id);
    return { id, nome: 'Membro confirmado' };
  } });
  await screen.login();
  await screen.openScanner();
  await screen.click('torchButton');
  assert.equal(screen.elements.get('torchButton').getAttribute('aria-pressed'), 'true');
  await screen.click('backButton');
  assert.equal(screen.camera.running, false);
  assert.equal(screen.camera.stops, 1);
  assert.equal(screen.elements.get('homeScreen').hidden, false);
  assert.equal(screen.elements.get('scannerScreen').hidden, true);
  assert.equal(screen.elements.get('loginScreen').hidden, true);
  assert.equal(screen.elements.get('torchButton').getAttribute('aria-pressed'), 'false');
  screen.camera.onRead(`${server}/validar?id=1`);
  await settle();
  assert.deepEqual(registrations, []);
  await screen.visibility(true);
  await screen.visibility(false);
  assert.equal(screen.camera.starts, 1);
  await screen.openScanner();
  screen.camera.onRead(`${server}/validar?id=2`);
  await settle(() => screen.elements.get('lastAttendance').hidden === false);
  assert.deepEqual(registrations, ['2']);
  assert.equal(screen.camera.starts, 2);
  assert.equal(screen.loginCalls, 1);
});

test('Voltar preserva uma confirmação pendente e a última presença ao reabrir', async () => {
  const registration = pending();
  const screen = fixture({ register: () => registration.promise });
  await screen.login();
  await screen.openScanner();
  screen.camera.onRead(`${server}/validar?id=1`);
  await screen.click('backButton');
  registration.resolve({ id: '1', nome: 'Presença recebida pelo servidor', periodo: 'noite' });
  await settle(() => screen.elements.get('lastAttendance').hidden === false);
  assert.equal(screen.elements.get('homeScreen').hidden, false);
  assert.equal(screen.elements.get('memberName').textContent, 'Presença recebida pelo servidor');
  await screen.openScanner();
  assert.equal(screen.elements.get('lastAttendance').hidden, false);
  assert.equal(screen.elements.get('memberName').textContent, 'Presença recebida pelo servidor');
  assert.equal(screen.elements.get('waitingState').hidden, true);
  assert.equal(screen.loginCalls, 1);
});

test('Voltar durante a abertura pendente fecha a câmera sem voltar ao login', async () => {
  const gate = pending();
  const screen = fixture({ startGate: gate });
  await screen.login();
  await screen.openScanner();
  assert.equal(screen.camera.starts, 1);
  await screen.click('backButton');
  gate.resolve();
  await settle(() => screen.camera.stops === 1 && !screen.camera.running);
  assert.equal(screen.elements.get('homeScreen').hidden, false);
  assert.equal(screen.elements.get('loginScreen').hidden, true);
  assert.equal(screen.camera.running, false);
  await screen.openScanner();
  assert.equal(screen.camera.starts, 2);
  assert.equal(screen.camera.running, true);
  assert.equal(screen.loginCalls, 1);
});

test('reabrir enquanto Voltar ainda encerra a câmera inicia somente uma nova captura', async () => {
  const gate = pending();
  const screen = fixture({ stopGate: gate });
  await screen.login();
  await screen.openScanner();
  await screen.click('backButton');
  assert.equal(screen.camera.stops, 1);
  await screen.openScanner();
  assert.equal(screen.camera.starts, 1);
  gate.resolve();
  await settle(() => screen.camera.starts === 2 && screen.camera.running);
  assert.equal(screen.camera.starts, 2);
  assert.equal(screen.camera.stops, 1);
  assert.equal(screen.elements.get('scannerScreen').hidden, false);
  assert.equal(screen.elements.get('cameraPlaceholder').hidden, true);
});

test('Sair nas duas telas encerra o acesso e a câmera sem reaproveitar a sessão anterior', async () => {
  for (const logoutButton of ['homeLogoutButton', 'logoutButton']) {
    const screen = fixture();
    await screen.login();
    if (logoutButton === 'logoutButton') await screen.openScanner();
    await screen.click(logoutButton);
    assert.equal(screen.elements.get('loginScreen').hidden, false);
    assert.equal(screen.elements.get('homeScreen').hidden, true);
    assert.equal(screen.elements.get('scannerScreen').hidden, true);
    assert.equal(screen.camera.running, false);
    assert.equal(screen.elements.get('lastAttendance').hidden, true);
    const starts = screen.camera.starts;
    await screen.openScanner();
    assert.equal(screen.camera.starts, starts);
    assert.equal(screen.elements.get('loginScreen').hidden, false);
  }
});

test('a expiração funciona na tela inicial e impede abrir câmera com acesso vencido', async () => {
  const timedOut = fixture();
  await timedOut.login();
  await timedOut.expire();
  assert.equal(timedOut.elements.get('loginScreen').hidden, false);
  assert.match(timedOut.elements.get('loginMessage').textContent, /acesso expirou/);
  assert.equal(timedOut.camera.starts, 0);

  const suspendedTimer = fixture();
  await suspendedTimer.login();
  suspendedTimer.advance(7200001);
  await suspendedTimer.openScanner();
  assert.equal(suspendedTimer.elements.get('loginScreen').hidden, false);
  assert.match(suspendedTimer.elements.get('loginMessage').textContent, /acesso expirou/);
  assert.equal(suspendedTimer.camera.starts, 0);
});

test('o botão Voltar do Android também retorna à tela inicial sem encerrar o acesso', async () => {
  const screen = fixture({ native: true });
  await screen.login();
  await screen.openScanner();
  await screen.appEvent('backButton');
  assert.equal(screen.elements.get('homeScreen').hidden, false);
  assert.equal(screen.elements.get('loginScreen').hidden, true);
  assert.equal(screen.camera.running, false);
  assert.equal(screen.minimized, 0);
  await screen.appEvent('backButton');
  assert.equal(screen.minimized, 1);
  await screen.appEvent('appStateChange', { isActive: false });
  await screen.appEvent('appStateChange', { isActive: true });
  assert.equal(screen.camera.starts, 1);
  await screen.openScanner();
  assert.equal(screen.camera.running, true);
  assert.equal(screen.loginCalls, 1);
});

test('a última presença confirmada continua visível após uma leitura com falha', async () => {
  const screen = fixture({ register: async id => {
    if (id === '2') throw new Error('Falha de conexão simulada');
    return { id, nome: 'Primeiro membro', cargo: 'Membro', periodo: 'noite', data: '04/11/2026', horario: '19:42:00' };
  } });
  await screen.login();
  await screen.openScanner();
  screen.camera.onRead(`${server}/validar?id=1`);
  await settle(() => screen.elements.get('lastAttendance').hidden === false);
  assert.equal(screen.elements.get('memberName').textContent, 'Primeiro membro');
  screen.camera.onRead(`${server}/validar?id=2`);
  await settle(() => !screen.elements.get('scanMessage').hidden && screen.elements.get('scanMessage').dataset.state === 'error');
  assert.equal(screen.elements.get('lastAttendance').hidden, false);
  assert.equal(screen.elements.get('memberName').textContent, 'Primeiro membro');
  assert.match(screen.elements.get('scanMessage').textContent, /Falha de conexão/);
  assert.equal(screen.camera.starts, 1);
  assert.equal(screen.camera.stops, 0);
});

test('sair durante a abertura da câmera encerra a abertura pendente e mantém o login', async () => {
  const gate = pending();
  const screen = fixture({ startGate: gate });
  await screen.login();
  await screen.openScanner();
  assert.equal(screen.camera.starts, 1);
  assert.equal(screen.camera.running, false);
  await screen.click('logoutButton');
  gate.resolve();
  await settle(() => screen.camera.stops === 1 && !screen.camera.running);
  assert.equal(screen.camera.running, false);
  assert.equal(screen.camera.stops, 1);
  assert.equal(screen.elements.get('loginScreen').hidden, false);
  assert.equal(screen.elements.get('scannerScreen').hidden, true);
  assert.equal(screen.elements.get('senha').value, '');
});

test('voltar ao primeiro plano durante camera.stop retoma a câmera sem outro toque', async () => {
  const gate = pending();
  const screen = fixture({ stopGate: gate });
  await screen.login();
  await screen.openScanner();
  assert.equal(screen.camera.running, true);
  await screen.visibility(true);
  assert.equal(screen.camera.stops, 1);
  await screen.visibility(false);
  gate.resolve();
  await settle(() => screen.camera.starts === 2 && screen.camera.running);
  assert.equal(screen.camera.starts, 2);
  assert.equal(screen.camera.running, true);
  assert.equal(screen.elements.get('cameraPlaceholder').hidden, true);
});

test('erro de permissão continua visível e botão Ativar câmera permite tentar novamente', async () => {
  const gate = pending();
  const screen = fixture({ startGate: gate });
  await screen.login();
  await screen.openScanner();
  gate.reject(new Error('Permita o acesso à câmera nas configurações.'));
  await settle(() => screen.elements.get('restartCameraButton').hidden === false);
  assert.match(screen.elements.get('cameraMessage').textContent, /Permita o acesso/);
  await screen.visibility(true);
  await screen.visibility(false);
  assert.match(screen.elements.get('cameraMessage').textContent, /Permita o acesso/);
  assert.equal(screen.elements.get('restartCameraButton').hidden, false);
});

test('Mostrar senha é botão comum: alterna a visibilidade sem enviar o formulário', async () => {
  const screen = fixture();
  const toggle = screen.elements.get('togglePassword');
  assert.equal(toggle.type, 'button');
  assert.equal(screen.elements.get('senha').type, 'password');
  await screen.click('togglePassword');
  assert.equal(screen.elements.get('senha').type, 'text');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), 'Ocultar senha');
  assert.equal(screen.loginCalls, 0);
  await screen.click('togglePassword');
  assert.equal(screen.elements.get('senha').type, 'password');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(screen.loginCalls, 0);
});

test('Mantenha-me conectado começa desmarcado e o login temporário não é salvo', async () => {
  const storage = { record: null };
  const screen = fixture({ storage });
  await screen.ready();
  assert.equal(screen.elements.get('rememberMe').type, 'checkbox');
  assert.equal(screen.elements.get('rememberMe').checked, false);
  assert.equal(screen.savedCalls.refreshes.length, 0);
  await screen.login();
  assert.equal(screen.savedCalls.logins[0].rememberMe, false);
  assert.equal(screen.savedCalls.saves.length, 0);
  assert.equal(storage.record, null);
  const reopened = fixture({ storage });
  await reopened.ready();
  assert.equal(reopened.elements.get('loginScreen').hidden, false);
  assert.equal(reopened.savedCalls.refreshes.length, 0);
});

test('a opção marcada salva apenas a credencial persistente e reabre na tela inicial sem câmera', async () => {
  const storage = { record: null };
  const screen = fixture({ native: true, storage });
  await screen.ready();
  screen.elements.get('rememberMe').checked = true;
  await screen.login();
  assert.equal(screen.savedCalls.logins[0].rememberMe, true);
  assert.equal(screen.savedCalls.saves.length, 1);
  assert.deepEqual(Object.keys(storage.record).sort(), ['refreshExpiresAt', 'refreshToken']);
  assert.equal(storage.record.refreshToken, 'saved-fixture-token');
  assert.equal(JSON.stringify(storage.record).includes('fixture-only'), false, 'nem senha nem token de acesso são persistidos');
  assert.equal(screen.elements.get('senha').value, '');
  const reopened = fixture({ native: true, storage });
  await reopened.ready();
  assert.equal(reopened.loginCalls, 0);
  assert.deepEqual(reopened.savedCalls.refreshes, ['saved-fixture-token']);
  assert.equal(reopened.elements.get('homeScreen').hidden, false);
  assert.equal(reopened.elements.get('loginScreen').hidden, true);
  assert.equal(reopened.elements.get('rememberMe').checked, true);
  assert.equal(reopened.camera.starts, 0);
  await reopened.openScanner();
  assert.equal(reopened.camera.starts, 1);
});

test('Sair apaga o acesso salvo, revoga a credencial e impede a restauração ao reabrir', async () => {
  const storage = { record: null };
  const screen = fixture({ storage });
  await screen.ready();
  screen.elements.get('rememberMe').checked = true;
  await screen.login();
  await screen.click('homeLogoutButton');
  assert.equal(storage.record, null);
  assert.equal(screen.elements.get('rememberMe').checked, false);
  assert.deepEqual(screen.savedCalls.logouts, ['saved-fixture-token']);
  const reopened = fixture({ storage });
  await reopened.ready();
  assert.equal(reopened.elements.get('loginScreen').hidden, false);
  assert.equal(reopened.savedCalls.refreshes.length, 0);
});

test('a renovação após duas horas mantém o leitor e a câmera da sessão lembrada', async () => {
  const screen = fixture();
  await screen.ready();
  screen.elements.get('rememberMe').checked = true;
  await screen.login();
  await screen.openScanner();
  await screen.expire();
  assert.deepEqual(screen.savedCalls.refreshes, ['saved-fixture-token']);
  assert.equal(screen.elements.get('scannerScreen').hidden, false);
  assert.equal(screen.elements.get('loginScreen').hidden, true);
  assert.equal(screen.camera.starts, 1);
  assert.equal(screen.camera.stops, 0);
  assert.equal(screen.storage.record.refreshToken, 'saved-fixture-token');
});

test('enquanto renova um acesso vencido, a câmera não envia uma presença com o token antigo', async () => {
  const gate = pending();
  const registrations = [];
  const screen = fixture({ refresh: () => gate.promise, register: async id => { registrations.push(id); return { id, nome: 'Confirmado' }; } });
  await screen.ready();
  screen.elements.get('rememberMe').checked = true;
  await screen.login();
  await screen.openScanner();
  await screen.expire();
  screen.camera.onRead(`${server}/validar?id=1`);
  await settle();
  assert.deepEqual(registrations, []);
  assert.equal(screen.savedCalls.refreshes.length, 1, 'uma renovação por vez');
  gate.resolve({ token: 'renewed-fixture', expiresAt: new Date(Date.now() + 14400000).toISOString() });
  await settle();
  screen.camera.onRead(`${server}/validar?id=1`);
  await settle();
  assert.deepEqual(registrations, ['1']);
});

test('falha de conexão ao restaurar mantém a credencial salva e retoma quando a conexão volta', async () => {
  const storage = { record: { refreshToken: 'saved-on-device', refreshExpiresAt: new Date(Date.now() + 86400000).toISOString() } };
  let attempts = 0;
  const screen = fixture({ storage, refresh: async (token, clock) => {
    if (++attempts === 1) throw new Error('Sem conexão com o servidor');
    return { token: 'restored', expiresAt: new Date(clock + 7200000).toISOString() };
  } });
  await screen.ready();
  assert.equal(screen.elements.get('loginScreen').hidden, false);
  assert.match(screen.elements.get('loginMessage').textContent, /Sem conexão/);
  assert.equal(screen.elements.get('rememberMe').checked, true);
  assert.equal(storage.record.refreshToken, 'saved-on-device');
  assert.equal(screen.savedCalls.logouts.length, 0);
  await screen.windowEvent('online');
  assert.equal(attempts, 2);
  assert.equal(screen.elements.get('homeScreen').hidden, false);
  assert.equal(screen.camera.starts, 0);
});

test('credencial salva expirada ou recusada é removida e exige novo login', async () => {
  const expiredStorage = { record: { refreshToken: 'expired', refreshExpiresAt: new Date(Date.now() - 1).toISOString() } };
  const expired = fixture({ storage: expiredStorage });
  await expired.ready();
  assert.equal(expiredStorage.record, null);
  assert.equal(expired.savedCalls.refreshes.length, 0);
  assert.equal(expired.elements.get('loginScreen').hidden, false);
  const revokedStorage = { record: { refreshToken: 'revoked', refreshExpiresAt: new Date(Date.now() + 86400000).toISOString() } };
  const revoked = fixture({ storage: revokedStorage, refresh: async () => {
    const error = new Error('Acesso revogado'); error.status = 401; throw error;
  } });
  await revoked.ready();
  assert.equal(revokedStorage.record, null);
  assert.equal(revoked.elements.get('rememberMe').checked, false);
  assert.match(revoked.elements.get('loginMessage').textContent, /revogado/);
  assert.equal(revoked.camera.starts, 0);
});

test('Sair durante a restauração ignora a resposta pendente e não abre a tela inicial', async () => {
  const gate = pending();
  const storage = { record: { refreshToken: 'pending-refresh', refreshExpiresAt: new Date(Date.now() + 86400000).toISOString() } };
  const screen = fixture({ storage, refresh: () => gate.promise });
  await screen.ready();
  assert.equal(screen.savedCalls.refreshes.length, 1);
  await screen.click('homeLogoutButton');
  gate.resolve({ token: 'must-not-enter', expiresAt: new Date(Date.now() + 7200000).toISOString() });
  await settle();
  assert.equal(storage.record, null);
  assert.equal(screen.elements.get('loginScreen').hidden, false);
  assert.equal(screen.elements.get('homeScreen').hidden, true);
  assert.equal(screen.camera.starts, 0);
});

test('falha ao salvar o acesso não simula persistência e permite optar pelo login temporário', async () => {
  const screen = fixture({ saveError: new Error('Armazenamento indisponível') });
  await screen.ready();
  screen.elements.get('rememberMe').checked = true;
  await screen.login();
  assert.equal(screen.elements.get('loginScreen').hidden, false);
  assert.match(screen.elements.get('loginMessage').textContent, /Não foi possível salvar/);
  assert.equal(screen.storage.record, null);
  assert.deepEqual(screen.savedCalls.logouts, ['saved-fixture-token']);
  screen.elements.get('rememberMe').checked = false;
  await screen.login();
  assert.equal(screen.elements.get('homeScreen').hidden, false);
  assert.equal(screen.storage.record, null);
});

test('um novo login espera a saída anterior terminar antes de receber outro cookie', async () => {
  const logoutGate = pending();
  const screen = fixture({ logoutGate });
  await screen.ready();
  screen.elements.get('rememberMe').checked = true;
  await screen.login();
  await screen.click('homeLogoutButton');
  const entering = screen.login();
  await settle();
  assert.equal(screen.loginCalls, 1);
  logoutGate.resolve();
  await entering;
  assert.equal(screen.loginCalls, 2);
  const finish = screen.savedCalls.events.indexOf('logout-end');
  const lastClear = screen.savedCalls.events.lastIndexOf('clear-api');
  assert.ok(finish >= 0 && lastClear > finish);
  assert.equal(screen.elements.get('homeScreen').hidden, false);
});
