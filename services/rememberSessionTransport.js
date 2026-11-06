function createRememberSessionTransport({ app, appOrigin }) {
    const name = app === 'leitor' ? 'igreja.leitor.remember' : 'igreja.membro.remember';
    const path = app === 'leitor' ? '/api/leitor' : '/api/app-membro';
    const cookieOptions = { path, httpOnly: true, sameSite: 'strict', secure: new URL(appOrigin).protocol === 'https:' };
    const isWeb = req => req.get('origin') === appOrigin;
    function readCookie(req) {
        for (const part of (req.get('cookie') || '').split(';')) {
            const separator = part.indexOf('=');
            if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
            try { return decodeURIComponent(part.slice(separator + 1).trim()); }
            catch { return null; }
        }
        return null;
    }
    function read(req) {
        return isWeb(req) ? readCookie(req) : req.body?.refreshToken;
    }
    function publish(req, res, remembered, { setCookie = true } = {}) {
        if (!isWeb(req)) return remembered;
        if (setCookie) {
            res.cookie(name, remembered.refreshToken, {
                ...cookieOptions, expires: new Date(remembered.refreshExpiresAt)
            });
        }
        return { refreshExpiresAt: remembered.refreshExpiresAt };
    }
    function clear(req, res) {
        if (isWeb(req)) res.clearCookie(name, cookieOptions);
    }
    return { read, publish, clear, isWeb, readCookie };
}

module.exports = { createRememberSessionTransport };
