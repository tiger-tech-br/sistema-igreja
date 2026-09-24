const test = require('node:test');
const assert = require('node:assert/strict');
const { adultDate, passwordValid, hashToken, escapeHtml } = require('../utils/security');

test('adultDate rejects minors and impossible dates', () => {
    const today = new Date('2026-09-23T12:00:00Z');
    assert.equal(adultDate('24/09/2008', today), null);
    assert.equal(adultDate('23/09/2008', today), '2008-09-23');
    assert.equal(adultDate('31/02/2000', today), null);
});

test('password limit matches bcrypt safe input size', () => {
    assert.equal(passwordValid('123456789012'), true);
    assert.equal(passwordValid('short'), false);
    assert.equal(passwordValid('á'.repeat(37)), false);
});

test('tokens are stored as hashes and template values are escaped', () => {
    assert.equal(hashToken('token'), '3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0');
    assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
