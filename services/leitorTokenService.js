const crypto = require('node:crypto');

const TOKEN_TTL_SECONDS = 2 * 60 * 60;
const TOKEN_SCOPE = 'presenca:registrar';
const TOKEN_AUDIENCE = 'igreja-leitor';
const validId = value => /^[1-9]\d{0,9}$/.test(String(value));

function createLeitorTokenService(secret, { now = Date.now } = {}) {
    if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('O leitor requer SESSION_SECRET com pelo menos 32 caracteres.');
    }
    // A distinct key keeps these tokens separate from browser sessions and other signatures.
    const key = crypto.createHmac('sha256', secret).update('igreja-leitor-token-v1').digest();
    const sign = payload => crypto.createHmac('sha256', key).update(payload).digest('base64url');

    function issue(admin) {
        if (!validId(admin?.id) || !Number.isSafeInteger(admin.auth_version) || admin.auth_version < 1) {
            throw new Error('Identidade administrativa inválida.');
        }
        const issuedAt = Math.floor(now() / 1000);
        const claims = {
            aud: TOKEN_AUDIENCE,
            scope: TOKEN_SCOPE,
            sub: String(admin.id),
            av: admin.auth_version,
            iat: issuedAt,
            exp: issuedAt + TOKEN_TTL_SECONDS,
            nonce: crypto.randomBytes(16).toString('base64url')
        };
        const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
        return { token: `l1.${payload}.${sign(payload)}`, expiresAt: new Date(claims.exp * 1000).toISOString() };
    }

    function verify(token) {
        if (typeof token !== 'string' || token.length > 1024) return null;
        const match = /^l1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
        if (!match) return null;
        const [, payload, signature] = match;
        const expected = sign(payload);
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
        try {
            const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
            const current = Math.floor(now() / 1000);
            if (claims.aud !== TOKEN_AUDIENCE || claims.scope !== TOKEN_SCOPE || !validId(claims.sub) ||
                !Number.isSafeInteger(claims.av) || claims.av < 1 ||
                !Number.isSafeInteger(claims.iat) || claims.iat < 0 || claims.iat > current + 30 ||
                !Number.isSafeInteger(claims.exp) || claims.exp <= current ||
                claims.exp - claims.iat !== TOKEN_TTL_SECONDS ||
                typeof claims.nonce !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(claims.nonce)) return null;
            return { id: claims.sub, authVersion: claims.av, expiresAt: new Date(claims.exp * 1000).toISOString() };
        } catch { return null; }
    }

    return { issue, verify };
}

module.exports = { createLeitorTokenService, TOKEN_TTL_SECONDS };
