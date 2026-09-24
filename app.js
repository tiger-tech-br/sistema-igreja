const express = require('express');
const path = require('node:path');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');
const pool = require('./database/connection');
const PgSession = require('connect-pg-simple')(session);
const admin = require('./middlewares/auth');
const member = require('./middlewares/authMembro');
const { csrfProtection, csrfToken, refreshIdentity } = require('./middlewares/security');

function createApp({ sessionStore } = {}) {
    const production = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || /troque|exemplo/i.test(process.env.SESSION_SECRET)) {
        throw new Error('Configure SESSION_SECRET aleatório com pelo menos 32 caracteres.');
    }
    const appUrl = new URL(process.env.APP_URL || 'http://localhost:3000');
    if (production && appUrl.protocol !== 'https:') throw new Error('APP_URL deve usar HTTPS em produção.');
    const app = express();
    app.disable('x-powered-by');
    const configuredProxyHops = process.env.TRUST_PROXY_HOPS;
    const trustProxy = configuredProxyHops !== undefined && configuredProxyHops !== ''
        ? Number(configuredProxyHops)
        : process.env.RAILWAY_ENVIRONMENT ? 1 : false;
    if (configuredProxyHops && (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 2)) {
        throw new Error('TRUST_PROXY_HOPS deve ser 0, 1 ou 2.');
    }
    app.set('trust proxy', trustProxy);
    app.use(helmet({ referrerPolicy: { policy: 'no-referrer' },
        contentSecurityPolicy: { directives: {
            scriptSrc: ["'self'"], scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"],
            frameAncestors: ["'none'"], formAction: ["'self'"], objectSrc: ["'none'"],
            upgradeInsecureRequests: production ? [] : null
        } }, hsts: production, crossOriginEmbedderPolicy: false }));
    app.use((req, res, next) => {
        res.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
        res.set('Cache-Control', 'no-store');
        next();
    });
    app.use(compression());
    app.use(rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
        message: { success: false, message: 'Muitas requisições. Tente novamente em um minuto.' } }));
    app.use(express.json({ limit: '20kb' }));
    app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 30 }));
    app.use(session({ name: 'igreja.sid', store: sessionStore || new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
        secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
        cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 7200000 } }));
    app.get('/api/csrf', csrfToken);
    app.use(csrfProtection);
    app.use(refreshIdentity);
    // Never expose the repository, database dumps, dependencies or private QR directory.
    for (const directory of ['css', 'js', 'images', 'admin/css', 'admin/js']) {
        app.use('/' + directory, express.static(path.join(__dirname, directory), { dotfiles: 'deny', index: false }));
    }
    app.get('/vendor/html5-qrcode.min.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/html5-qrcode/html5-qrcode.min.js')));
    app.get('/qrcodes/:file', async (req, res, next) => {
        try {
            const match = /^membro-(\d+)\.png$/.exec(req.params.file);
            if (!match || (!req.session.admin && String(req.session.membro?.id) !== match[1])) return res.sendStatus(403);
            const result = await pool.query('SELECT id FROM membros WHERE id = $1 AND consent_revoked_at IS NULL', [match[1]]);
            if (!result.rowCount) return res.sendStatus(404);
            const buffer = await require('./services/qrCodeService').gerarQRCodeBuffer(match[1]);
            res.type('png').send(buffer);
        } catch (error) { next(error); }
    });
    app.use('/api/privacidade', require('./routes/privacyRoutes'));
    app.use('/api/membros', require('./routes/membroRoutes'));
    app.use('/api', require('./routes/adminRoutes'));
    app.use('/credencial', admin, require('./routes/credencialRoutes'));
    const page = file => (req, res) => res.sendFile(path.join(__dirname, file));
    for (const [urls, file] of [
        [['/', '/index.html'], 'index.html'], [['/cadastro', '/cadastro.html'], 'cadastro.html'],
        [['/esqueci-senha', '/esqueci-senha.html'], 'esqueci-senha.html'],
        [['/redefinir-senha', '/redefinir.senha.html'], 'redefinir.senha.html'],
        [['/confirmar-email'], 'confirmar-email.html'], [['/privacidade', '/privacidade.html'], 'privacidade.html'],
        [['/login-admin', '/admin/index.html'], 'admin/index.html']
    ]) app.get(urls, page(file));
    app.get(['/perfil', '/perfil.html'], member, page('perfil.html'));
    app.get(['/membros', '/membros.html'], member, page('membros.html'));
    for (const [urls, file] of [
        [['/dashboard', '/admin/dashboard.html'], 'dashboard.html'], [['/admin/membros', '/admin/membros.html'], 'membros.html'],
        [['/admin/perfil', '/admin/perfil.html'], 'perfil.html'], [['/scanner', '/admin/scanner.html'], 'scanner.html'],
        [['/admin/presencas.html'], 'presencas.html'],
        [['/admin/privacidade'], 'privacidade.html']
    ]) app.get(urls, admin, page('admin/' + file));
    // Public credential view is read-only and receives only minimal consented fields.
    app.get(['/validar', '/admin/validar.html'], page('admin/validar.html'));
    const logout = (req, res, next) => req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie('igreja.sid', { path: '/', httpOnly: true, secure: production, sameSite: 'lax' });
        res.json({ success: true });
    });
    app.post(['/logout', '/logout-admin', '/api/logout'], logout);
    app.get(['/logout', '/logout-admin', '/api/logout'], page('sair.html'));
    app.get(['/api/membros/redefinir-senha/:token', '/api/redefinir-senha/:token', '/redefinir-senha/:token'], (req, res) => {
        res.redirect('/redefinir-senha?token=' + encodeURIComponent(req.params.token));
    });
    app.use((req, res) => res.status(404).json({ success: false, message: 'Rota não encontrada.' }));
    app.use(require('./middlewares/errorMiddleware'));
    return app;
}
module.exports = { createApp };
