const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// This fixture exercises the real attendance transaction with a transactional
// connection double. Nothing reads an environment file or opens a database.
// The important boundary is that the receipt and the attendance become visible
// together only after a successful COMMIT.
function fixture({ existing = false, missingMember = false, failReceipt = false, failCommit = false } = {}) {
    let committed = {
        attendance: existing ? { acesso_id: 701, periodo: 'noite', data: '05/11/2026', horario: '18:02:03' } : null,
        revision: existing ? 4 : 0,
        audit: 0,
        receipt: null
    };
    let pending;
    const calls = [];
    let releases = 0;
    const client = {
        async query(sql, args = []) {
            const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
            calls.push({ sql: normalized, args });
            if (normalized === 'BEGIN') { pending = structuredClone(committed); return { rows: [], rowCount: 0 }; }
            if (normalized === 'ROLLBACK') { pending = null; return { rows: [], rowCount: 0 }; }
            if (normalized === 'COMMIT') {
                if (failCommit) throw new Error('Commit failed');
                committed = pending;
                pending = null;
                return { rows: [], rowCount: 0 };
            }
            assert.ok(pending, 'All attendance effects must be inside the transaction');
            if (normalized.startsWith('SELECT ') && normalized.includes('FROM MEMBROS ')) {
                return missingMember ? { rows: [], rowCount: 0 } : {
                    rows: [{ id: 42, nome: 'Membro de teste', cargo: 'Membro', ministerio: 'Louvor', matricula: 'TEST-42' }], rowCount: 1
                };
            }
            if (normalized.startsWith('INSERT INTO ACESSOS ')) {
                if (pending.attendance) return { rows: [], rowCount: 0 };
                pending.attendance = { acesso_id: 701, periodo: 'noite', data: '05/11/2026', horario: '18:02:03' };
                return { rows: [{ id: 701 }], rowCount: 1 };
            }
            if (normalized.startsWith('INSERT INTO SECURITY_AUDIT')) {
                pending.audit++;
                return { rows: [], rowCount: 1 };
            }
            if (normalized.startsWith('SELECT ') && normalized.includes('FROM ACESSOS')) {
                return { rows: pending.attendance ? [{ ...pending.attendance }] : [], rowCount: pending.attendance ? 1 : 0 };
            }
            if (normalized.startsWith('INSERT INTO MEMBER_SCAN_STATE')) {
                if (failReceipt) throw new Error('Receipt failed');
                pending.revision++;
                pending.receipt = { args: [...args], attendance: { ...pending.attendance } };
                return { rows: [{ revision: String(pending.revision) }], rowCount: 1 };
            }
            throw new Error(`Unexpected query in attendance fixture: ${normalized}`);
        },
        release() { releases++; }
    };
    const fakePool = { connect: async () => client };
    const moduleObject = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '../models/membroModel.js'), 'utf8');
    vm.runInNewContext(source, {
        module: moduleObject,
        require(name) {
            if (name === '../database/connection') return fakePool;
            if (name === 'bcrypt') return {};
            if (name === '../utils/security') return { hashToken: value => value };
            if (name === '../config/privacy') return {};
            throw new Error(`Unexpected model import: ${name}`);
        }
    }, { filename: 'membroModel.js' });
    return { model: moduleObject.exports, calls, get committed() { return committed; }, get releases() { return releases; } };
}

test('a new attendance and its member-app receipt are committed together while preserving the member ID', async () => {
    const state = fixture();
    const attendance = await state.model.registrarAcesso('42', '7');
    assert.equal(attendance.id, '42');
    assert.equal(attendance.horario, '18:02:03');
    assert.equal(attendance.alreadyRecorded, false);
    assert.equal(state.committed.attendance.acesso_id, 701);
    assert.equal(state.committed.revision, 1);
    assert.equal(state.committed.audit, 1);
    assert.equal(state.releases, 1);
    const receiptIndex = state.calls.findIndex(call => call.sql.startsWith('INSERT INTO MEMBER_SCAN_STATE'));
    const commitIndex = state.calls.findIndex(call => call.sql === 'COMMIT');
    assert.ok(receiptIndex > 0 && commitIndex > receiptIndex);
    assert.equal(String(state.committed.receipt.args[0]), '42');
    assert.equal(Number(state.committed.receipt.args[1]), 701);
});

test('a repeated valid scan advances the receipt but keeps the original presence time and attendance', async () => {
    const state = fixture({ existing: true });
    const first = await state.model.registrarAcesso('42', '7');
    assert.equal(first.alreadyRecorded, true);
    assert.equal(first.horario, '18:02:03');
    assert.equal(state.committed.revision, 5);
    assert.equal(state.committed.attendance.acesso_id, 701);
    assert.equal(state.committed.audit, 0);
    await state.model.registrarAcesso('42', '7');
    assert.equal(state.committed.revision, 6);
    assert.equal(state.committed.attendance.horario, '18:02:03');
    assert.equal(state.releases, 2);
});

test('a receipt storage failure rolls back the attendance instead of reporting a partial success', async () => {
    const state = fixture({ failReceipt: true });
    await assert.rejects(state.model.registrarAcesso('42', '7'), /Receipt failed/);
    assert.equal(state.committed.attendance, null);
    assert.equal(state.committed.revision, 0);
    assert.equal(state.committed.audit, 0);
    assert.equal(state.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(state.calls.some(call => call.sql === 'COMMIT'), false);
    assert.equal(state.releases, 1);
});

test('a failed commit never exposes a newer receipt to the member app', async () => {
    const state = fixture({ existing: true, failCommit: true });
    await assert.rejects(state.model.registrarAcesso('42', '7'), /Commit failed/);
    assert.equal(state.committed.revision, 4);
    assert.equal(state.committed.attendance.horario, '18:02:03');
    assert.equal(state.committed.receipt, null);
    assert.equal(state.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(state.releases, 1);
});

test('an unknown member cannot create an attendance or a recognition receipt', async () => {
    const state = fixture({ missingMember: true });
    assert.equal(await state.model.registrarAcesso('42', '7'), null);
    assert.equal(state.committed.attendance, null);
    assert.equal(state.committed.revision, 0);
    assert.equal(state.calls.some(call => call.sql.startsWith('INSERT ')), false);
    assert.equal(state.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(state.releases, 1);
});
