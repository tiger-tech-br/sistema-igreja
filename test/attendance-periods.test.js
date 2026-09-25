const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

// Use an explicitly configured test database, never the application database.
test('period migration preserves history and allows only one attendance per period', {
    skip: !process.env.ATTENDANCE_TEST_DATABASE_URL
}, async () => {
    const client = new Client({ connectionString: process.env.ATTENDANCE_TEST_DATABASE_URL });
    await client.connect();
    try {
        await client.query('BEGIN');
        await client.query(`CREATE TEMP TABLE acessos (
            id SERIAL PRIMARY KEY, membro_id INTEGER NOT NULL,
            data DATE NOT NULL, horario TIME NOT NULL
        ) ON COMMIT DROP`);
        await client.query('CREATE UNIQUE INDEX acessos_membro_data_unique ON acessos(membro_id,data)');
        await client.query("INSERT INTO acessos(membro_id,data,horario) VALUES(1,'2026-09-24','00:00:00')");
        await client.query(fs.readFileSync(path.join(__dirname, '../database/migrations/004_attendance_periods.sql'), 'utf8'));
        const insert = (id, date, time) => client.query(`INSERT INTO acessos(membro_id,data,horario)
            VALUES($1,$2,$3) ON CONFLICT(membro_id,data,periodo) DO NOTHING RETURNING periodo`, [id,date,time]);
        for (const [time, count, period] of [
            ['11:59:59',0], ['12:00:00',1,'tarde'], ['17:59:59',0],
            ['18:00:00',1,'noite'], ['23:59:59',0]
        ]) {
            const result = await insert(1,'2026-09-24',time);
            assert.equal(result.rowCount,count,time);
            if (count) assert.equal(result.rows[0].periodo,period);
        }
        assert.equal((await client.query('SELECT * FROM acessos WHERE membro_id=1')).rowCount,3);
        assert.equal((await insert(1,'2026-09-25','00:00:00')).rows[0].periodo,'manha');
        assert.equal((await insert(2,'2026-09-24','11:59:59')).rows[0].periodo,'manha');
        assert.equal((await client.query('SELECT periodo FROM acessos WHERE id=1')).rows[0].periodo,'manha');
    } finally {
        await client.query('ROLLBACK');
        await client.end();
    }
});
