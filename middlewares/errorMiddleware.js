module.exports = function errorMiddleware(error, req, res, next) {
    if (res.headersSent) return next(error);
    console.error('[REQUEST_FAILED]', error.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'INTERNAL');
    const status = error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500;
    res.status(status).json({ success: false, message: status === 500 ? 'Não foi possível concluir a operação.' : 'Requisição inválida.' });
};
