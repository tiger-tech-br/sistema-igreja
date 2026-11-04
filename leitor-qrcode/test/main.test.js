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

function fixture({ startGate, stopGate, register = async id => ({ id, nome: 'Membro de teste', periodo: 'noite', horario: '19:42:00' }) } = {}) {
  const elements = new Map();
  const docHandlers = new Map();
  const windowHandlers = new Map();
  const classes = new Set();
  let loginCalls = 0;
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
    async login() { loginCalls++; return { token: 'fixture-only', expiresAt: new Date(Date.now() + 7200000).toISOString() }; }
    register(id) { return register(id); }
    clear() { this.token = null; }
  }
  const context = vm.createContext({
    document,
    window: { addEventListener(name, handler) { windowHandlers.set(name, handler); } },
    navigator: { onLine: true, vibrate() {} },
    Capacitor: { isNativePlatform: () => false }, App: {}, SERVER_URL: server,
    ReaderApi: FakeApi, ScanController,
    createCamera: async callbacks => { Object.assign(camera, callbacks); return camera; },
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 2; },
    URL, Intl, Date, console
  });
  vm.runInContext(script, context, { filename: 'main.js' });
  return {
    camera, elements, classes, get loginCalls() { return loginCalls; },
    async login() {
      elements.get('email').value = 'fixture@example.invalid';
      elements.get('senha').value = 'fixture-only';
      await elements.get('loginForm').fire('submit');
      await settle();
    },
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
    }
  };
}

test('a última presença confirmada continua visível após uma leitura com falha', async () => {
  const screen = fixture({ register: async id => {
    if (id === '2') throw new Error('Falha de conexão simulada');
    return { id, nome: 'Primeiro membro', cargo: 'Membro', periodo: 'noite', data: '04/11/2026', horario: '19:42:00' };
  } });
  await screen.login();
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
