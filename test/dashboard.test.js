const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../admin/js/dashboard/dashboard.js'), 'utf8');

function dashboard() {
    const elements = new Map();
    const events = {};
    let poll;
    let requestCount = 0;
    let respond = async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { totalMembros: 12, totalPresencas: 3, ultimosAcessos: records } }) });
    class Element {
        constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.textContent = ''; }
        appendChild(child) { this.children.push(child); return child; }
        append(...children) { this.children.push(...children); }
        replaceChildren(...children) { this.children = children; }
        setAttribute(name, value) { this.attributes[name] = value; }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        querySelector(tag) { return this.children.find(child => child.tag === tag) || this.children.map(child => child.querySelector(tag)).find(Boolean) || null; }
    }
    const records = [
        { id: 1, nome: 'Ana <img src=x>', cargo: 'Membro', ministerio: 'Louvor', periodo: 'noite', horario: '19:42' },
        { id: 2, nome: 'Carlos', cargo: 'Diácono', ministerio: 'Recepção', periodo: 'tarde', horario: '15:00' },
        { id: 3, nome: 'Mariana', cargo: 'Membro', ministerio: 'Ensino', periodo: 'manha', horario: '09:00' }
    ];
    const buttons = ['manha', 'tarde', 'noite'].map(period => { const button = new Element('button'); button.dataset.periodo = period; return button; });
    const document = {
        hidden: true,
        getElementById: id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
        createElement: tag => new Element(tag),
        querySelectorAll: () => buttons,
        addEventListener: (name, callback) => { events[name] = callback; }
    };
    vm.runInContext(source, vm.createContext({ document, Intl, Date, Object, Map, Array, String, Number, Math, JSON, Error,
        fetch: async (...args) => { requestCount++; return respond(...args); },
        window: { setInterval: callback => { poll = callback; } }
    }));
    return { document, buttons, records, events, get: document.getElementById,
        poll: () => poll(), requests: () => requestCount, respond: fn => { respond = fn; } };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('dashboard has no camera or scanner navigation and keeps profile access', () => {
    for (const file of ['dashboard.html', 'membros.html', 'perfil.html', 'presencas.html', 'privacidade.html']) {
        const html = fs.readFileSync(path.join(__dirname, '../admin', file), 'utf8');
        assert.doesNotMatch(html, /href="\/scanner"|html5-qrcode|\/scanner\/scanner\.js|data-inline-scanner/);
    }
    assert.doesNotMatch(source, /Html5Qrcode|getUserMedia|dashboard:attendance/);
    assert.match(source, /\/admin\/perfil\?id=/);
});

test('dashboard polls actual attendance, filters periods, preserves data on failure and stops after expired session', async () => {
    const state = dashboard();
    state.events.DOMContentLoaded();
    await settle();
    assert.equal(state.requests(), 1, 'initial load happens even when the tab is inactive');
    assert.equal(state.get('totalMembros').textContent, 12);
    assert.equal(state.get('totalPresencas').textContent, 3);
    for (const period of ['manha', 'tarde', 'noite']) assert.equal(state.get(`quantidade-${period}`).textContent, 1);
    const night = state.buttons.find(button => button.dataset.periodo === 'noite');
    night.listeners.click();
    const table = state.get('tabelaUltimos');
    assert.equal(table.children.length, 1);
    const member = table.children[0].children[0].children[0];
    assert.equal(member.href, '/admin/perfil?id=1');
    assert.equal(member.children[1].textContent, 'Ana <img src=x>', 'member text is never interpreted as markup');
    assert.equal(state.get('totalPeriodo').textContent, '1 registro no período');
    await state.poll();
    assert.equal(state.requests(), 1, 'inactive polling does not request more data');
    state.document.hidden = false;
    state.records.push({ id: 4, nome: 'Pedro', periodo: 'noite', horario: '19:43' });
    await state.poll();
    assert.equal(table.children.length, 2);
    assert.equal(state.get('quantidade-noite').textContent, 2);
    assert.equal(state.get('atualizacaoAutomatica').dataset.state, 'success');
    state.respond(async () => { throw new Error('Sem conexão'); });
    await state.poll();
    assert.equal(table.children.length, 2, 'last known attendance remains visible during connection loss');
    assert.equal(state.get('totalMembros').textContent, 12);
    assert.equal(state.get('atualizacaoAutomatica').dataset.state, 'error');
    state.respond(async () => ({ ok: false, status: 401, json: async () => ({ success: false }) }));
    await state.poll();
    assert.equal(state.get('dashboardStatus').textContent, 'Sessão expirada. Entre novamente.');
    const before = state.requests();
    await state.poll();
    assert.equal(state.requests(), before, 'expired session stops repeated unauthorized requests');
});
