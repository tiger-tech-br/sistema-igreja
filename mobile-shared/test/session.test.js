import test from 'node:test';
import assert from 'node:assert/strict';
import { SavedSession } from '../session.js';

const serverUrl = 'https://igreja.example';
const token = 'rs1.' + 'r'.repeat(43);
const clock = Date.parse('2026-11-06T12:00:00Z');
const refreshExpiresAt = new Date(clock + 30 * 86400000).toISOString();
const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let count = 0; count < 40; count++) await Promise.resolve(); };

function fixture({ app = 'membro', native = true, raw = null, writeGate, writeError } = {}) {
  const state = { raw, reads: 0, writes: 0, removes: 0 };
  const secure = {
    async get() { state.reads++; return { value: state.raw }; },
    async set({ value }) {
      state.writes++;
      if (writeGate) await writeGate.promise;
      if (writeError) throw writeError;
      state.raw = value;
    },
    async remove() { state.removes++; state.raw = null; }
  };
  const browser = {
    getItem(key) { assert.equal(key, `igreja.${app}.remember.v1`); state.reads++; return state.raw; },
    setItem(key, value) { assert.equal(key, `igreja.${app}.remember.v1`); state.writes++; state.raw = value; },
    removeItem(key) { assert.equal(key, `igreja.${app}.remember.v1`); state.removes++; state.raw = null; }
  };
  const create = overrides => new SavedSession({ app, serverUrl, native, secure, storage: browser, now: () => clock, ...overrides });
  return { state, create, session: create() };
}

test('Android saves only the refresh record and a new instance restores it without a password or access token', async () => {
  const f = fixture();
  assert.equal(await f.session.load(), null);
  const saved = await f.session.save({
    refreshToken: token, refreshExpiresAt,
    token: 'access-must-stay-in-memory', email: 'must-not-store@example.test', senha: 'must-not-store',
    membro: { nome: 'Private member data' }
  });
  assert.deepEqual(saved, { refreshToken: token, refreshExpiresAt });
  assert.deepEqual(JSON.parse(f.state.raw), { version: 1, app: 'membro', serverUrl, refreshExpiresAt, refreshToken: token });
  for (const privateValue of ['access-must-stay-in-memory', 'must-not-store@example.test', 'senha', 'Private member data']) {
    assert.equal(f.state.raw.includes(privateValue), false);
  }
  assert.deepEqual(await f.create().load(), { refreshToken: token, refreshExpiresAt });
  await f.session.clear();
  assert.equal(await f.create().load(), null);
});

test('browser persistence contains only an expiry marker; refresh secrets stay in the server cookie', async () => {
  const f = fixture({ native: false, app: 'leitor' });
  await f.session.save({ refreshToken: token, refreshExpiresAt, token: 'access', email: 'private@example.test', senha: 'private' });
  assert.deepEqual(JSON.parse(f.state.raw), { version: 1, app: 'leitor', serverUrl, refreshExpiresAt });
  assert.equal(f.state.raw.includes(token), false);
  assert.equal(f.state.raw.includes('private'), false);
  assert.deepEqual(await f.create().load(), { refreshExpiresAt });
  await f.session.clear();
  assert.equal(f.state.raw, null);
});

test('expired, malformed, wrong-server and wrong-app records are discarded', async () => {
  const valid = { version: 1, app: 'membro', serverUrl, refreshExpiresAt, refreshToken: token };
  for (const record of [
    'invalid-json', 'null', '[]', JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, app: 'leitor' }), JSON.stringify({ ...valid, serverUrl: 'https://other.example' }),
    JSON.stringify({ ...valid, refreshExpiresAt: new Date(clock).toISOString() }),
    JSON.stringify({ ...valid, refreshExpiresAt: 'not-a-date' }), JSON.stringify({ ...valid, refreshToken: 'invalid' })
  ]) {
    const f = fixture({ raw: record });
    assert.equal(await f.session.load(), null, record);
    assert.equal(f.state.raw, null);
    assert.equal(f.state.removes, 1);
  }
  assert.throws(() => fixture({ app: 'admin-all' }), /inválido/);
});

test('an in-flight write cannot restore a record after the user clears it', async () => {
  const gate = pending();
  const f = fixture({ writeGate: gate });
  const saving = f.session.save({ refreshToken: token, refreshExpiresAt });
  await settle();
  assert.equal(f.state.writes, 1);
  const clearing = f.session.clear();
  await settle();
  assert.equal(f.state.removes, 0, 'clear waits until the earlier write settles');
  gate.resolve();
  await saving;
  await clearing;
  assert.equal(f.state.raw, null);
  assert.equal(await f.create().load(), null);
});

test('storage failures reject the save without poisoning the write queue, and invalid tokens are never written', async () => {
  const f = fixture({ writeError: new Error('Device storage failed') });
  await assert.rejects(f.session.save({ refreshToken: token, refreshExpiresAt }), /Não foi possível salvar/);
  await f.session.clear();
  assert.equal(f.state.removes, 1);
  for (const access of [{}, { refreshToken: 'short', refreshExpiresAt },
    { refreshToken: token, refreshExpiresAt: new Date(clock).toISOString() }]) {
    await assert.rejects(f.session.save(access), /Não foi possível salvar/);
  }
  assert.equal(f.state.writes, 1);
  assert.equal(f.state.raw, null);
});
