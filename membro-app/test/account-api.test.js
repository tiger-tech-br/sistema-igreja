import test from 'node:test';
import assert from 'node:assert/strict';
import { MemberApi } from '../src/api.js';

test('cadastro é público e exclusão envia somente a senha para a identidade do Bearer', async () => {
  const calls = [];
  const api = new MemberApi('https://igreja.example', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ success: true, data: { accepted: true } }) };
  });
  api.token = 'member-access-in-memory';
  await api.registrationConfig();
  const registration = { nome: 'Ana de teste', dataNascimento: '01/01/1990', email: 'ana@example.test', senha: 'senha-de-teste-longa', cienciaPrivacidade: true, consentimento: true, privacyVersion: 'test-v1' };
  await api.registerMember(registration);
  await api.deleteAccount('senha-atual');
  assert.deepEqual(calls.map(({ url, options }) => [new URL(url).pathname, options.method]), [
    ['/api/app-membro/cadastro/config', 'GET'],
    ['/api/app-membro/cadastro', 'POST'],
    ['/api/app-membro/excluir-conta', 'POST']
  ]);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[1].options.body), registration);
  assert.equal(calls[2].options.headers.Authorization, 'Bearer member-access-in-memory');
  assert.deepEqual(JSON.parse(calls[2].options.body), { senha: 'senha-atual' });
  for (const { options } of calls) {
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'same-origin');
  }
});

test('cancelar uma tela aborta somente sua solicitação sem apagar o token ou reclassificar como demora', async () => {
  const signals = [];
  const api = new MemberApi('https://igreja.example', (url, options) => new Promise((resolve, reject) => {
    signals.push(options.signal);
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
  }));
  api.token = 'current-access';
  const form = new AbortController();
  const account = new AbortController();
  const registration = api.registerMember({ nome: 'Ana' }, { signal: form.signal });
  const deletion = api.deleteAccount('senha-atual', { signal: account.signal });
  form.abort();
  await assert.rejects(registration, error => error.name === 'AbortError' && error.message === 'Solicitação cancelada.');
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  assert.equal(api.token, 'current-access');
  assert.equal(api.requests.size, 1);
  account.abort();
  await assert.rejects(deletion, error => error.name === 'AbortError');
  assert.equal(api.requests.size, 0);
});

test('senha recusada mantém status e mensagem para erro inline sem apagar acesso', async () => {
  const api = new MemberApi('https://igreja.example', async () => ({
    ok: false, status: 401, json: async () => ({ success: false, message: 'Senha incorreta. Confira sua senha atual e tente novamente.' })
  }));
  api.token = 'current-access';
  await assert.rejects(api.deleteAccount('senha-errada'), error => error.status === 401 && /Senha incorreta/.test(error.message));
  assert.equal(api.token, 'current-access');
});
