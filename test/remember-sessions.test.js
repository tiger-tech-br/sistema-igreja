const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { createRememberSessionService, REMEMBER_TTL_MS } = require('../services/rememberSessionService');
const { createLeitorRouter } = require('../routes/leitorRoutes');
const { createAppMembroRouter } = require('../routes/appMembroRoutes');
const { createLeitorTokenService } = require('../services/leitorTokenService');
const { createAppMembroTokenService } = require('../services/appMembroTokenService');

const WEB = 'https://igreja.example';
const NATIVE = 'https://localhost';
const secret = crypto.randomBytes(48).toString('hex');
const noLimit = () => (req, res, next) => next();

// The service and HTTP routes are real; only the database and identities are isolated.
function sessionState() {
    let time = Date.parse('2026-11-06T12:00:00Z');
    const records = new Map();
    const pool = {
        async query(sql, args) {
            if (sql.startsWith('INSERT INTO remembered_mobile_sessions')) {
                const [id, app, admin_id, membro_id, auth_version, hash, created_at, expires_at] = args;
                records.set(hash, { id, app, admin_id, membro_id, auth_version, token_hash: hash,
                    created_at, expires_at, revoked_at: null });
                return { rows: [], rowCount: 1 };
            }
            const record = records.get(args[1]);
            if (sql.startsWith('SELECT ')) {
                return { rows: record && record.app === args[0] && !record.revoked_at &&
                    record.expires_at.getTime() > args[2].getTime() ? [{ ...record }] : [] };
            }
            if (sql.startsWith('UPDATE remembered_mobile_sessions')) {
                if (record && record.app === args[0] && !record.revoked_at) record.revoked_at = args[2];
                return { rows: [], rowCount: record ? 1 : 0 };
            }
            throw new Error('Unexpected isolated database operation');
        }
    };
    const now = () => time;
    return { records, now, advance: ms => { time += ms; }, service: createRememberSessionService({ pool, now }) };
}

test('remember credentials use random opaque tokens and persist only their hash for a fixed thirty days', async () => {
    const state = sessionState();
    const identity = { id: 7, auth_version: 3, senha: 'must-not-save-password' };
    const first = await state.service.issue('leitor', identity);
    const second = await state.service.issue('leitor', identity);
    assert.match(first.refreshToken, /^rs1\.[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first.refreshToken, second.refreshToken);
    assert.equal(new Date(first.refreshExpiresAt).getTime(), state.now() + REMEMBER_TTL_MS);
    const saved = [...state.records.values()][0];
    assert.equal(saved.token_hash, crypto.createHash('sha256').update(first.refreshToken).digest('hex'));
    assert.equal(saved.admin_id, 7);
    assert.equal(saved.membro_id, null);
    assert.equal(JSON.stringify([...state.records.values()]).includes(first.refreshToken), false);
    assert.equal(JSON.stringify([...state.records.values()]).includes(identity.senha), false);
});

test('remember credentials restore beyond the two-hour access lifetime without extending the thirty-day limit', async () => {
    const state = sessionState();
    const identity = { id: 42, auth_version: 3, email_verificado: true };
    const issued = await state.service.issue('membro', identity);
    state.advance(3 * 60 * 60 * 1000);
    const restored = await state.service.restore('membro', issued.refreshToken, async id => {
        assert.equal(id, identity.id);
        return identity;
    });
    assert.equal(restored.refreshToken, issued.refreshToken);
    assert.equal(restored.refreshExpiresAt, issued.refreshExpiresAt);
    state.advance(REMEMBER_TTL_MS - 3 * 60 * 60 * 1000);
    assert.equal(await state.service.restore('membro', issued.refreshToken, async () => identity), null);
});

test('remember credentials are isolated by app and revoked on changed, deleted or unconfirmed identities', async () => {
    for (const changed of [null, { id: 42, auth_version: 4, email_verificado: true },
        { id: 42, auth_version: 3, email_verificado: false }]) {
        const state = sessionState();
        const issued = await state.service.issue('membro', { id: 42, auth_version: 3 });
        assert.equal(await state.service.restore('leitor', issued.refreshToken, async () => { throw new Error('Wrong app must not load identity'); }), null);
        assert.equal(await state.service.restore('membro', issued.refreshToken, async () => changed), null);
        assert.ok([...state.records.values()][0].revoked_at);
        assert.equal(await state.service.restore('membro', issued.refreshToken, async () => ({ id: 42, auth_version: 3, email_verificado: true })), null);
    }
});

test('logout revokes only the matching remember credential and malformed tokens do not query identities', async () => {
    const state = sessionState();
    const identity = { id: 7, auth_version: 3 };
    const first = await state.service.issue('leitor', identity);
    const second = await state.service.issue('leitor', identity);
    await state.service.revoke('membro', first.refreshToken);
    assert.ok(await state.service.restore('leitor', first.refreshToken, async () => identity));
    await state.service.revoke('leitor', first.refreshToken);
    await state.service.revoke('leitor', first.refreshToken);
    assert.equal(await state.service.restore('leitor', first.refreshToken, async () => identity), null);
    assert.ok(await state.service.restore('leitor', second.refreshToken, async () => identity));
    for (const value of [null, {}, [], '', 'rs1.invalid', 'rs1.' + 'a'.repeat(44)]) {
        assert.equal(await state.service.restore('leitor', value, async () => { throw new Error('Invalid token must not reach identity'); }), null);
        await state.service.revoke('leitor', value);
    }
});

async function fixture(t) {
    const state = sessionState();
    const identities = {
        leitor: { id: 7, nome: 'Administrador de teste', auth_version: 3, senha: 'hash' },
        membro: { id: 42, nome: 'Membro de teste', auth_version: 3, email_verificado: true, senha: 'hash' }
    };
    const tokens = {
        leitor: createLeitorTokenService(secret, { now: state.now }),
        membro: createAppMembroTokenService(secret, { now: state.now })
    };
    const app = express();
    app.use(express.json());
    const baseOptions = { appUrl: WEB, rememberSessionService: state.service, now: state.now,
        comparePassword: async (password, hash) => password === 'fixture-password' && hash === 'hash', limit: noLimit };
    app.use('/api/leitor', createLeitorRouter({ ...baseOptions, tokenService: tokens.leitor,
        findAdminByEmail: async email => email === 'leitor@example.test' ? identities.leitor : null,
        findAdminById: async id => String(identities.leitor?.id) === String(id) ? identities.leitor : null,
        registerAttendance: async () => null }));
    app.use('/api/app-membro', createAppMembroRouter({ ...baseOptions, tokenService: tokens.membro,
        findMemberByEmail: async email => email === 'membro@example.test' ? identities.membro : null,
        findMemberById: async id => String(identities.membro?.id) === String(id) ? identities.membro : null,
        readScanState: async () => ({ revision: '0', attendance: null }), generateQrDataUrl: async () => '' }));
    app.use((error, req, res, next) => res.status(500).json({ success: false, message: 'Falha isolada.' }));
    const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const paths = { leitor: '/api/leitor', membro: '/api/app-membro' };
    async function request(appName, path, { origin = NATIVE, body = {}, headers = {} } = {}) {
        return fetch(`http://127.0.0.1:${server.address().port}${paths[appName]}${path}`, {
            method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
        });
    }
    function login(appName, rememberMe, extra = {}) {
        return request(appName, '/login', { ...extra, body: { email: `${appName}@example.test`, senha: 'fixture-password', rememberMe } });
    }
    return { ...state, identities, tokens, request, login };
}

for (const appName of ['leitor', 'membro']) {
    test(`${appName}: the checkbox alone controls native remember credentials; the old unchecked login shape stays unchanged`, async t => {
        const state = await fixture(t);
        for (const value of [undefined, false, 'true']) {
            const response = await state.login(appName, value);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('set-cookie'), null);
            const result = await response.json();
            assert.equal('refreshToken' in result.data, false);
            assert.equal('refreshExpiresAt' in result.data, false);
        }
        assert.equal(state.records.size, 0);
        const response = await state.login(appName, true);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('set-cookie'), null);
        const result = await response.json();
        assert.equal(typeof result.data.refreshToken, 'string');
        assert.equal(state.tokens[appName].verify(result.data.token).authVersion, 3);
        assert.equal(state.records.size, 1);
    });

    test(`${appName}: native refresh renews access after two hours and logout prevents restoring it again`, async t => {
        const state = await fixture(t);
        const access = (await (await state.login(appName, true)).json()).data;
        state.advance(3 * 60 * 60 * 1000);
        assert.equal(state.tokens[appName].verify(access.token), null);
        const refreshed = await state.request(appName, '/refresh', { body: { refreshToken: access.refreshToken } });
        assert.equal(refreshed.status, 200);
        const current = (await refreshed.json()).data;
        assert.ok(state.tokens[appName].verify(current.token));
        assert.equal(current.refreshExpiresAt, access.refreshExpiresAt);
        assert.equal(current.refreshToken, access.refreshToken);
        const otherApp = appName === 'leitor' ? 'membro' : 'leitor';
        assert.equal((await state.request(otherApp, '/refresh', { body: { refreshToken: access.refreshToken } })).status, 401);
        for (let attempt = 0; attempt < 2; attempt++) {
            const response = await state.request(appName, '/logout', { body: { refreshToken: access.refreshToken } });
            assert.equal(response.status, 200);
            assert.equal((await response.json()).data.loggedOut, true);
        }
        assert.equal((await state.request(appName, '/refresh', { body: { refreshToken: access.refreshToken } })).status, 401);
    });

    test(`${appName}: website remembers only in its own HttpOnly cookie and never exposes the refresh credential in JSON`, async t => {
        const state = await fixture(t);
        const response = await state.login(appName, true, { origin: WEB });
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal('refreshToken' in result.data, false);
        assert.equal(typeof result.data.refreshExpiresAt, 'string');
        const cookie = response.headers.get('set-cookie');
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /Secure/i);
        assert.match(cookie, /SameSite=Strict/i);
        assert.match(cookie, appName === 'leitor' ? /Path=\/api\/leitor/ : /Path=\/api\/app-membro/);
        const cookieHeader = cookie.split(';')[0];
        const credential = decodeURIComponent(cookieHeader.slice(cookieHeader.indexOf('=') + 1));
        const refreshed = await state.request(appName, '/refresh', { origin: WEB, headers: { Cookie: cookieHeader } });
        assert.equal(refreshed.status, 200);
        assert.equal(refreshed.headers.get('set-cookie'), null, 'Restoring must not overwrite a newer login cookie or extend the fixed expiry');
        assert.equal('refreshToken' in (await refreshed.json()).data, false);
        // The website cannot exchange an arbitrary body credential, and Android ignores browser cookies.
        assert.equal((await state.request(appName, '/refresh', { origin: WEB, body: { refreshToken: credential } })).status, 401);
        assert.equal((await state.request(appName, '/refresh', { headers: { Cookie: cookieHeader } })).status, 401);
        const loggedOut = await state.request(appName, '/logout', { origin: WEB, headers: { Cookie: cookieHeader } });
        assert.equal(loggedOut.status, 200);
        assert.match(loggedOut.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
        assert.equal((await state.request(appName, '/refresh', { origin: WEB, headers: { Cookie: cookieHeader } })).status, 401);
    });

    test(`${appName}: an unchecked website login revokes its previous saved login and clears the cookie`, async t => {
        const state = await fixture(t);
        const saved = await state.login(appName, true, { origin: WEB });
        const cookie = saved.headers.get('set-cookie').split(';')[0];
        const response = await state.login(appName, false, { origin: WEB, headers: { Cookie: cookie } });
        assert.equal(response.status, 200);
        assert.equal('refreshExpiresAt' in (await response.json()).data, false);
        assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
        assert.equal((await state.request(appName, '/refresh', { origin: WEB, headers: { Cookie: cookie } })).status, 401);
    });
}

test('refresh rejects expired, revoked, deleted, password-reset and unconfirmed identities without weakening CORS', async t => {
    for (const change of [state => state.advance(REMEMBER_TTL_MS), state => { state.identities.membro = null; },
        state => { state.identities.membro.auth_version++; }, state => { state.identities.membro.email_verificado = false; }]) {
        const state = await fixture(t);
        const saved = (await (await state.login('membro', true)).json()).data;
        change(state);
        assert.equal((await state.request('membro', '/refresh', { body: { refreshToken: saved.refreshToken } })).status, 401);
    }
    const state = await fixture(t);
    const saved = (await (await state.login('leitor', true)).json()).data;
    const badOrigin = await state.request('leitor', '/refresh', { origin: 'https://evil.example', body: { refreshToken: saved.refreshToken } });
    assert.equal(badOrigin.status, 403);
    assert.equal(badOrigin.headers.get('access-control-allow-origin'), null);
    const wrongCookie = await state.request('membro', '/refresh', { origin: WEB,
        headers: { Cookie: 'igreja.sid=old-browser-session;igreja.leitor.remember=' + saved.refreshToken } });
    assert.equal(wrongCookie.status, 401);
});
