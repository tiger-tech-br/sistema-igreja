const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createMemberAccountService } = require('../services/memberAccountService');
const { createMemberAccountRouter } = require('../routes/memberAccountRoutes');

function database({ member = { id: 42, senha: 'password-hash' }, failDelete = false } = {}) {
    const queries = [];
    let released = false;
    const client = {
        async query(sql, args) {
            queries.push({ sql, args });
            if (sql.startsWith('SELECT id,senha')) return { rows: member ? [member] : [] };
            if (failDelete && sql.startsWith('DELETE FROM membros')) throw new Error('database unavailable');
            return { rows: [] };
        },
        release() { released = true; }
    };
    return { queries, released: () => released, pool: { connect: async () => client } };
}

test('self deletion checks the password under the member lock, deletes personal requests and commits before QR cleanup', async () => {
    const db = database();
    const cleaned = [];
    const service = createMemberAccountService({ pool: db.pool,
        comparePassword: async (password, hash) => {
            assert.equal(password, 'correct-password');
            assert.equal(hash, 'password-hash');
            assert.match(db.queries.at(-1).sql, /FOR UPDATE$/);
            return true;
        },
        removeQrFile: async id => { assert.equal(db.queries.at(-1).sql, 'COMMIT'); cleaned.push(id); }
    });
    assert.deepEqual(await service.deleteOwn({ id: 42, senha: 'correct-password' }), { deleted: true });
    assert.deepEqual(db.queries.map(q => q.sql), ['BEGIN', 'SELECT id,senha FROM membros WHERE id=$1 FOR UPDATE',
        'DELETE FROM privacy_requests WHERE membro_id=$1', 'DELETE FROM membros WHERE id=$1',
        "INSERT INTO security_audit(action) VALUES('member_self_deleted')", 'COMMIT']);
    assert.deepEqual(db.queries[2].args, [42]);
    assert.deepEqual(db.queries[3].args, [42]);
    assert.deepEqual(cleaned, ['42']);
    assert.equal(db.released(), true);
});

test('incorrect password or missing member rolls back without deleting data or a QR file', async () => {
    for (const member of [null, { id: 42, senha: 'password-hash' }]) {
        const db = database({ member });
        const service = createMemberAccountService({ pool: db.pool, comparePassword: async () => false,
            removeQrFile: async () => assert.fail('cleanup cannot run after a rejected password') });
        await assert.rejects(service.deleteOwn({ id: 42, senha: 'wrong-password' }), error => error.status === 401);
        assert.equal(db.queries.at(-1).sql, 'ROLLBACK');
        assert.equal(db.queries.some(q => q.sql.startsWith('DELETE')), false);
        assert.equal(db.released(), true);
    }
});

test('a database error rolls back all deletions and never deletes the legacy QR file', async () => {
    const db = database({ failDelete: true });
    const service = createMemberAccountService({ pool: db.pool, comparePassword: async () => true,
        removeQrFile: async () => assert.fail('cleanup cannot run after rollback') });
    await assert.rejects(service.deleteOwn({ id: 42, senha: 'correct-password' }), /database unavailable/);
    assert.equal(db.queries.at(-1).sql, 'ROLLBACK');
    assert.equal(db.queries.some(q => q.sql === 'COMMIT'), false);
    assert.equal(db.released(), true);
});

test('malformed identity and password are rejected before acquiring a database connection', async () => {
    const service = createMemberAccountService({ pool: { connect: () => assert.fail('invalid data cannot reach the database') }, comparePassword: async () => true });
    for (const input of [{ id: '../42', senha: 'password' }, { id: 0, senha: 'password' }, { id: 42, senha: '' }, { id: 42, senha: 'á'.repeat(37) }]) {
        await assert.rejects(service.deleteOwn(input), error => error.status === 400);
    }
});

async function routeFixture(t, { loggedIn = true, deletionError, destroyError } = {}) {
    const called = [];
    let destroyed = false;
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.session = { ...(loggedIn ? { membro: { id: 42 } } : {}), destroy: callback => { destroyed = true; callback(destroyError); } };
        next();
    });
    app.use('/api/privacidade', createMemberAccountRouter({
        limit: () => (req, res, next) => next(),
        accountService: { async deleteOwn(input) { called.push(input); if (deletionError) throw deletionError; return { deleted: true }; } }
    }));
    app.use((error, req, res, next) => res.status(503).json({ success: false, message: 'Falha temporária.' }));
    const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const request = (body, json = true) => fetch(`http://127.0.0.1:${server.address().port}/api/privacidade/excluir-conta`, {
        method: 'POST', headers: { 'Content-Type': json ? 'application/json' : 'text/plain' }, body: json ? JSON.stringify(body) : String(body)
    });
    return { request, called, destroyed: () => destroyed };
}

test('web deletion takes identity exclusively from the member session and clears that session after success', async t => {
    const state = await routeFixture(t);
    const response = await state.request({ id: 99, membro_id: 99, senha: 'correct-password' });
    assert.equal(response.status, 200);
    assert.deepEqual(state.called, [{ id: 42, senha: 'correct-password' }]);
    assert.equal(state.destroyed(), true);
    assert.equal((await response.json()).data.deleted, true);
    assert.match(response.headers.get('set-cookie'), /igreja\.sid=;/);
});

test('web deletion requires an authenticated member and JSON', async t => {
    const anonymous = await routeFixture(t, { loggedIn: false });
    assert.equal((await anonymous.request({ senha: 'password' })).status, 401);
    assert.equal(anonymous.called.length, 0);
    const signedIn = await routeFixture(t);
    assert.equal((await signedIn.request('password', false)).status, 415);
    assert.equal(signedIn.called.length, 0);
});

test('an incorrect password leaves the web session active and database failures report no success', async t => {
    const wrong = await routeFixture(t, { deletionError: Object.assign(new Error('Senha incorreta.'), { status: 401 }) });
    const rejected = await wrong.request({ senha: 'wrong-password' });
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json()).success, false);
    assert.equal(wrong.destroyed(), false);
    const unavailable = await routeFixture(t, { deletionError: new Error('connection lost') });
    assert.equal((await unavailable.request({ senha: 'correct-password' })).status, 503);
    assert.equal(unavailable.destroyed(), false);
});
