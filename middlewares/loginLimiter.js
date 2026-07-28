// =====================================
// IMPORTACAO
// =====================================

const rateLimit =
    require("express-rate-limit");

const loginBlockMinutes =
    Number(process.env.LOGIN_BLOCK_MINUTES) || 15;

const loginMaxAttempts =
    Number(process.env.LOGIN_MAX_ATTEMPTS) || 5;

// =====================================
// LIMITADOR DE LOGIN
// =====================================

const loginLimiter = rateLimit({

    windowMs:
        loginBlockMinutes * 60 * 1000,

    max:
        loginMaxAttempts,

    standardHeaders: true,

    legacyHeaders: false,

    message: {

        success: false,

        message:
            `Voce excedeu o limite de ${loginMaxAttempts} tentativas. Aguarde ${loginBlockMinutes} minutos e tente novamente.`

    }

});

// =====================================
// EXPORTACAO
// =====================================

module.exports = loginLimiter;
