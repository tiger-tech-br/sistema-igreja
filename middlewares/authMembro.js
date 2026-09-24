module.exports = function member(req, res, next) {
    if (req.session.membro) return next();
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ success: false, message: 'Entre na sua conta para continuar.' });
    res.redirect('/');
};
