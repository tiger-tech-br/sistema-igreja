const crypto = require('node:crypto');

const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const validApp = app => app === 'leitor' || app === 'membro';
const validToken = token => typeof token === 'string' && /^rs1\.[A-Za-z0-9_-]{43}$/.test(token);
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

function createRememberSessionService({ pool, now = Date.now } = {}) {
    const database = pool || require('../database/connection');

    async function revoke(app, refreshToken) {
        if (!validApp(app) || !validToken(refreshToken)) return;
        await database.query(`UPDATE remembered_mobile_sessions SET revoked_at=$3
            WHERE app=$1 AND token_hash=$2 AND revoked_at IS NULL`,
        [app, tokenHash(refreshToken), new Date(now())]);
    }

    async function issue(app, identity) {
        if (!validApp(app) || !/^[1-9]\d{0,9}$/.test(String(identity?.id)) ||
            !Number.isSafeInteger(identity.auth_version) || identity.auth_version < 1) {
            throw new Error('Identidade inválida para manter o acesso.');
        }
        const refreshToken = 'rs1.' + crypto.randomBytes(32).toString('base64url');
        const createdAt = new Date(now());
        const expiresAt = new Date(createdAt.getTime() + REMEMBER_TTL_MS);
        await database.query(`INSERT INTO remembered_mobile_sessions
            (id,app,admin_id,membro_id,auth_version,token_hash,created_at,expires_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [crypto.randomUUID(), app, app === 'leitor' ? identity.id : null,
            app === 'membro' ? identity.id : null, identity.auth_version,
            tokenHash(refreshToken), createdAt, expiresAt]);
        return { refreshToken, refreshExpiresAt: expiresAt.toISOString() };
    }

    async function restore(app, refreshToken, findIdentity) {
        if (!validApp(app) || !validToken(refreshToken)) return null;
        const { rows } = await database.query(`SELECT admin_id,membro_id,auth_version,expires_at,revoked_at
            FROM remembered_mobile_sessions
            WHERE app=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>$3`,
        [app, tokenHash(refreshToken), new Date(now())]);
        const remembered = rows[0];
        if (!remembered || remembered.revoked_at || new Date(remembered.expires_at).getTime() <= now()) return null;
        const identity = await findIdentity(app === 'leitor' ? remembered.admin_id : remembered.membro_id);
        if (!identity || identity.auth_version !== remembered.auth_version ||
            (app === 'membro' && !identity.email_verificado)) {
            await revoke(app, refreshToken);
            return null;
        }
        return { identity, refreshToken, refreshExpiresAt: new Date(remembered.expires_at).toISOString() };
    }

    return { issue, restore, revoke };
}

module.exports = { createRememberSessionService, REMEMBER_TTL_MS };
