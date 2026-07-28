// =====================================
// VERIFICAR AUTENTICAÇÃO DO MEMBRO
// =====================================

function verificarMembro(

    req,

    res,

    next

) {

    if (!req.session.membro) {

        return res.redirect("/");

    }

    next();

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = verificarMembro;