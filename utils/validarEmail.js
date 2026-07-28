// =====================================
// VALIDAR E-MAIL
// =====================================

function validarEmail(email) {

    if (!email) {

        return false;

    }

    const regex =

        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return regex.test(

        email.trim()

    );

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = validarEmail;