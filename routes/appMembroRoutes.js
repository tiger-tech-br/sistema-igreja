const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { createAppMembroTokenService } = require('../services/appMembroTokenService');
const { memberCredentialResult } = require('../services/memberCredentialService');

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const validEmail = value => typeof value === 'string' && value.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validCursor = value => typeof value === 'string' && /^(0|[1-9]\d{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n;

function createAppMembroRouter(options = {}) {
    const router = express.Router();
    const now = options.now || Date.now;
    const appOrigin = new URL(options.appUrl || process.env.APP_URL || 'http://localhost:3000').origin;
    const allowedOrigins = new Set([appOrigin, 'https://localhost']);
    const tokenService = options.tokenService || createAppMembroTokenService(options.secret || process.env.SESSION_SECRET, { now });
    const findMemberByEmail = options.findMemberByEmail || require('../models/membroModel').buscarPorEmail;
    const findMemberById = options.findMemberById || require('../models/membroModel').buscarIdentidadeApp;
    const readScanState = options.readScanState || require('../models/membroModel').lerEstadoLeitura;
    const comparePassword = options.comparePassword || require('bcrypt').compare;
    const generateQrDataUrl = options.generateQrDataUrl || (async id => {
        const buffer = await require('../services/qrCodeService').gerarQRCodeBuffer(id);
        return 'data:image/png;base64,' + buffer.toString('base64');
    });
    const limit = options.limit || require('../middlewares/accountLimiter');
    const ownLimiter = (name, count) => rateLimit({
        windowMs: 60000, limit: count, identifier: name,
        // A church Wi-Fi must not make members share one polling budget.
        keyGenerator: req => String(req.appMembro.id),
        standardHeaders: 'draft-8', legacyHeaders: false,
        message: { success: false, message: 'Muitas consultas. Aguarde um minuto e tente novamente.' }
    });
    const pollLimiter = options.pollLimiter || ownLimiter('member-app-poll', 90);
    const credentialLimiter = ownLimiter('member-app-credential', 60);

    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.vary('Origin');
        const origin = req.get('origin');
        const sameOriginRead = !origin && req.method === 'GET' && req.get('sec-fetch-site') === 'same-origin';
        if ((!origin && !sameOriginRead) || (origin && !allowedOrigins.has(origin))) {
            return fail(res, 403, 'Origem do aplicativo não autorizada.');
        }
        if (origin) res.set('Access-Control-Allow-Origin', origin);
        if (req.method !== 'OPTIONS') return next();
        const method = req.get('access-control-request-method');
        const headers = (req.get('access-control-request-headers') || '').split(',').map(header => header.trim().toLowerCase()).filter(Boolean);
        if (!['GET', 'POST'].includes(method) || headers.some(header => !['authorization', 'content-type'].includes(header))) {
            return fail(res, 403, 'Requisição do aplicativo não autorizada.');
        }
        res.set('Access-Control-Allow-Methods', 'GET, POST');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.set('Access-Control-Max-Age', '600');
        return res.sendStatus(204);
    });

    router.post('/login', limit('member-app-login', 8, 900, { ipMax: 300 }), async (req, res, next) => {
        try {
            if (!req.is('application/json')) return fail(res, 415, 'Envie os dados de acesso em JSON.');
            const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
            const senha = req.body?.senha;
            if (!validEmail(email) || typeof senha !== 'string' || !senha.length || Buffer.byteLength(senha) > 72) {
                return fail(res, 401, 'E-mail ou senha inválidos.');
            }
            const member = await findMemberByEmail(email);
            if (!member?.senha || !await comparePassword(senha, member.senha)) return fail(res, 401, 'E-mail ou senha inválidos.');
            if (!member.email_verificado) return fail(res, 403, 'Confirme seu e-mail. Para reenviar a confirmação, use Esqueci minha senha no site da igreja.');
            const access = tokenService.issue(member);
            return res.json({ success: true, data: {
                ...access, membro: { id: String(member.id), nome: member.nome }
            }, message: 'Acesso realizado.' });
        } catch (error) { next(error); }
    });

    async function authenticate(req, res, next) {
        try {
            const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(req.get('authorization') || '');
            const identity = match && tokenService.verify(match[1]);
            if (!identity) return fail(res, 401, 'Seu acesso expirou. Entre novamente.');
            const member = await findMemberById(identity.id);
            if (!member || member.auth_version !== identity.authVersion) return fail(res, 401, 'Seu acesso foi encerrado. Entre novamente.');
            if (!member.email_verificado) return fail(res, 403, 'Confirme seu e-mail antes de usar a credencial.');
            req.appMembro = { id: identity.id, expiresAt: identity.expiresAt, member };
            return next();
        } catch (error) { next(error); }
    }

    function requireCredential(req, res) {
        const credential = memberCredentialResult(req.appMembro.member, { now });
        if (credential.success) return credential.data;
        const message = credential.message === 'Credencial expirada.'
            ? 'Sua credencial expirou. Solicite a renovação à administração da igreja.'
            : 'Sua credencial está indisponível. Confira suas autorizações na área de Privacidade do site ou fale com a administração.';
        fail(res, 403, message);
        return null;
    }

    async function scanState(id) {
        const state = await readScanState(id) || { revision: '0', attendance: null };
        if (!validCursor(state.revision)) throw new Error('Estado de leitura inválido.');
        return state;
    }

    router.post('/qrcode', authenticate, credentialLimiter, async (req, res, next) => {
        try {
            if (!requireCredential(req, res)) return;
            const member = req.appMembro.member;
            const qrDataUrl = await generateQrDataUrl(req.appMembro.id);
            // Read the baseline after QR generation so an earlier scan is never replayed on entry.
            const state = await scanState(req.appMembro.id);
            return res.json({ success: true, data: {
                membro: { id: String(member.id), nome: member.nome, cargo: member.cargo || null,
                    ministerio: member.ministerio || null, matricula: member.matricula, validade: member.validade },
                qrDataUrl, cursor: state.revision
            } });
        } catch (error) { next(error); }
    });

    router.get('/presenca', authenticate, pollLimiter, async (req, res, next) => {
        try {
            if (!requireCredential(req, res)) return;
            const after = req.query.after;
            if (!validCursor(after)) return fail(res, 400, 'Referência de leitura inválida. Abra seu QR Code novamente.');
            const state = await scanState(req.appMembro.id);
            if (BigInt(after) > BigInt(state.revision)) return fail(res, 400, 'A referência de leitura mudou. Abra seu QR Code novamente.');
            if (BigInt(state.revision) <= BigInt(after) || !state.attendance) {
                return res.json({ success: true, data: { cursor: state.revision, confirmed: false } });
            }
            const attendance = state.attendance;
            return res.json({ success: true, data: { cursor: state.revision, confirmed: true, attendance: {
                periodo: attendance.periodo, data: attendance.data, horario: attendance.horario,
                alreadyRecorded: Boolean(attendance.alreadyRecorded)
            } } });
        } catch (error) { next(error); }
    });

    router.get('/credencial', authenticate, credentialLimiter, (req, res) => {
        const credential = memberCredentialResult(req.appMembro.member, { now });
        if (!credential.success) return fail(res, credential.status, credential.message);
        return res.json({ success: true, data: credential.data });
    });

    // This API cannot fall through to administrative or cookie-authenticated routes.
    router.use((req, res) => fail(res, 404, 'Rota do aplicativo não encontrada.'));
    return router;
}

module.exports = { createAppMembroRouter };
