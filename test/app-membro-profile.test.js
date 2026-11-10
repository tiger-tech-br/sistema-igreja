const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const { createAppMembroRouter } = require('../routes/appMembroRoutes');
const { createAppMembroTokenService } = require('../services/appMembroTokenService');
const { createLeitorTokenService } = require('../services/leitorTokenService');

const WEB = 'https://igreja.example';
const ANDROID = 'https://localhost';
const secret = crypto.randomBytes(48).toString('hex');
const identity = { id: 42, nome: 'Pessoa de Teste', auth_version: 3, email_verificado: true,
    consent_at: '2026-09-23', consent_revoked_at: null, validade: '31/12/2027' };
const publicProfile = { id: '42', nome: 'Pessoa de Teste', email: 'pessoa@example.invalid',
    data_nascimento: '20/05/1990', telefone: null, celular: '11999999999', endereco: 'Endereço de demonstração',
    sexo: 'Feminino', estado_civil: 'Solteiro(a)', cargo: 'Membro', ministerio: 'Louvor',
    matricula: '12345678', validade: '31/12/2027' };
const storedProfile = { ...publicProfile, id: 42, senha: 'private-password-hash', auth_version: 3,
    token_confirmacao: 'private-confirmation', token_redefinicao: 'private-reset', token_expira_em: 'private-expiry',
    privacy_notice_text: 'private-evidence', consent_text: 'private-consent', consent_at: 'private-timestamp',
    qr_code: 'private-qr', email_verificado: true, cadastro_liberado: false };

async function fixture(t, overrides = {}) {
    let current = Date.parse('2026-11-09T15:00:00Z');
    let member = { ...identity };
    let profile = { ...storedProfile };
    const calls = { identities: [], profiles: [] };
    const tokens = createAppMembroTokenService(secret, { now: () => current });
    const app = express();
    app.use(express.json());
    app.use('/api/app-membro', createAppMembroRouter({
        appUrl: WEB, tokenService: tokens, now: () => current,
        findMemberByEmail: async () => assert.fail('profile reads cannot perform a login'),
        findMemberById: async id => { calls.identities.push(String(id)); return member; },
        findMemberProfileById: async id => { calls.profiles.push(String(id)); return profile; },
        readScanState: async () => assert.fail('profile reads cannot query attendance'),
        generateQrDataUrl: async () => assert.fail('profile reads cannot prepare a scan or QR'),
        deleteOwn: async () => assert.fail('profile reads cannot delete a member'),
        createMember: async () => assert.fail('profile reads cannot create a member'),
        limit: () => (req, res, next) => next(),
        ...overrides
    }));
    app.use((error, req, res, next) => res.status(500).json({ success: false, message: 'Falha temporária.' }));
    const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}/api/app-membro`;
    const token = tokens.issue(identity).token;
    return { base, calls, tokens, token, auth: { Authorization: `Bearer ${token}` },
        member: value => { member = value; }, profile: value => { profile = value; }, advance: milliseconds => { current += milliseconds; },
        request: (path = '/perfil', { origin = ANDROID, headers = {}, ...options } = {}) => fetch(base + path, {
            ...options, headers: { ...(origin ? { Origin: origin } : {}), ...headers }
        }) };
}

test('member profile returns only its authenticated owner and a fixed allowlist, ignoring query and body identities', async t => {
    const state = await fixture(t);
    const response = await state.request('/perfil?id=99&membro_id=99', { headers: state.auth });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(await response.json(), { success: true, data: publicProfile });
    const body = JSON.stringify({ id: 99, membro_id: 99 });
    const withBody = await new Promise((resolve, reject) => {
        const request = http.request(state.base + '/perfil?id=99', { method: 'GET', headers: {
            Origin: ANDROID, ...state.auth, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)
        } }, incoming => {
            let text = '';
            incoming.setEncoding('utf8');
            incoming.on('data', chunk => { text += chunk; });
            incoming.on('end', () => resolve({ status: incoming.statusCode, body: JSON.parse(text) }));
        });
        request.on('error', reject);
        request.end(body);
    });
    assert.equal(withBody.status, 200);
    assert.deepEqual(withBody.body, { success: true, data: publicProfile });
    assert.deepEqual(state.calls.identities, ['42', '42']);
    assert.deepEqual(state.calls.profiles, ['42', '42']);
    assert.equal((await state.request('/perfil/99', { headers: state.auth })).status, 404);
});

test('own profile remains available with expired credential or inactive consent, including immediately activated accounts', async t => {
    const state = await fixture(t);
    for (const change of [{ validade: '01/01/2020' }, { consent_at: null }, { consent_revoked_at: '2026-11-09' },
        { email_verificado: false, cadastro_liberado: true }]) {
        state.member({ ...identity, ...change });
        state.profile({ ...storedProfile, ...change });
        const response = await state.request('/perfil', { headers: state.auth });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).data.id, '42');
    }
    state.profile({ id: 42, nome: identity.nome, email: publicProfile.email });
    const minimal = (await (await state.request('/perfil', { headers: state.auth })).json()).data;
    for (const field of Object.keys(publicProfile).filter(field => !['id', 'nome', 'email'].includes(field))) assert.equal(minimal[field], null, field);
});

test('profile rejects missing, malformed, wrong-scope and expired tokens before loading personal data', async t => {
    const state = await fixture(t);
    const reader = createLeitorTokenService(secret).issue({ id: 7, auth_version: 3 }).token;
    for (const headers of [{}, { Cookie: 'igreja.sid=browser-admin-session' },
        { Authorization: 'Bearer malformed' }, { Authorization: `Bearer ${reader}` }]) {
        const response = await state.request('/perfil', { headers });
        assert.equal(response.status, 401);
        assert.equal((await response.json()).success, false);
    }
    state.advance(2 * 60 * 60 * 1000);
    assert.equal((await state.request('/perfil', { headers: state.auth })).status, 401);
    assert.deepEqual(state.calls.profiles, []);
    assert.deepEqual(state.calls.identities, []);
});

test('profile checks current identity and cannot disclose a deleted, inactive or mismatched member', async t => {
    const state = await fixture(t);
    for (const member of [null, { ...identity, auth_version: 4 }, { ...identity, email_verificado: false, cadastro_liberado: false }]) {
        state.member(member);
        const response = await state.request('/perfil', { headers: state.auth });
        assert.ok([401, 403].includes(response.status));
        assert.equal((await response.json()).success, false);
    }
    assert.deepEqual(state.calls.profiles, []);
    state.member(identity);
    for (const profile of [null, { ...storedProfile, id: 99 }]) {
        state.profile(profile);
        const response = await state.request('/perfil', { headers: state.auth });
        assert.equal(response.status, 401);
        const body = await response.json();
        assert.equal(body.success, false);
        assert.equal('data' in body, false);
    }
});

test('profile preserves app origins and permits same-origin GET without Content-Type', async t => {
    const state = await fixture(t);
    for (const origin of ['https://evil.example', 'https://localhost.evil.example', 'http://localhost', 'null', null]) {
        const response = await state.request('/perfil', { origin, headers: state.auth });
        assert.equal(response.status, 403);
        assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
    assert.deepEqual(state.calls.profiles, []);
    for (const origin of [ANDROID, WEB]) {
        const response = await state.request('/perfil', { origin, headers: state.auth });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
    }
    assert.equal((await state.request('/perfil', { origin: null, headers: { ...state.auth, 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
});

test('profile loading errors never report a successful refresh or expose database details', async t => {
    const state = await fixture(t, { findMemberProfileById: async () => { throw new Error('private database detail'); } });
    const response = await state.request('/perfil', { headers: state.auth });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { success: false, message: 'Falha temporária.' });
});

test('profile refresh limit is per authenticated member rather than per church Wi-Fi', async t => {
    const state = await fixture(t, {
        findMemberById: async id => ({ ...identity, id: Number(id) }),
        findMemberProfileById: async id => ({ ...storedProfile, id: Number(id) })
    });
    for (let count = 0; count < 30; count++) {
        const response = await state.request('/perfil', { headers: state.auth });
        assert.equal(response.status, 200);
        await response.arrayBuffer();
    }
    assert.equal((await state.request('/perfil', { headers: state.auth })).status, 429);
    const otherToken = state.tokens.issue({ ...identity, id: 43 }).token;
    const other = await state.request('/perfil', { headers: { Authorization: `Bearer ${otherToken}` } });
    assert.equal(other.status, 200);
    assert.equal((await other.json()).data.id, '43');
});
