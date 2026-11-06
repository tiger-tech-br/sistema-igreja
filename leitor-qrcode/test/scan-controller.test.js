import test from 'node:test';
import assert from 'node:assert/strict';
import { ScanController, memberIdFromQr } from '../src/scan-controller.js';
import { ReaderApi } from '../src/api.js';

const serverUrl = 'https://igreja.example';
const qr = id => `${serverUrl}/validar?id=${id}`;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('aceita os QR existentes e rejeita host externo, IDs inválidos e parâmetros ambíguos', () => {
  assert.equal(memberIdFromQr(qr(42), serverUrl), '42');
  assert.equal(memberIdFromQr('/validar?id=42', serverUrl), '42');
  assert.equal(memberIdFromQr('MEMBRO:42', serverUrl), '42');
  for (const value of ['https://outro.example/validar?id=42', '/validar?id=0', '/validar?id=-1', '/validar?id=42&id=43', '/validar?id=1#outro', '/validar?id=12345678901', 'https://igreja.example@outro.example/validar?id=1', 'javascript:alert(1)', 'qualquer texto']) assert.equal(memberIdFromQr(value, serverUrl), null, value);
});

test('aguarda servidor, impede envios paralelos e permite próximo membro sem espera artificial', async () => {
  const pending = deferred(), states = [], calls = [];
  const controller = new ScanController({ serverUrl, register: id => { calls.push(id); return calls.length === 1 ? pending.promise : Promise.resolve({ id, nome: 'Outro membro' }); }, onState: state => states.push(state), now: () => 1000 });
  controller.activate();
  const first = controller.read(qr(1));
  assert.deepEqual(states.map(state => state.kind), ['sending']);
  assert.equal(await controller.read(qr(2)), 'busy');
  assert.equal(calls.length, 1);
  pending.resolve({ id: '1', nome: 'Primeiro membro' });
  assert.equal(await first, 'confirmed');
  assert.equal(await controller.read(qr(2)), 'confirmed');
  assert.deepEqual(calls, ['1', '2']);
});

test('QR mantido na câmera não reenvia continuamente, mas pode ser reapresentado', async () => {
  let time = 1000, count = 0;
  const controller = new ScanController({ serverUrl, now: () => time, register: async () => { count++; return { nome: 'Membro' }; } });
  controller.activate();
  await controller.read(qr(1));
  for (let index = 0; index < 40; index++) { time += 100; assert.equal(await controller.read(qr(1)), 'held'); }
  assert.equal(count, 1);
  time += 1300;
  assert.equal(await controller.read(qr(1)), 'confirmed');
  assert.equal(count, 2);
});

test('falhas não emitem confirmação e repetição explícita reaproveita o mesmo membro', async () => {
  const states = []; let fail = true;
  const controller = new ScanController({ serverUrl, register: async id => { if (fail) throw new Error('Sem resposta'); return { id, alreadyRecorded: true }; }, onState: state => states.push(state) });
  controller.activate();
  assert.equal(await controller.read(qr(4)), 'error');
  assert.equal(states.some(state => state.kind === 'confirmed'), false);
  fail = false;
  assert.equal(await controller.retry(), 'confirmed');
  assert.equal(states.at(-1).attendance.alreadyRecorded, true);
});

test('logout invalida resposta pendente sem contaminar nova sessão', async () => {
  const pending = deferred(), states = [];
  const controller = new ScanController({ serverUrl, register: () => pending.promise, onState: state => states.push(state) });
  controller.activate();
  const first = controller.read(qr(1));
  controller.deactivate();
  controller.activate();
  pending.resolve({ id: 1 });
  assert.equal(await first, 'stale');
  assert.equal(states.some(state => state.kind === 'confirmed'), false);
});

test('offline não envia presença e 401 exige novo login', async () => {
  let online = false, calls = 0; const states = [];
  const controller = new ScanController({ serverUrl, online: () => online, register: async () => { calls++; const error = new Error('Expirado'); error.status = 401; throw error; }, onState: state => states.push(state) });
  controller.activate();
  assert.equal(await controller.read(qr(1)), 'offline');
  assert.equal(calls, 0);
  online = true;
  await controller.retry();
  assert.equal(states.at(-1).kind, 'expired');
  assert.equal(await controller.read(qr(2)), 'inactive');
});

test('cliente usa Bearer e cookies só da própria origem, não guarda senha e rejeita erro HTTP', async () => {
  const calls = [];
  const api = new ReaderApi(serverUrl, async (url, options) => { calls.push({ url, options }); return { ok: false, status: 401, json: async () => ({ success: false, message: 'Acesso expirado' }) }; });
  api.token = 'token-em-memoria';
  await assert.rejects(api.register(42), error => error.status === 401);
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-em-memoria');
  assert.equal(calls[0].url, `${serverUrl}/api/leitor/presenca/42`);
  api.clear();
  assert.equal(api.token, null);
});

test('fetch padrão preserva o receiver exigido pelo navegador', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async function () {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return { ok: true, status: 200, json: async () => ({ success: true, data: { id: '42' } }) };
  };
  const api = new ReaderApi(serverUrl);
  api.token = 'fixture-only';
  const result = await api.register(42);
  assert.equal(result.id, '42');
});

test('acesso salvo usa endpoints próprios sem reaproveitar o token Bearer vencido', async () => {
  const calls = [];
  const api = new ReaderApi(serverUrl, async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ success: true, data: { loggedOut: true } }) };
  });
  api.token = 'expired-access-token';
  await api.login('fixture@example.test', 'fixture-password', true);
  await api.refresh('saved-fixture');
  await api.logout('saved-fixture');
  await api.refresh();
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), [
    '/api/leitor/login', '/api/leitor/refresh', '/api/leitor/logout', '/api/leitor/refresh'
  ]);
  assert.equal(calls[0].body.rememberMe, true);
  assert.deepEqual(calls[1].body, { refreshToken: 'saved-fixture' });
  assert.deepEqual(calls[2].body, { refreshToken: 'saved-fixture' });
  assert.deepEqual(calls[3].body, {});
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, undefined);
    assert.equal(call.options.credentials, 'same-origin');
  }
  assert.equal(api.token, 'expired-access-token', 'o cliente só troca o acesso depois da validação da tela');
});
