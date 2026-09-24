require('dotenv').config({ quiet: true });
const { createApp } = require('./app');
const pool = require('./database/connection');
async function start() {
    const app = createApp();
    await pool.query('SELECT privacy_notice_version, consent_version, auth_version FROM membros LIMIT 0');
    await pool.query('SELECT 1 FROM privacy_requests LIMIT 0');
    app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Servidor iniciado.'));
}
if (require.main === module) start().catch(() => {
    console.error('Falha ao iniciar. Verifique configuração, banco e npm run migrate.');
    process.exitCode = 1;
    pool.end();
});
module.exports = { createApp };
