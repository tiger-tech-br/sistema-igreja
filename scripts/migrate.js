require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../database/connection');
async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(7632401)');
        await client.query('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
        const migrationsDirectory = path.join(__dirname, '../database/migrations');
        const migrations = fs.readdirSync(migrationsDirectory)
            .filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file))
            .sort();
        for (const file of migrations) {
            const name = path.basename(file, '.sql');
            const applied = await client.query('SELECT 1 FROM app_migrations WHERE name = $1', [name]);
            if (applied.rowCount) continue;
            await client.query(fs.readFileSync(path.join(migrationsDirectory, file), 'utf8'));
            await client.query('INSERT INTO app_migrations (name) VALUES ($1)', [name]);
        }
        await client.query('COMMIT');
        console.log('Migração de privacidade e segurança aplicada.');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
}
if (require.main === module) migrate().catch(() => { console.error('Falha na migração. Verifique o esquema e a conexão.'); process.exitCode = 1; }).finally(() => pool.end());
module.exports = migrate;
