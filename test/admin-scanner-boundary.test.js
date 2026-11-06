const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const session = require('express-session');
const signature = require('cookie-signature');

test('the administrative panel cannot open a camera while the separate web reader remains available', async t => {
    const envKeys = ['SESSION_SECRET', 'APP_URL', 'NODE_ENV', 'RAILWAY_ENVIRONMENT', 'TRUST_PROXY_HOPS', 'DATABASE_URL'];
    const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    const secret = crypto.randomBytes(48).toString('hex');
    process.env.SESSION_SECRET = secret;
    process.env.APP_URL = 'http://127.0.0.1:3000';
    process.env.NODE_ENV = 'test';
    // A synthetic configuration is set before requiring the lazy pool; no real database is used.
    process.env.DATABASE_URL = 'postgres://fixture:fixture@127.0.0.1:1/fixture';
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.TRUST_PROXY_HOPS;
    const pool = require('../database/connection');
    const originalQuery = pool.query;
    const identityChecks = [];
    pool.query = async (sql, args) => {
        assert.match(sql, /^SELECT auth_version FROM administradores WHERE id = \$1$/);
        assert.deepEqual(args, [7]);
        identityChecks.push(args[0]);
        return { rows: [{ auth_version: 3 }], rowCount: 1 };
    };
    const store = new session.MemoryStore();
    let server;
    t.after(async () => {
        if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
        pool.query = originalQuery;
        for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });
    const { createApp } = require('../app');
    const app = createApp({ sessionStore: store });
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const id = crypto.randomBytes(24).toString('hex');
    await new Promise((resolve, reject) => store.set(id, {
        cookie: { originalMaxAge: 7200000, expires: new Date(Date.now() + 7200000), httpOnly: true, path: '/', secure: false, sameSite: 'lax' },
        admin: { id: 7, nome: 'Administrador de teste', authVersion: 3 }
    }, error => error ? reject(error) : resolve()));
    const cookie = 'igreja.sid=' + encodeURIComponent('s:' + signature.sign(id, secret));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, authenticated = false) => fetch(base + path, {
        redirect: 'manual', headers: authenticated ? { Cookie: cookie } : {}
    });
    const noCamera = response => assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');

    await t.test('legacy administrative scanner routes return to the dashboard after authentication', async () => {
        for (const path of ['/scanner', '/admin/scanner.html', '/scanner?member=42']) {
            const response = await request(path, true);
            assert.equal(response.status, 302, path);
            assert.equal(response.headers.get('location'), '/dashboard', path);
            noCamera(response);
        }
        const anonymous = await request('/scanner');
        assert.equal(anonymous.status, 302);
        assert.equal(anonymous.headers.get('location'), '/login-admin');
        noCamera(anonymous);
    });

    await t.test('the real dashboard has no scanner, camera or reader navigation', async () => {
        for (const path of ['/dashboard', '/admin/dashboard.html']) {
            const response = await request(path, true);
            assert.equal(response.status, 200, path);
            noCamera(response);
            const html = await response.text();
            assert.doesNotMatch(html, /getUserMedia|html5-qrcode|data-inline-scanner|\/scanner\/scanner\.js/);
            assert.doesNotMatch(html, /href=["']\/(?:scanner|admin\/scanner\.html|leitor(?:\/|["']))/);
        }
        assert.ok(identityChecks.length >= 5, 'administrative pages still validate the authenticated identity');
    });

    await t.test('camera access is denied on public and member pages as well as similarly named paths', async () => {
        for (const path of ['/', '/cadastro', '/login-admin', '/minha-credencial/', '/leitores', '/leitor-extra']) {
            const response = await request(path);
            assert.equal(response.status, path.startsWith('/leitores') || path === '/leitor-extra' ? 404 : 200, path);
            noCamera(response);
        }
    });

    await t.test('the independent reader preserves its camera policy for Safari and its standalone page', async () => {
        for (const [path, status] of [['/leitor', 301], ['/leitor/', 200], ['/leitor/index.html', 200]]) {
            const response = await request(path);
            assert.equal(response.status, status, path);
            assert.equal(response.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=()', path);
        }
    });
});
