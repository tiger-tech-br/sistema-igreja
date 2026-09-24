const crypto = require('node:crypto');
const pool = require('../database/connection');

function csrfProtection(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const expectedOrigin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
    if ((origin && origin !== expectedOrigin) || req.get('sec-fetch-site') === 'cross-site') {
        return res.status(403).json({ success: false, message: 'Origem da requisição não autorizada.' });
    }
    const received = req.get('x-csrf-token');
    const expected = req.session.csrfToken;
    if (typeof received !== 'string' || !expected || received.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
        return res.status(403).json({ success: false, message: 'Atualize a página e tente novamente.' });
    }
    next();
}
function csrfToken(req, res) {
    req.session.csrfToken ||= crypto.randomBytes(32).toString('hex');
    req.session.save(error => {
        if (error) return res.status(503).json({ success: false, message: 'Sessão indisponível.' });
        res.json({ token: req.session.csrfToken });
    });
}
async function refreshIdentity(req, res, next) {
    try {
        for (const [key, table] of [['membro', 'membros'], ['admin', 'administradores']]) {
            const identity = req.session[key];
            if (!identity) continue;
            const { rows } = await pool.query(`SELECT auth_version FROM ${table} WHERE id = $1`, [identity.id]);
            if (!rows[0] || identity.authVersion !== rows[0].auth_version) delete req.session[key];
        }
        next();
    } catch (error) { next(error); }
}
module.exports = { csrfProtection, csrfToken, refreshIdentity };
