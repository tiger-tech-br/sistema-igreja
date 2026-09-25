const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../admin/js/scanner/scanner.js'), 'utf8');

function scanner(response) {
    const alerts = [], requests = [];
    const elements = {};
    const context = vm.createContext({
        URL, console,
        document: { getElementById: id => elements[id] ||= { addEventListener() {} }, addEventListener() {} },
        window: { location: { origin: 'https://igreja.example', href: '' }, addEventListener() {} },
        Html5Qrcode: class {},
        alert: message => alerts.push(message),
        fetch: async (url, options) => {
            requests.push({ url, method: options.method });
            return { ok: response.success, json: async () => response };
        }
    });
    vm.runInContext(source, context);
    return { context, alerts, requests, elements };
}

test('QR displayed on screen or printed submits attendance through the admin endpoint', async () => {
    const state = scanner({ success: true, data: { alreadyRecorded: false, nome: 'Maria', data: '24/09/2026', horario: '12:30:00' } });
    assert.equal(await state.context.abrirCredencialValidada('https://igreja.example/validar?id=42'), true);
    assert.deepEqual(state.requests, [{ url: '/api/membros/presenca/42', method: 'POST' }]);
    assert.equal(state.alerts.length, 0);
    assert.equal(state.context.window.location.href, '');
    assert.equal(state.elements.nomePresenca.textContent, 'Maria');
    assert.equal(state.elements.dataPresenca.textContent, '24/09/2026');
    assert.equal(state.elements.horaPresenca.textContent, '12:30:00');
    assert.equal(state.elements.resultadoPresenca.hidden, false);
});

test('repeat attendance explicitly reports that no duplicate was created', async () => {
    const state = scanner({ success: true, data: { alreadyRecorded: true } });
    await state.context.abrirCredencialValidada('/validar?id=42');
    assert.match(state.alerts[0], /já teve a presença registrada neste período/);
    assert.equal(state.requests.length, 1);
});

test('rejected attendance does not show success or open the credential', async () => {
    const state = scanner({ success: false, message: 'Credencial inválida.' });
    await assert.rejects(state.context.registrarEabrir('42'), /Credencial inválida/);
    assert.equal(state.alerts.length, 0);
    assert.equal(state.context.window.location.href, '');
});
