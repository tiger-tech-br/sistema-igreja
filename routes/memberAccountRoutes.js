const express = require('express');
const { createMemberAccountService } = require('../services/memberAccountService');

function createMemberAccountRouter(options = {}) {
    const router = express.Router();
    const member = options.member || require('../middlewares/authMembro');
    const limit = options.limit || require('../middlewares/accountLimiter');
    const account = options.accountService || createMemberAccountService();
    router.post('/excluir-conta', member, limit('member-self-delete', 5, 900), async (req, res, next) => {
        try {
            if (!req.is('application/json')) return res.status(415).json({ success: false, message: 'Envie sua senha em JSON.' });
            await account.deleteOwn({ id: req.session.membro.id, senha: req.body?.senha });
            // Deletion invalidates other sessions at their next identity check; remove this one now.
            req.session.destroy(error => {
                res.clearCookie('igreja.sid', { path: '/', httpOnly: true, secure: req.secure, sameSite: 'lax' });
                if (error) console.error('[DELETED_MEMBER_SESSION_CLEANUP_FAILED]');
                res.json({ success: true, data: { deleted: true }, message: 'Seu cadastro foi excluído. Você saiu da sua conta.' });
            });
        } catch (error) {
            if ([400, 401].includes(error.status)) return res.status(error.status).json({ success: false, message: error.message });
            next(error);
        }
    });
    return router;
}

module.exports = { createMemberAccountRouter };
