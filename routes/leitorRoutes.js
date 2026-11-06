const express = require('express');
const { createLeitorTokenService } = require('../services/leitorTokenService');
const { createRememberSessionService } = require('../services/rememberSessionService');
const { createRememberSessionTransport } = require('../services/rememberSessionTransport');

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const validId = value => /^[1-9]\d{0,9}$/.test(String(value));
const validEmail = value => typeof value === 'string' && value.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// This API never reads or establishes an administrative browser session.
function createLeitorRouter(options = {}) {
    const router = express.Router();
    const appOrigin = new URL(options.appUrl || process.env.APP_URL || 'http://localhost:3000').origin;
    const allowedOrigins = new Set([appOrigin, 'https://localhost']);
    const tokenService = options.tokenService || createLeitorTokenService(options.secret || process.env.SESSION_SECRET);
    const findAdminByEmail = options.findAdminByEmail || require('../models/adminModel').buscarPorEmail;
    const findAdminById = options.findAdminById || (async id => {
        const { rows } = await require('../database/connection').query('SELECT id,nome,auth_version FROM administradores WHERE id=$1', [id]);
        return rows[0];
    });
    const comparePassword = options.comparePassword || require('bcrypt').compare;
    const registerAttendance = options.registerAttendance || require('../models/membroModel').registrarAcesso;
    const limit = options.limit || require('../middlewares/accountLimiter');
    const rememberedSessions = options.rememberSessionService || createRememberSessionService({ now: options.now });
    const rememberTransport = createRememberSessionTransport({ app: 'leitor', appOrigin });

    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.vary('Origin');
        const origin = req.get('origin');
        // Same-origin GET fetches do not always carry Origin. They still require Bearer authentication.
        const sameOriginRead = !origin && req.method === 'GET' && req.get('sec-fetch-site') === 'same-origin';
        if ((!origin && !sameOriginRead) || (origin && !allowedOrigins.has(origin))) return fail(res, 403, 'Origem do leitor não autorizada.');
        if (origin) res.set('Access-Control-Allow-Origin', origin);
        if (req.method !== 'OPTIONS') return next();
        const method = req.get('access-control-request-method');
        const headers = (req.get('access-control-request-headers') || '').split(',').map(header => header.trim().toLowerCase()).filter(Boolean);
        if (!['GET', 'POST'].includes(method) || headers.some(header => !['authorization', 'content-type'].includes(header))) {
            return fail(res, 403, 'Requisição do leitor não autorizada.');
        }
        res.set('Access-Control-Allow-Methods', 'GET, POST');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.set('Access-Control-Max-Age', '600');
        return res.sendStatus(204);
    });

    router.post('/login', limit('scanner-login', 5), async (req, res, next) => {
        try {
            if (!req.is('application/json')) return fail(res, 415, 'Envie os dados de acesso em JSON.');
            const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
            const senha = req.body?.senha;
            if (!validEmail(email) || typeof senha !== 'string' || !senha.length || Buffer.byteLength(senha) > 72) {
                return fail(res, 401, 'E-mail ou senha inválidos.');
            }
            const admin = await findAdminByEmail(email);
            if (!admin || !await comparePassword(senha, admin.senha)) return fail(res, 401, 'E-mail ou senha inválidos.');
            const previous = rememberTransport.isWeb(req) && rememberTransport.readCookie(req);
            if (previous) {
                await rememberedSessions.revoke('leitor', previous);
                rememberTransport.clear(req, res);
            }
            const access = tokenService.issue(admin);
            const remembered = req.body?.rememberMe === true
                ? rememberTransport.publish(req, res, await rememberedSessions.issue('leitor', admin)) : {};
            return res.json({ success: true, data: { ...access, ...remembered, admin: { nome: admin.nome } }, message: 'Leitor autorizado.' });
        } catch (error) { next(error); }
    });

    router.post('/refresh', limit('scanner-refresh', 300), async (req, res, next) => {
        try {
            if (!req.is('application/json')) return fail(res, 415, 'Envie os dados de acesso em JSON.');
            const remembered = await rememberedSessions.restore('leitor', rememberTransport.read(req), findAdminById);
            if (!remembered) {
                rememberTransport.clear(req, res);
                return fail(res, 401, 'Seu acesso salvo expirou. Entre novamente.');
            }
            const { identity, ...refresh } = remembered;
            return res.json({ success: true, data: {
                ...tokenService.issue(identity), ...rememberTransport.publish(req, res, refresh, { setCookie: false }),
                admin: { nome: identity.nome }
            } });
        } catch (error) { next(error); }
    });

    router.post('/logout', async (req, res, next) => {
        try {
            if (!req.is('application/json')) return fail(res, 415, 'Envie os dados de acesso em JSON.');
            await rememberedSessions.revoke('leitor', rememberTransport.read(req));
            rememberTransport.clear(req, res);
            return res.json({ success: true, data: { loggedOut: true } });
        } catch (error) { next(error); }
    });

    async function authenticate(req, res, next) {
        try {
            const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(req.get('authorization') || '');
            const identity = match && tokenService.verify(match[1]);
            if (!identity) return fail(res, 401, 'Acesso ao leitor expirado. Entre novamente.');
            const admin = await findAdminById(identity.id);
            if (!admin || admin.auth_version !== identity.authVersion) return fail(res, 401, 'Acesso ao leitor revogado. Entre novamente.');
            req.leitor = { id: identity.id, nome: admin.nome, expiresAt: identity.expiresAt };
            return next();
        } catch (error) { next(error); }
    }

    router.get('/sessao', authenticate, (req, res) => {
        res.json({ success: true, data: { admin: { nome: req.leitor.nome }, expiresAt: req.leitor.expiresAt } });
    });

    router.post('/presenca/:id', authenticate, limit('scanner-attendance', 180, 60), async (req, res, next) => {
        try {
            if (!validId(req.params.id)) return fail(res, 400, 'QR Code inválido.');
            const attendance = await registerAttendance(req.params.id, req.leitor.id);
            if (!attendance) return fail(res, 404, 'Membro não encontrado. Este QR Code não corresponde a um cadastro existente.');
            return res.json({
                success: true,
                data: {
                    id: String(attendance.id), nome: attendance.nome,
                    cargo: attendance.cargo || null, ministerio: attendance.ministerio || null,
                    matricula: attendance.matricula || null, periodo: attendance.periodo,
                    data: attendance.data, horario: attendance.horario,
                    alreadyRecorded: Boolean(attendance.alreadyRecorded)
                },
                message: attendance.alreadyRecorded ? 'A presença já foi confirmada neste período.' : 'Presença registrada.'
            });
        } catch (error) { next(error); }
    });

    // Do not fall through into cookie-authenticated routes outside this API.
    router.use((req, res) => fail(res, 404, 'Rota do leitor não encontrada.'));
    return router;
}

module.exports = { createLeitorRouter };
