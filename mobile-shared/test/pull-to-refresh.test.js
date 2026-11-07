import test from 'node:test';
import assert from 'node:assert/strict';
import { PullToRefresh } from '../pull-to-refresh.js';

const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const touch = (x, y, id = 1) => ({ clientX: x, clientY: y, identifier: id });
function fixture(refresh = async () => {}) {
  const states = [];
  let calls = 0, allowed = true, top = 0, prevented = 0;
  const controller = new PullToRefresh({
    canRefresh: () => allowed, scrollTop: () => top,
    refresh: () => { calls++; return refresh(); }, onState: state => states.push(state)
  });
  return {
    controller, states, get calls() { return calls; }, get prevented() { return prevented; },
    allow(value) { allowed = value; }, scroll(value) { top = value; },
    start({ x = 0, y = 0, target = null, touches } = {}) { controller.start({ target, touches: touches || [touch(x, y)] }); },
    move(x, y, touches) { controller.move({ touches: touches || [touch(x, y)], cancelable: true, preventDefault() { prevented++; } }); }
  };
}

test('limiar exige arrastar para baixo e soltar; gesto leve ou retraído não atualiza', async () => {
  const screen = fixture();
  screen.start(); screen.move(2, 45);
  assert.equal(screen.states.at(-1).phase, 'pulling');
  await screen.controller.end();
  assert.equal(screen.calls, 0);
  assert.equal(screen.states.at(-1).phase, 'idle');
  screen.start(); screen.move(0, 95);
  assert.equal(screen.states.at(-1).phase, 'ready');
  screen.move(0, 5); await screen.controller.end();
  assert.equal(screen.calls, 0, 'retornar o dedo antes de soltar cancela a intenção');
  screen.start(); screen.move(0, 90);
  assert.equal(screen.calls, 0, 'não atualiza antes de soltar');
  await screen.controller.end();
  assert.equal(screen.calls, 1);
  assert.deepEqual(screen.states.slice(-2).map(state => state.phase), ['refreshing', 'idle']);
});

test('fora do topo, controles e telas não autorizadas não capturam a rolagem', async () => {
  const screen = fixture();
  screen.scroll(20); screen.start(); screen.move(0, 100); await screen.controller.end();
  screen.scroll(0); screen.allow(false); screen.start(); screen.move(0, 100); await screen.controller.end();
  screen.allow(true); screen.start({ target: { closest: () => ({ tagName: 'INPUT' }) } }); screen.move(0, 100); await screen.controller.end();
  assert.equal(screen.calls, 0);
  assert.equal(screen.prevented, 0);
  assert.equal(screen.states.length, 0);
  screen.start(); screen.scroll(5); screen.move(0, 100); await screen.controller.end();
  assert.equal(screen.calls, 0, 'rolagem que saiu do topo cancela');
});

test('movimento horizontal, para cima, multitoque e touchcancel não disparam atualização', async () => {
  const screen = fixture();
  screen.start(); screen.move(90, 15); await screen.controller.end();
  screen.start(); screen.move(0, -40); await screen.controller.end();
  screen.start(); screen.move(0, 30); screen.move(0, 100, [touch(0, 100), touch(20, 100, 2)]); await screen.controller.end();
  screen.start(); screen.move(0, 100); screen.controller.cancel(); await screen.controller.end();
  screen.start(); screen.move(0, 100); screen.start({ touches: [touch(0, 100), touch(20, 100, 2)] }); await screen.controller.end();
  assert.equal(screen.calls, 0);
  assert.equal(screen.states.at(-1).phase, 'idle');
});

test('atualização é serializada e uma falha apenas esconde o indicador, sem anunciar sucesso', async () => {
  const gate = pending();
  const screen = fixture(() => gate.promise);
  screen.start(); screen.move(0, 100);
  const refreshing = screen.controller.end();
  assert.equal(screen.controller.busy, true);
  screen.start(); screen.move(0, 100); await screen.controller.end();
  assert.equal(screen.calls, 1);
  gate.reject(new Error('Rede indisponível'));
  await refreshing;
  assert.equal(screen.controller.busy, false);
  assert.equal(screen.states.at(-1).phase, 'idle');
  assert.equal(screen.states.some(state => state.phase === 'success'), false);
});

test('reset na navegação limpa gesto e respostas antigas não alteram um indicador mais novo', async () => {
  const first = pending(), second = pending();
  let count = 0;
  const screen = fixture(() => ++count === 1 ? first.promise : second.promise);
  screen.start(); screen.move(0, 100);
  const old = screen.controller.end();
  screen.controller.reset();
  screen.start(); screen.move(0, 100);
  const current = screen.controller.end();
  first.resolve(); await old;
  assert.equal(screen.controller.busy, true);
  assert.equal(screen.states.at(-1).phase, 'refreshing');
  second.resolve(); await current;
  assert.equal(screen.controller.busy, false);
  assert.equal(screen.states.at(-1).phase, 'idle');
});
