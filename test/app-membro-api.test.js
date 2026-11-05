const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { createAppMembroRouter } = require('../routes/appMembroRoutes');
const { createAppMembroTokenService } = require('../services/appMembroTokenService');
const { createLeitorTokenService } = require('../services/leitorTokenService');
const { createLeitorRouter } = require('../routes/leitorRoutes');
const { memberCredentialResult } = require('../services/memberCredentialService');

const APP_ORIGIN = 'https://igreja.example';
const NATIVE_ORIGIN = 'https://localhost';
const secret = crypto.randomBytes(48).toString('hex');
const member = {
    id: 42, nome: 'Membro de teste', cargo: 'Membro', ministerio: 'Louvor', matricula: 'TEST-42',
    validade: '31/12/2027', auth_version: 3, email_verificado: true,
    consent_at: '2026-09-23T12:00:00Z', consent_revoked_at: null,
    senha: 'test-password-hash', email: 'member@example.test', endereco: 'Não deve ser exposto'
};
const originalAttendance = { periodo: 'noite', data: '05/11/2026', horario: '18:02:03', alreadyRecorded: false };
const noLimit = () => (req, res, next) => next();

async function fixture(t, overrides = {}, { actualPollLimiter = false } = {}) {
    const calls = { members: [], scans: [], qrs: [] };
    let scanState = { revision: '7', attendance: { ...originalAttendance } };
    const tokenService = createAppMembroTokenService(secret);
    const options = {
        appUrl: APP_ORIGIN, tokenService,
        findMemberByEmail: async email => email === 'member@example.test' ? { ...member } : null,
        findMemberById: async id => { calls.members.push(String(id)); return String(id) === String(member.id) ? { ...member } : null; },
        comparePassword: async (password, hash) => password === 'test-password' && hash === member.senha,
        readScanState: async id => { calls.scans.push(String(id)); return scanState; },
        generateQrDataUrl: async id => { calls.qrs.push(String(id)); return 'data:image/png;base64,dGVzdC1xb25seQ=='; },
        limit: noLimit,
        ...(actualPollLimiter ? {} : { pollLimiter: (req, res, next) => next() }),
        ...overrides
    };
    const app = express();
    app.use(express.json());
    app.use('/api/app-membro', createAppMembroRouter(options));
    // The real scanner router is mounted with isolated dependencies to verify that
    // a member token cannot acquire an administrative recording scope.
    app.use('/api/leitor', createLeitorRouter({
        appUrl: APP_ORIGIN, secret, limit: noLimit,
        findAdminByEmail: async () => null,
        findAdminById: async () => { throw new Error('A member token must not reach admin lookup'); },
        comparePassword: async () => false,
        registerAttendance: async () => { throw new Error('The member must never record attendance'); }
    }));
    app.use((error, req, res, next) => res.status(500).json({ success: false, message: 'Não foi possível concluir a operação.' }));
    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { origin = NATIVE_ORIGIN, headers = {}, ...rest } = {}) {
        return fetch(base + '/api/app-membro' + path, {
            ...rest, headers: { ...(origin ? { Origin: origin } : {}), ...headers }
        });
    }
    const token = tokenService.issue(member).token;
    return {
        request, calls, token, tokenService, base,
        auth: { Authorization: `Bearer ${token}` },
        setScanState(value) { scanState = value; }
    };
}

test('app member login uses the existing member account and never creates a browser session', async t => {
    const state = await fixture(t);
    const response = await state.request('/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ' MEMBER@example.test ', senha: 'test-password' })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(result.success, true);
    assert.deepEqual(result.data.membro, { id: String(member.id), nome: member.nome });
    assert.equal(state.tokenService.verify(result.data.token).id, String(member.id));
    assert.equal(typeof result.data.expiresAt, 'string');
    for (const privateField of ['senha', 'email', 'endereco', 'auth_version']) {
        assert.equal(JSON.stringify(result.data).includes(privateField), false);
    }
});

test('app member login rejects invalid credentials, oversized passwords and unconfirmed email', async t => {
    const state = await fixture(t);
    for (const credentials of [{}, { email: 'unknown@example.test', senha: 'test-password' },
        { email: 'member@example.test', senha: 'wrong-password' },
        { email: 'member@example.test', senha: 'á'.repeat(37) }]) {
        const response = await state.request('/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials)
        });
        assert.equal(response.status, 401);
        assert.equal((await response.json()).success, false);
    }
    const wrongType = await state.request('/login', { method: 'POST', body: 'email=member@example.test' });
    assert.equal(wrongType.status, 415);
    const unconfirmed = await fixture(t, { findMemberByEmail: async () => ({ ...member, email_verificado: false }) });
    const response = await unconfirmed.request('/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'member@example.test', senha: 'test-password' })
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).success, false);
});

test('member app CORS accepts only the exact website and Android origins without credentialed cookies', async t => {
    const state = await fixture(t);
    for (const origin of ['https://evil.example', 'https://localhost.evil.example', 'http://localhost', 'null', null]) {
        const response = await state.request('/qrcode', { origin, method: 'POST', headers: state.auth });
        assert.equal(response.status, 403, String(origin));
        assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
    for (const origin of [APP_ORIGIN, NATIVE_ORIGIN]) {
        const response = await state.request('/qrcode', {
            origin, method: 'OPTIONS', headers: {
                'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type'
            }
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        assert.equal(response.headers.get('access-control-allow-credentials'), null);
    }
    const disallowed = await state.request('/qrcode', {
        method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'DELETE' }
    });
    assert.equal(disallowed.status, 403);
    assert.equal(state.calls.qrs.length, 0);
});

test('member API ignores administrative cookies and rejects reader tokens, while member tokens cannot authorize the reader', async t => {
    const state = await fixture(t);
    const readerToken = createLeitorTokenService(secret).issue({ id: 7, auth_version: 3 }).token;
    for (const headers of [{}, { Cookie: 'igreja.sid=admin-browser-session' },
        { Authorization: 'Bearer invalid' }, { Authorization: `Bearer ${readerToken}` }]) {
        const response = await state.request('/qrcode', { method: 'POST', headers });
        assert.equal(response.status, 401);
    }
    assert.equal(state.calls.qrs.length, 0);
    assert.equal(state.calls.members.length, 0);
    assert.equal(createLeitorTokenService(secret).verify(state.token), null);
    const scanner = await fetch(state.base + '/api/leitor/presenca/42', {
        method: 'POST', headers: { Origin: NATIVE_ORIGIN, ...state.auth }
    });
    assert.equal(scanner.status, 401);
});

test('member API returns only the authenticated member even if another ID is supplied', async t => {
    const state = await fixture(t);
    const qr = await state.request('/qrcode?id=99', {
        method: 'POST', headers: { ...state.auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 99 })
    });
    assert.equal(qr.status, 200);
    const qrResult = await qr.json();
    assert.equal(String(qrResult.data.membro.id), String(member.id));
    assert.equal(qrResult.data.membro.nome, member.nome);
    assert.equal(qrResult.data.cursor, '7');
    assert.match(qrResult.data.qrDataUrl, /^data:image\/png;base64,/);
    for (const privateField of ['senha', 'email', 'endereco', 'auth_version']) {
        assert.equal(privateField in qrResult.data.membro, false);
    }
    assert.deepEqual(state.calls.qrs, ['42']);
    const credential = await state.request('/credencial?id=99', { headers: state.auth });
    assert.equal(credential.status, 200);
    assert.deepEqual((await credential.json()).data, {
        id: member.id, nome: member.nome, cargo: member.cargo, matricula: member.matricula, validade: member.validade
    });
    assert.ok(state.calls.members.every(id => id === '42'));
    assert.ok(state.calls.scans.every(id => id === '42'));
});

test('a prior attendance does not confirm a newly displayed QR; a later scan does, including an already-recorded presence', async t => {
    const state = await fixture(t);
    const qr = await state.request('/qrcode', { method: 'POST', headers: state.auth });
    const baseline = (await qr.json()).data.cursor;
    const unchanged = await state.request(`/presenca?after=${baseline}`, { headers: state.auth });
    assert.deepEqual((await unchanged.json()).data, { cursor: '7', confirmed: false });
    state.setScanState({ revision: '8', attendance: { ...originalAttendance, alreadyRecorded: true } });
    const repeated = await state.request(`/presenca?after=${baseline}`, { headers: state.auth });
    assert.equal(repeated.status, 200);
    const result = (await repeated.json()).data;
    assert.equal(result.confirmed, true);
    assert.equal(result.cursor, '8');
    assert.deepEqual(result.attendance, { ...originalAttendance, alreadyRecorded: true });
    assert.equal(result.attendance.horario, '18:02:03');
    const consumed = await state.request('/presenca?after=8', { headers: state.auth });
    assert.deepEqual((await consumed.json()).data, { cursor: '8', confirmed: false });
});

test('member scan cursors preserve BIGINT precision and reject ambiguous, malformed and future cursors', async t => {
    const state = await fixture(t);
    state.setScanState({ revision: '9007199254740993', attendance: { ...originalAttendance } });
    const response = await state.request('/presenca?after=9007199254740992', { headers: state.auth });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.confirmed, true);
    for (const query of ['', '?after=-1', '?after=01', '?after=x', '?after=1&after=2',
        '?after=9223372036854775808', '?after=9007199254740994']) {
        const invalid = await state.request('/presenca' + query, { headers: state.auth });
        assert.equal(invalid.status, 400, query);
        assert.equal((await invalid.json()).success, false);
    }
});

test('a member with no previous scan receives cursor zero and no confirmation', async t => {
    const state = await fixture(t);
    state.setScanState({ revision: '0', attendance: null });
    const qr = await state.request('/qrcode', { method: 'POST', headers: state.auth });
    assert.equal((await qr.json()).data.cursor, '0');
    const response = await state.request('/presenca?after=0', { headers: state.auth });
    assert.deepEqual((await response.json()).data, { cursor: '0', confirmed: false });
});

test('member app revokes a changed, deleted or unconfirmed identity before returning its QR or attendance', async t => {
    for (const current of [null, { ...member, auth_version: member.auth_version + 1 }, { ...member, email_verificado: false }]) {
        const state = await fixture(t, { findMemberById: async () => current });
        for (const [path, method] of [['/qrcode', 'POST'], ['/presenca?after=7', 'GET'], ['/credencial', 'GET']]) {
            const response = await state.request(path, { method, headers: state.auth });
            assert.ok([401, 403].includes(response.status), `${path}: ${response.status}`);
            assert.equal((await response.json()).success, false);
        }
        assert.equal(state.calls.qrs.length, 0);
        assert.equal(state.calls.scans.length, 0);
    }
});

test('QR, recognition and credential obey the existing consent and validity rules', async t => {
    for (const current of [{ ...member, consent_at: null }, { ...member, consent_revoked_at: '2026-11-05T12:00:00Z' },
        { ...member, validade: '01/01/2020' }]) {
        const state = await fixture(t, { findMemberById: async () => current });
        for (const [path, method] of [['/qrcode', 'POST'], ['/presenca?after=7', 'GET'], ['/credencial', 'GET']]) {
            const response = await state.request(path, { method, headers: state.auth });
            assert.ok([403, 404].includes(response.status), `${path}: ${response.status}`);
            assert.equal((await response.json()).success, false);
        }
        assert.equal(state.calls.qrs.length, 0);
        assert.equal(state.calls.scans.length, 0);
    }
});

test('server or QR generation failures never return a successful confirmation', async t => {
    const failedState = await fixture(t, { readScanState: async () => { throw new Error('database unavailable'); } });
    for (const [path, method] of [['/qrcode', 'POST'], ['/presenca?after=0', 'GET']]) {
        const response = await failedState.request(path, { method, headers: failedState.auth });
        assert.equal(response.status, 500);
        assert.equal((await response.json()).success, false);
    }
    const failedQr = await fixture(t, { generateQrDataUrl: async () => { throw new Error('QR generation unavailable'); } });
    const response = await failedQr.request('/qrcode', { method: 'POST', headers: failedQr.auth });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).success, false);
});

test('same-origin GET reads work without Origin and unsupported member routes never fall through', async t => {
    const state = await fixture(t);
    const response = await state.request('/credencial', {
        origin: null, headers: { ...state.auth, 'Sec-Fetch-Site': 'same-origin' }
    });
    assert.equal(response.status, 200);
    for (const [path, method] of [['/credencial/99', 'GET'], ['/qrcode/99', 'POST'], ['/presenca/42', 'POST'],
        ['/admin', 'GET'], ['/membros', 'GET'], ['/login', 'GET']]) {
        const unknown = await state.request(path, { method, headers: state.auth });
        assert.equal(unknown.status, 404, path);
        assert.equal((await unknown.json()).success, false);
    }
});

test('polling rate is limited by member identity instead of sharing a single Wi-Fi budget', async t => {
    const otherMember = { ...member, id: 43, nome: 'Outro membro' };
    const state = await fixture(t, {
        findMemberById: async id => String(id) === '43' ? { ...otherMember } : { ...member }
    }, { actualPollLimiter: true });
    for (let call = 0; call < 90; call++) {
        const response = await state.request('/presenca?after=7', { headers: state.auth });
        assert.equal(response.status, 200, `poll ${call + 1}`);
        await response.arrayBuffer();
    }
    const limited = await state.request('/presenca?after=7', { headers: state.auth });
    assert.equal(limited.status, 429);
    const otherToken = state.tokenService.issue(otherMember).token;
    const other = await state.request('/presenca?after=7', { headers: { Authorization: `Bearer ${otherToken}` } });
    assert.equal(other.status, 200);
    assert.equal((await other.json()).data.confirmed, false);
});

test('member tokens expire, reject tampering and cannot be reused as reader tokens', () => {
    let current = Date.parse('2026-11-05T12:00:00Z');
    const tokens = createAppMembroTokenService(secret, { now: () => current });
    const access = tokens.issue(member);
    assert.equal(tokens.verify(access.token).id, String(member.id));
    assert.equal(createLeitorTokenService(secret, { now: () => current }).verify(access.token), null);
    const reader = createLeitorTokenService(secret, { now: () => current }).issue({ id: 7, auth_version: 3 }).token;
    assert.equal(tokens.verify(reader), null);
    const parts = access.token.split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    claims.sub = '99';
    parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
    assert.equal(tokens.verify(parts.join('.')), null);
    current += 2 * 60 * 60 * 1000;
    assert.equal(tokens.verify(access.token), null);
    for (const malformed of [null, {}, [], 'm1..', 'm1.invalid.signature', 'm1.' + 'a'.repeat(1500)]) {
        assert.doesNotThrow(() => assert.equal(tokens.verify(malformed), null));
    }
});

test('member token verification checks scope, nonce, issue time and valid JSON even when signed', () => {
    const current = Date.parse('2026-11-05T12:00:00Z');
    const tokens = createAppMembroTokenService(secret, { now: () => current });
    const parts = tokens.issue(member).token.split('.');
    const original = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const key = crypto.createHmac('sha256', secret).update('igreja-app-membro-token-v1').digest();
    const signValue = value => {
        const payload = Buffer.from(value).toString('base64url');
        return `m1.${payload}.${crypto.createHmac('sha256', key).update(payload).digest('base64url')}`;
    };
    for (const claims of [{ ...original, scope: 'admin:all' }, { ...original, nonce: 'x' },
        { ...original, av: 0 }, { ...original, aud: 'igreja-leitor' }]) {
        assert.equal(tokens.verify(signValue(JSON.stringify(claims))), null);
    }
    for (const json of ['null', '[]', '1', '{broken-json']) assert.equal(tokens.verify(signValue(json)), null);
    const future = createAppMembroTokenService(secret, { now: () => current + 31000 }).issue(member).token;
    assert.equal(tokens.verify(future), null);
});

test('the shared credential rule respects the São Paulo date boundary and returns only existing public fields', () => {
    const todayMember = { ...member, validade: '05/11/2026' };
    const duringValidity = memberCredentialResult(todayMember, { now: () => Date.parse('2026-11-06T02:59:59Z') });
    assert.equal(duringValidity.success, true);
    assert.deepEqual(duringValidity.data, {
        id: member.id, nome: member.nome, cargo: member.cargo, matricula: member.matricula, validade: '05/11/2026'
    });
    const afterValidity = memberCredentialResult(todayMember, { now: () => Date.parse('2026-11-06T03:00:00Z') });
    assert.equal(afterValidity.success, false);
    assert.equal(afterValidity.status, 403);
    for (const unavailable of [null, { ...member, email_verificado: false }, { ...member, consent_at: null },
        { ...member, consent_revoked_at: '2026-11-05T12:00:00Z' }]) {
        const result = memberCredentialResult(unavailable);
        assert.equal(result.success, false);
        assert.equal(result.status, 404);
    }
});

test('a member app token cannot open the real management panel or bypass its session and CSRF checks', async t => {
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
    const token = createAppMembroTokenService(secret).issue(member).token;
    const headers = { Origin: NATIVE_ORIGIN, Authorization: `Bearer ${token}` };
    const dashboard = await fetch(base + '/dashboard', { headers, redirect: 'manual' });
    assert.equal(dashboard.status, 302);
    assert.equal(dashboard.headers.get('location'), '/login-admin');
    const list = await fetch(base + '/api/membros/dashboard', { headers });
    assert.equal(list.status, 401);
    const publicProfile = await fetch(base + '/api/membros/perfil', { headers });
    assert.equal(publicProfile.status, 401);
    const scanner = await fetch(base + '/api/leitor/presenca/42', { method: 'POST', headers });
    assert.equal(scanner.status, 401);
    const noCsrf = await fetch(base + '/api/membros/presenca/42', { method: 'POST', headers });
    assert.equal(noCsrf.status, 403);
    // The app's isolated endpoint is reached before cookie-session CSRF middleware,
    // but still requires its own Bearer token rather than a browser cookie.
    const noToken = await fetch(base + '/api/app-membro/qrcode', { method: 'POST', headers: { Origin: NATIVE_ORIGIN } });
    assert.equal(noToken.status, 401);
    const csrfResponse = await fetch(base + '/api/csrf');
    const csrf = await csrfResponse.json();
    const cookie = csrfResponse.headers.get('set-cookie').split(';')[0];
    const protectedRoute = await fetch(base + '/api/membros/presenca/42', {
        method: 'POST', headers: { Origin: APP_ORIGIN, Authorization: `Bearer ${token}`, Cookie: cookie, 'X-CSRF-Token': csrf.token }
    });
    assert.equal(protectedRoute.status, 401);
});
