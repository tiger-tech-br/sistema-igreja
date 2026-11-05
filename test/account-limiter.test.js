const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ipKeyGenerator } = require('express-rate-limit');

// Execute the actual middleware with only the persistence boundary replaced.
// No real environment variables, accounts or database connections are used.
function fixture({ failQuery = false } = {}) {
    const hits = new Map();
    const queries = [];
    const failure = new Error('Simulated database failure');
    const fakePool = {
        async query(sql, args) {
            if (failQuery) throw failure;
            const [key, seconds] = args;
            queries.push({ key, seconds });
            const count = (hits.get(key) || 0) + 1;
            hits.set(key, count);
            return { rows: [{ hits: count }] };
        }
    };
    const moduleObject = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../middlewares/accountLimiter.js'), 'utf8'), {
        module: moduleObject,
        process: { env: { SESSION_SECRET: 'account-limiter-test-secret-with-no-real-value' } },
        require(name) {
            if (name === 'node:crypto') return crypto;
            if (name === 'express-rate-limit') return { ipKeyGenerator };
            if (name === '../database/connection') return fakePool;
            throw new Error(`Unexpected account limiter import: ${name}`);
        }
    }, { filename: 'accountLimiter.js' });
    return {
        create: moduleObject.exports, queries, hits, failure,
        async request(limiter, { ip = '203.0.113.10', email } = {}) {
            const result = { allowed: false, status: null, headers: {}, body: null, error: null };
            const res = {
                set(name, value) { result.headers[name] = value; return this; },
                status(value) { result.status = value; return this; },
                json(value) { result.body = value; return this; }
            };
            await limiter({ ip, body: email === undefined ? {} : { email } }, res, error => {
                if (error) result.error = error;
                else result.allowed = true;
            });
            return result;
        }
    };
}

test('existing limiter calls keep the same threshold for IP and account', async () => {
    const sharedIp = fixture();
    const legacy = sharedIp.create('legacy-login', 3, 60);
    for (let attempt = 1; attempt <= 3; attempt++) {
        assert.equal((await sharedIp.request(legacy, { email: `member-${attempt}@example.test` })).allowed, true);
    }
    const rejectedIp = await sharedIp.request(legacy, { email: 'fourth@example.test' });
    assert.equal(rejectedIp.status, 429);
    assert.equal(rejectedIp.allowed, false);
    assert.equal(rejectedIp.headers['Retry-After'], '60');

    const sharedAccount = fixture();
    const accountLegacy = sharedAccount.create('legacy-login', 3, 60);
    for (let attempt = 1; attempt <= 3; attempt++) {
        assert.equal((await sharedAccount.request(accountLegacy, { ip: `203.0.113.${attempt}`, email: 'same@example.test' })).allowed, true);
    }
    const rejectedAccount = await sharedAccount.request(accountLegacy, { ip: '203.0.113.4', email: 'same@example.test' });
    assert.equal(rejectedAccount.status, 429);
    assert.equal(rejectedAccount.allowed, false);
    assert.equal(sharedAccount.queries.every(query => query.seconds === 60), true);
});

test('member login permits 300 different accounts on one IP while preserving eight attempts per account', async () => {
    const state = fixture();
    const memberLogin = state.create('member-app-login', 8, 900, { ipMax: 300 });
    for (let member = 1; member <= 300; member++) {
        const response = await state.request(memberLogin, { email: `member-${member}@example.test` });
        assert.equal(response.allowed, true, `Member ${member} can sign in on the shared Wi-Fi`);
    }
    const crowdedIp = await state.request(memberLogin, { email: 'member-301@example.test' });
    assert.equal(crowdedIp.status, 429);
    assert.equal(crowdedIp.headers['Retry-After'], '900');

    const account = fixture();
    const memberAccount = account.create('member-app-login', 8, 900, { ipMax: 300 });
    for (let attempt = 1; attempt <= 8; attempt++) {
        assert.equal((await account.request(memberAccount, { email: 'same@example.test' })).allowed, true);
    }
    const ninth = await account.request(memberAccount, { email: 'same@example.test' });
    assert.equal(ninth.status, 429);
    assert.equal(ninth.allowed, false);
    assert.equal(ninth.body.success, false);
});

test('account normalization and scope isolation continue to apply with a separate IP ceiling', async () => {
    const state = fixture();
    const first = state.create('member-app-login', 2, 900, { ipMax: 300 });
    assert.equal((await state.request(first, { email: '  MEMBER@Example.test ' })).allowed, true);
    assert.equal((await state.request(first, { email: 'member@example.test' })).allowed, true);
    assert.equal((await state.request(first, { email: 'Member@example.test' })).status, 429);
    const otherScope = state.create('another-login', 2, 900, { ipMax: 300 });
    assert.equal((await state.request(otherScope, { email: 'member@example.test' })).allowed, true);
});

test('requests without an email keep only their IP budget and database failures reach error handling', async () => {
    const state = fixture();
    const limiter = state.create('no-account', 1, 60, { ipMax: 2 });
    assert.equal((await state.request(limiter)).allowed, true);
    assert.equal((await state.request(limiter)).allowed, true);
    assert.equal((await state.request(limiter)).status, 429);
    assert.equal(state.hits.size, 1);
    const broken = fixture({ failQuery: true });
    const response = await broken.request(broken.create('failure'));
    assert.equal(response.allowed, false);
    assert.equal(response.error, broken.failure);
    assert.equal(response.status, null);
});
