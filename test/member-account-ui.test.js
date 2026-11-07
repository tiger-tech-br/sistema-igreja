const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/excluir-conta.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function page({ loggedIn = true, deletion = async () => ({ ok: true, json: async () => ({ success: true, data: { deleted: true } }) }) } = {}) {
    const elements = new Map();
    const requests = [];
    const events = [];
    function get(id) {
        if (!elements.has(id)) elements.set(id, {
            hidden: false, disabled: false, value: '', textContent: '', handlers: {}, focused: false,
            addEventListener(event, callback) { this.handlers[event] = callback; },
            focus() { this.focused = true; },
            reset() { get('senhaExclusao').value = ''; }
        });
        return elements.get(id);
    }
    const document = { getElementById: get, querySelector: () => ({}), dispatchEvent: event => events.push(event.type) };
    vm.runInContext(source, vm.createContext({ document,
        CustomEvent: class { constructor(type) { this.type = type; } },
        fetch: async (url, options) => {
            requests.push({ url, options });
            return url === '/api/membros/sessao' ? { json: async () => ({ logado: loggedIn }) } : deletion();
        }
    }));
    const click = id => get(id).handlers.click();
    const submit = () => get('formExclusao').handlers.submit({ preventDefault() {} });
    return { get, click, submit, requests, events };
}

test('web deletion stays available only after login and opening or cancelling the form never sends a deletion', async () => {
    const anonymous = page({ loggedIn: false });
    await settle();
    assert.equal(anonymous.get('exclusaoAutenticada').hidden, true);
    const signedIn = page();
    await settle();
    assert.equal(signedIn.get('exclusaoAutenticada').hidden, false);
    signedIn.click('abrirExclusao');
    assert.equal(signedIn.get('formExclusao').hidden, false);
    signedIn.get('senhaExclusao').value = 'a-private-password';
    signedIn.click('cancelarExclusao');
    assert.equal(signedIn.get('formExclusao').hidden, true);
    assert.equal(signedIn.get('senhaExclusao').value, '');
    assert.equal(signedIn.requests.length, 1, 'only the read-only session check has happened');
});

test('confirming sends only the password once and clears the form after a successful deletion', async () => {
    let complete;
    const pending = new Promise(resolve => { complete = resolve; });
    const state = page({ deletion: () => pending });
    await settle();
    state.click('abrirExclusao');
    state.get('senhaExclusao').value = 'a-private-password';
    const first = state.submit();
    await state.submit();
    assert.equal(state.requests.length, 2, 'double submission does not send a second deletion');
    assert.deepEqual(JSON.parse(state.requests[1].options.body), { senha: 'a-private-password' });
    assert.equal(state.get('cancelarExclusao').disabled, true);
    complete({ ok: true, json: async () => ({ success: true, data: { deleted: true } }) });
    await first;
    assert.equal(state.get('exclusaoAutenticada').hidden, true);
    assert.equal(state.get('senhaExclusao').value, '');
    assert.equal(state.get('exclusaoConcluida').hidden, false);
    assert.deepEqual(state.events, ['member:deleted']);
});

test('a rejected password or failed connection leaves the account form open without reporting deletion', async () => {
    for (const deletion of [
        async () => ({ ok: false, json: async () => ({ success: false, message: 'Senha incorreta.' }) }),
        async () => { throw new Error('Sem conexão'); }
    ]) {
        const state = page({ deletion });
        await settle();
        state.click('abrirExclusao');
        state.get('senhaExclusao').value = 'a-private-password';
        await state.submit();
        assert.equal(state.get('formExclusao').hidden, false);
        assert.equal(state.get('senhaExclusao').value, '');
        assert.match(state.get('resultadoExclusao').textContent, /Senha incorreta|Sem conexão/);
        assert.equal(state.get('confirmarExclusao').disabled, false);
        assert.deepEqual(state.events, []);
    }
});
