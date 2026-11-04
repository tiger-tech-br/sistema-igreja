const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { createLeitorRouter } = require('../routes/leitorRoutes');
const { createLeitorTokenService } = require('../services/leitorTokenService');

const APP_ORIGIN = 'https://igreja.example';
const NATIVE_ORIGIN = 'https://localhost';
const secret = crypto.randomBytes(48).toString('hex');
const admin = { id: 7, nome: 'Administrador de teste', auth_version: 3, senha: 'test-password-hash' };

async function fixture(t, overrides = {}) {
    const calls = [];
    const tokenService = createLeitorTokenService(secret);
    const options = {
        appUrl: APP_ORIGIN,
        tokenService,
        findAdminByEmail: async email => email === 'admin@example.test' ? { ...admin } : null,
        findAdminById: async id => String(id) === String(admin.id) ? { ...admin } : null,
        comparePassword: async (password, hash) => password === 'test-password' && hash === admin.senha,
        registerAttendance: async (id, actor) => {
            calls.push({ id, actor });
            return {
                id, nome: 'Membro de teste', cargo: 'Membro', ministerio: 'Recepção', matricula: 'TEST-1',
                data: '04/11/2026', horario: '20:05:08', periodo: 'noite', alreadyRecorded: false,
                email: 'private@example.test', senha: 'must-not-leak'
            };
        },
        limit: () => (req, res, next) => next(),
        ...overrides
    };
    const app = express();
    app.use(express.json());
    app.use('/api/leitor', createLeitorRouter(options));
    app.use((error, req, res, next) => res.status(500).json({ success: false, message: 'Não foi possível concluir a operação.' }));
    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}/api/leitor`;
    async function request(path, { origin = NATIVE_ORIGIN, headers = {}, ...rest } = {}) {
        return fetch(base + path, { ...rest, headers: { ...(origin ? { Origin: origin } : {}), ...headers } });
    }
    return { request, calls, token: tokenService.issue(admin).token };
}

test('leitor login accepts an administrator without creating a browser session', async t => {
    const state = await fixture(t);
    const response = await state.request('/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ' ADMIN@example.test ', senha: 'test-password' })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), NATIVE_ORIGIN);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.data.admin.nome, admin.nome);
    assert.equal(typeof result.data.token, 'string');
    assert.equal('senha' in result.data.admin, false);
    assert.equal('email' in result.data.admin, false);
    const session = await state.request('/sessao', { headers: { Authorization: `Bearer ${result.data.token}` } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).data.admin.nome, admin.nome);
});

test('leitor rejects missing, incorrect and oversized login credentials', async t => {
    const state = await fixture(t);
    for (const credentials of [{}, { email: 'unknown@example.test', senha: 'test-password' },
        { email: 'admin@example.test', senha: 'incorrect' }, { email: 'admin@example.test', senha: 'á'.repeat(37) }]) {
        const response = await state.request('/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials)
        });
        assert.equal(response.status, 401);
        assert.equal((await response.json()).success, false);
    }
    const response = await state.request('/login', { method: 'POST', body: 'email=admin@example.test&senha=test-password' });
    assert.equal(response.status, 415);
});

test('leitor permits only the web and Android origins, with no credentialed CORS', async t => {
    const state = await fixture(t);
    for (const origin of ['https://evil.example', 'https://localhost.evil.example', 'http://localhost', 'null', null]) {
        const response = await state.request('/presenca/42', {
            origin, method: 'POST', headers: { Authorization: `Bearer ${state.token}` }
        });
        assert.equal(response.status, 403, String(origin));
        assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
    for (const origin of [APP_ORIGIN, NATIVE_ORIGIN]) {
        const response = await state.request('/presenca/42', {
            origin, method: 'OPTIONS', headers: {
                'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type'
            }
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        assert.equal(response.headers.get('access-control-allow-credentials'), null);
    }
    const disallowed = await state.request('/presenca/42', {
        method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'DELETE' }
    });
    assert.equal(disallowed.status, 403);
    assert.equal(state.calls.length, 0);
});

test('leitor attendance requires its Bearer token and ignores cookies', async t => {
    const state = await fixture(t);
    for (const headers of [{}, { Cookie: 'igreja.sid=administrative-browser-session' }, { Authorization: 'Bearer invalid' }]) {
        const response = await state.request('/presenca/42', { method: 'POST', headers });
        assert.equal(response.status, 401);
    }
    assert.equal(state.calls.length, 0);
});

test('leitor records through the existing model and sends only the confirmed minimal result', async t => {
    const state = await fixture(t);
    const response = await state.request('/presenca/42', {
        method: 'POST', headers: { Authorization: `Bearer ${state.token}` }
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(state.calls, [{ id: '42', actor: String(admin.id) }]);
    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
        id: '42', nome: 'Membro de teste', cargo: 'Membro', ministerio: 'Recepção', matricula: 'TEST-1',
        data: '04/11/2026', horario: '20:05:08', periodo: 'noite', alreadyRecorded: false
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('leitor reports repeated attendance without replacing its first time', async t => {
    const state = await fixture(t, { registerAttendance: async id => ({
        id, nome: 'Membro de teste', data: '04/11/2026', horario: '18:00:01', periodo: 'noite', alreadyRecorded: true
    }) });
    const response = await state.request('/presenca/42', { method: 'POST', headers: { Authorization: `Bearer ${state.token}` } });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.data.alreadyRecorded, true);
    assert.equal(result.data.horario, '18:00:01');
    assert.match(result.message, /já foi confirmada/);
});

test('leitor rejects nonexistent and malformed QR member IDs', async t => {
    const state = await fixture(t, { registerAttendance: async () => null });
    for (const id of ['0', '-1', 'abc', '12345678901', '01']) {
        const response = await state.request(`/presenca/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}` } });
        assert.equal(response.status, 400, id);
    }
    const missing = await state.request('/presenca/42', { method: 'POST', headers: { Authorization: `Bearer ${state.token}` } });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).success, false);
});

test('leitor stops revoked and deleted administrators before recording attendance', async t => {
    for (const currentAdmin of [null, { ...admin, auth_version: admin.auth_version + 1 }]) {
        const state = await fixture(t, { findAdminById: async () => currentAdmin });
        const response = await state.request('/presenca/42', { method: 'POST', headers: { Authorization: `Bearer ${state.token}` } });
        assert.equal(response.status, 401);
        assert.equal(state.calls.length, 0);
    }
});

test('leitor does not confirm attendance when the server fails', async t => {
    const state = await fixture(t, { registerAttendance: async () => { throw new Error('test database failure'); } });
    const response = await state.request('/presenca/42', { method: 'POST', headers: { Authorization: `Bearer ${state.token}` } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { success: false, message: 'Não foi possível concluir a operação.' });
});

test('leitor routes cannot access administration or register attendance through GET', async t => {
    const state = await fixture(t);
    for (const path of ['/admin', '/membros', '/presenca/42', '/../../admin']) {
        const response = await state.request(path, { headers: { Authorization: `Bearer ${state.token}` } });
        assert.equal(response.status, 404);
    }
    assert.equal(state.calls.length, 0);
});

test('same-origin session reads work when browsers omit the Origin header', async t => {
    const state = await fixture(t);
    const response = await state.request('/sessao', {
        origin: null, headers: { Authorization: `Bearer ${state.token}`, 'Sec-Fetch-Site': 'same-origin' }
    });
    assert.equal(response.status, 200);
});

test('leitor tokens expire, reject tampering and cannot be reused across signing contexts', () => {
    let current = Date.parse('2026-11-04T20:00:00Z');
    const tokens = createLeitorTokenService(secret, { now: () => current });
    const access = tokens.issue(admin);
    assert.equal(tokens.verify(access.token).id, String(admin.id));
    const tampered = access.token.split('.');
    const claims = JSON.parse(Buffer.from(tampered[1], 'base64url').toString());
    claims.sub = '99';
    tampered[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
    assert.equal(tokens.verify(tampered.join('.')), null);
    assert.equal(createLeitorTokenService(crypto.randomBytes(48).toString('hex'), { now: () => current }).verify(access.token), null);
    current += 2 * 60 * 60 * 1000;
    assert.equal(tokens.verify(access.token), null);
    assert.equal(tokens.verify('not-a-token'), null);
});

test('leitor verifies its scope even for a signed token', () => {
    const now = Date.parse('2026-11-04T20:00:00Z');
    const tokens = createLeitorTokenService(secret, { now: () => now });
    const valid = tokens.issue(admin).token.split('.');
    const claims = JSON.parse(Buffer.from(valid[1], 'base64url').toString());
    claims.scope = 'admin:all';
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const key = crypto.createHmac('sha256', secret).update('igreja-leitor-token-v1').digest();
    const signature = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    assert.equal(tokens.verify(`l1.${payload}.${signature}`), null);
});

test('leitor rejects future-issued tokens and malformed token data without throwing', () => {
    const current = Date.parse('2026-11-04T20:00:00Z');
    const verifier = createLeitorTokenService(secret, { now: () => current });
    const futureToken = createLeitorTokenService(secret, { now: () => current + 31000 }).issue(admin).token;
    assert.equal(verifier.verify(futureToken), null);
    for (const value of [null, {}, [], 'l1..', 'l1.%invalid.signature', 'l1.' + 'a'.repeat(1500),
        'l1.a.' + 'a'.repeat(42), 'l1.a.' + 'a'.repeat(44), 'Bearer some-token']) {
        assert.doesNotThrow(() => assert.equal(verifier.verify(value), null));
    }
    const key = crypto.createHmac('sha256', secret).update('igreja-leitor-token-v1').digest();
    for (const json of ['null', '[]', '1', '{broken-json']) {
        const payload = Buffer.from(json).toString('base64url');
        const signature = crypto.createHmac('sha256', key).update(payload).digest('base64url');
        assert.equal(verifier.verify(`l1.${payload}.${signature}`), null);
    }
});

test('a leitor token cannot authorize the real administrative routes or bypass their CSRF', async t => {
    const session = require('express-session');
    const { createApp } = require('../app');
    const previous = Object.fromEntries(['SESSION_SECRET', 'APP_URL', 'NODE_ENV', 'RAILWAY_ENVIRONMENT'].map(key => [key, process.env[key]]));
    process.env.SESSION_SECRET = secret;
    process.env.APP_URL = APP_ORIGIN;
    process.env.NODE_ENV = 'test';
    delete process.env.RAILWAY_ENVIRONMENT;
    t.after(() => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });
    const app = createApp({ sessionStore: new session.MemoryStore() });
    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = createLeitorTokenService(secret).issue(admin).token;
    const headers = { Authorization: `Bearer ${token}`, Origin: APP_ORIGIN };
    const dashboard = await fetch(base + '/dashboard', { headers, redirect: 'manual' });
    assert.equal(dashboard.status, 302);
    assert.equal(dashboard.headers.get('location'), '/login-admin');
    const data = await fetch(base + '/api/membros/dashboard', { headers });
    assert.equal(data.status, 401);
    const noCsrf = await fetch(base + '/api/membros/presenca/42', { method: 'POST', headers });
    assert.equal(noCsrf.status, 403);
    const csrfResponse = await fetch(base + '/api/csrf');
    const csrf = await csrfResponse.json();
    const cookie = csrfResponse.headers.get('set-cookie').split(';')[0];
    for (const path of ['/api/membros/presenca/42', '/api/admin']) {
        const response = await fetch(base + path, {
            method: 'POST', headers: { ...headers, Cookie: cookie, 'X-CSRF-Token': csrf.token }
        });
        assert.equal(response.status, 401, path);
    }
});
