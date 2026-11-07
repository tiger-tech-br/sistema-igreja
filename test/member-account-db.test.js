const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { createMemberAccountService } = require('../services/memberAccountService');

// Only an explicitly configured test database is used. All tables are temporary,
// created from the real schema and migrations, and disappear when the client closes.
test('self deletion removes linked data using the real PostgreSQL schema and migrations', {
    skip: !process.env.ATTENDANCE_TEST_DATABASE_URL
}, async () => {
    const client = new Client({ connectionString: process.env.ATTENDANCE_TEST_DATABASE_URL });
    await client.connect();
    try {
        await client.query('SET search_path TO pg_temp');
        const temporary = sql => sql.replace(/\bCREATE TABLE\b/g, 'CREATE TEMP TABLE');
        await client.query(temporary(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8')));
        const migrations = path.join(__dirname, '../database/migrations');
        for (const file of fs.readdirSync(migrations).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
            await client.query(temporary(fs.readFileSync(path.join(migrations, file), 'utf8')));
        }
        const { rows: [member] } = await client.query(`INSERT INTO membros(nome,email,senha,matricula,validade)
            VALUES('Membro de teste','exclusao@example.invalid','password-hash','TEST-DELETE','2099-12-31') RETURNING id`);
        const { rows: [access] } = await client.query(`INSERT INTO acessos(membro_id,data,horario) VALUES($1,'2026-11-06','19:42') RETURNING id`, [member.id]);
        await client.query("INSERT INTO privacy_requests(id,membro_id,tipo,mensagem) VALUES($1,$2,'exclusao','Texto pessoal de teste')", [crypto.randomUUID(), member.id]);
        await client.query("INSERT INTO privacy_consents(membro_id,version,texto) VALUES($1,'teste','Autorização de teste')", [member.id]);
        await client.query('INSERT INTO member_scan_state(membro_id,revision,acesso_id) VALUES($1,1,$2)', [member.id, access.id]);
        await client.query(`INSERT INTO remembered_mobile_sessions(id,app,membro_id,auth_version,token_hash,expires_at)
            VALUES($1,'membro',$2,1,$3,NOW()+INTERVAL '1 day')`, [crypto.randomUUID(), member.id, 'a'.repeat(64)]);
        const service = createMemberAccountService({
            pool: { connect: async () => ({ query: client.query.bind(client), release() {} }) },
            comparePassword: async (password, hash) => password === 'correct-password' && hash === 'password-hash',
            removeQrFile: async () => {}
        });
        await service.deleteOwn({ id: member.id, senha: 'correct-password' });
        for (const table of ['membros', 'privacy_requests', 'privacy_consents', 'acessos', 'member_scan_state', 'remembered_mobile_sessions']) {
            assert.equal(Number((await client.query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count), 0, table);
        }
        const { rows: events } = await client.query("SELECT actor_id,target_id FROM security_audit WHERE action='member_self_deleted'");
        assert.deepEqual(events, [{ actor_id: null, target_id: null }]);
    } finally { await client.end(); }
});
