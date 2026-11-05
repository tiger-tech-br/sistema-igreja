import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceObserver } from '../src/presence-observer.js';
import { MemberApi } from '../src/api.js';

const pending = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let count=0; count<30; count++) await Promise.resolve(); };

function observerFixture(read, extra = {}) {
  const tasks = new Map(), states = [];
  let sequence = 0;
  const observer = new PresenceObserver({
    read, onState: state => states.push(state),
    schedule: (callback, delay) => { const id = ++sequence; tasks.set(id, { callback, delay }); return id; },
    unschedule: id => tasks.delete(id), ...extra
  });
  return {
    observer, states, tasks,
    async tick() { const task = tasks.entries().next().value; assert.ok(task, 'consulta agendada'); tasks.delete(task[0]); task[1].callback(); await settle(); },
    nextDelay() { return tasks.values().next().value?.delay; }
  };
}

test('somente uma leitura posterior ao cursor recebido com o QR confirma a presença', async () => {
  let response = { cursor:'8', confirmed:false };
  const fixture = observerFixture(async cursor => { assert.equal(cursor,'8'); return response; });
  fixture.observer.arm('8');
  await fixture.tick();
  assert.equal(fixture.states.at(-1).kind,'waiting');
  response = { cursor:'8', confirmed:true, attendance:{ alreadyRecorded:true } };
  await fixture.tick();
  assert.equal(fixture.states.at(-1).kind,'error');
  response = { cursor:'7', confirmed:true, attendance:{} };
  await fixture.tick();
  assert.equal(fixture.states.at(-1).kind,'error');
  response = { cursor:'9', confirmed:true, attendance:{ alreadyRecorded:true, horario:'19:42:00' } };
  await fixture.tick();
  assert.equal(fixture.states.at(-1).kind,'confirmed');
  assert.equal(fixture.states.at(-1).attendance.alreadyRecorded,true);
  assert.equal(fixture.tasks.size,0);
  assert.equal(fixture.observer.enabled,false);
});

test('consulta serializada, pausa preserva cursor e nova apresentação descarta resposta anterior', async () => {
  const gate = pending(), calls = [];
  const fixture = observerFixture(cursor => { calls.push(cursor); return calls.length === 1 ? gate.promise : Promise.resolve({cursor,confirmed:false}); });
  fixture.observer.arm('100');
  await fixture.tick();
  fixture.observer.pause();
  fixture.observer.resume();
  assert.equal(fixture.tasks.size,0);
  fixture.observer.arm('101');
  assert.equal(fixture.tasks.size,0);
  gate.resolve({cursor:'101',confirmed:true,attendance:{}});
  await settle();
  assert.equal(fixture.states.some(state => state.kind === 'confirmed'),false);
  assert.equal(fixture.nextDelay(),0);
  await fixture.tick();
  assert.deepEqual(calls,['100','101']);
  fixture.observer.pause();
  assert.equal(fixture.tasks.size,0);
  assert.equal(fixture.observer.cursor,'101');
  fixture.observer.resume();
  await fixture.tick();
  assert.deepEqual(calls,['100','101','101']);
});

test('sem conexão e erros não confirmam; backoff respeita limite e acesso revogado para consultas', async () => {
  let online = false, calls = 0;
  const fixture = observerFixture(async () => {
    calls++;
    const error = new Error(calls === 1 ? 'Aguarde' : 'Acesso revogado');
    error.status = calls === 1 ? 429 : 401;
    error.retryAfterMs = 60000;
    throw error;
  }, { online:() => online });
  fixture.observer.arm('0');
  await fixture.tick();
  assert.equal(calls,0);
  assert.equal(fixture.states.at(-1).kind,'error');
  online = true;
  await fixture.tick();
  assert.equal(fixture.nextDelay(),60000);
  await fixture.tick();
  assert.equal(fixture.states.at(-1).kind,'expired');
  assert.equal(fixture.tasks.size,0);
  assert.equal(fixture.states.some(state => state.kind === 'confirmed'),false);
});

test('sair ignora confirmação pendente e não reativa observação', async () => {
  const gate = pending();
  const fixture = observerFixture(() => gate.promise);
  fixture.observer.arm('9007199254740994');
  await fixture.tick();
  fixture.observer.stop();
  gate.resolve({cursor:'9007199254740995',confirmed:true,attendance:{}});
  await settle();
  assert.equal(fixture.states.length,0);
  assert.equal(fixture.tasks.size,0);
  fixture.observer.resume();
  assert.equal(fixture.tasks.size,0);
});

test('cliente do membro usa somente endpoints próprios, Bearer em memória e não registra presença', async () => {
  const calls=[];
  const api=new MemberApi('https://igreja.example', async (url, options) => {
    calls.push({url,options});
    return {ok:true,status:200,json:async()=>({success:true,data:{cursor:'0'}})};
  });
  await api.login('membro@example.test','fixture-only');
  api.token='member-fixture-token';
  await api.qrCode();
  await api.presence('12');
  await api.credential();
  assert.deepEqual(calls.map(call=>[call.options.method,new URL(call.url).pathname]),[
    ['POST','/api/app-membro/login'],['POST','/api/app-membro/qrcode'],
    ['GET','/api/app-membro/presenca'],['GET','/api/app-membro/credencial']
  ]);
  assert.equal(calls[0].options.headers.Authorization,undefined);
  for(const call of calls.slice(1)){
    assert.equal(call.options.headers.Authorization,'Bearer member-fixture-token');
    assert.equal(call.options.credentials,'omit');
    assert.equal(call.options.cache,'no-store');
  }
  assert.equal(calls[2].url,'https://igreja.example/api/app-membro/presenca?after=12');
  api.clear();
  assert.equal(api.token,null);
});

test('erros de API preservam status para sessão, credencial e espera de nova tentativa', async () => {
  const api=new MemberApi('https://igreja.example', async()=>({
    ok:false,status:403,headers:{get:()=> '30'},json:async()=>({success:false,message:'Credencial indisponível.'})
  }));
  api.token='fixture-only';
  await assert.rejects(api.credential(), error=>error.status===403 && error.message==='Credencial indisponível.' && error.retryAfterMs===30000);
});

test('timers padrão preservam o contexto Window ao preparar, pausar e retomar a leitura', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const tasks = new Map();
  const receivers = [];
  let sequence = 0;
  globalThis.setTimeout = function (callback, delay) {
    receivers.push(this);
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    assert.equal(this, globalThis);
    const id = ++sequence;
    tasks.set(id, { callback, delay });
    return id;
  };
  globalThis.clearTimeout = function (id) {
    receivers.push(this);
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    assert.equal(this, globalThis);
    tasks.delete(id);
  };
  try {
    const states = [];
    const observer = new PresenceObserver({
      read: async cursor => ({ cursor, confirmed: false }),
      onState: state => states.push(state)
    });
    observer.arm('0');
    assert.equal(tasks.size, 1);
    assert.equal([...tasks.values()][0].delay, 0);
    observer.pause();
    assert.equal(tasks.size, 0);
    assert.equal(observer.cursor, '0');
    observer.resume();
    assert.equal(tasks.size, 1);
    const [id, task] = tasks.entries().next().value;
    tasks.delete(id);
    task.callback();
    await settle();
    assert.equal(states.at(-1).kind, 'waiting');
    assert.equal(tasks.size, 1);
    assert.equal([...tasks.values()][0].delay, 2000);
    observer.stop();
    assert.equal(tasks.size, 0);
    assert.equal(observer.cursor, null);
    assert.ok(receivers.length >= 4);
    for (const receiver of receivers) assert.equal(receiver, globalThis);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
