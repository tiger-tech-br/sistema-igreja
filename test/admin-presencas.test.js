const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../admin/js/presencas.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function attendancePage() {
    const elements = new Map();
    let poll;
    let requests = 0;
    const records = [
        { nome: 'Ana <img src=x>', cargo: 'Membro', ministerio: 'Louvor', data: '06/11/2026', periodo: 'noite', horario: '19:42' },
        { nome: 'Ana <img src=x>', cargo: 'Membro', ministerio: 'Louvor', data: '06/11/2026', periodo: 'manha', horario: '09:00' }
    ];
    let respond = async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: records }) });
    class Element {
        constructor() { this.children = []; this.listeners = {}; this.textContent = ''; }
        appendChild(child) { this.children.push(child); }
        replaceChildren(...children) { this.children = children; }
        addEventListener(name, callback) { this.listeners[name] = callback; }
    }
    const document = {
        hidden: false,
        getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
        createElement: () => new Element()
    };
    vm.runInContext(source, vm.createContext({ document, Error, Array,
        fetch: async () => { requests++; return respond(); },
        setInterval: callback => { poll = callback; }
    }));
    return { document, records, get: document.getElementById, requests: () => requests, poll: () => poll(), respond: callback => { respond = callback; } };
}

test('attendance page keeps all timestamps without a period column and retains data when offline', async () => {
    const state = attendancePage();
    await settle();
    const rows = state.get('presencas').children;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].children.length, 5);
    assert.equal(rows[0].children[0].textContent, 'Ana <img src=x>');
    assert.equal(rows[0].children[4].textContent, '19:42');
    assert.equal(rows[1].children[4].textContent, '09:00');
    state.document.hidden = true;
    state.poll();
    await settle();
    assert.equal(state.requests(), 1, 'hidden tabs skip polling');
    state.document.hidden = false;
    state.respond(async () => { throw new Error('Sem conexão'); });
    state.poll();
    await settle();
    assert.equal(state.get('presencas').children, rows, 'the last successful list survives a connection failure');
    assert.equal(state.get('status').textContent, 'Sem conexão');
    assert.equal(state.get('atualizar').disabled, false);
});

test('attendance page stops repeated requests when the admin session expires', async () => {
    const state = attendancePage();
    await settle();
    state.respond(async () => ({ ok: false, status: 401, json: async () => ({ success: false }) }));
    state.poll();
    await settle();
    assert.equal(state.get('presencas').children.length, 2);
    assert.equal(state.get('status').textContent, 'Sessão expirada. Entre novamente.');
    assert.equal(state.get('atualizar').disabled, true);
    const before = state.requests();
    state.poll();
    await settle();
    assert.equal(state.requests(), before);
});
