const crypto = require('node:crypto');
const { ipKeyGenerator } = require('express-rate-limit');
const pool = require('../database/connection');

// Persistent and atomic: all application instances share the same budget.
function accountLimiter(scope, max = 8, seconds = 900) {
    return async (req, res, next) => {
        try {
            const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 150) : '';
            const identities = [`ip:${ipKeyGenerator(req.ip || 'unknown')}`];
            if (email) identities.push(`account:${email}`);
            for (const identity of identities) {
                const key = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(`${scope}:${identity}`).digest('hex');
                const { rows } = await pool.query(`INSERT INTO security_rate_limits (key, hits, expires_at)
                    VALUES ($1, 1, NOW() + $2 * INTERVAL '1 second')
                    ON CONFLICT (key) DO UPDATE SET
                    hits = CASE WHEN security_rate_limits.expires_at <= NOW() THEN 1 ELSE security_rate_limits.hits + 1 END,
                    expires_at = CASE WHEN security_rate_limits.expires_at <= NOW() THEN EXCLUDED.expires_at ELSE security_rate_limits.expires_at END
                    RETURNING hits`, [key, seconds]);
                if (rows[0].hits > max) {
                    res.set('Retry-After', String(seconds));
                    return res.status(429).json({ success: false, message: 'Muitas tentativas. Aguarde alguns minutos.' });
                }
            }
            next();
        } catch (error) { next(error); }
    };
}
module.exports = accountLimiter;
