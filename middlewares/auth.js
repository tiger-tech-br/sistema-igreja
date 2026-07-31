// =====================================
// VERIFICAR AUTENTICAÇÃO
// =====================================

function verificarAutenticacao(

    req,

    res,

    next

) {

    if (!req.session.admin) {

        if (req.originalUrl.startsWith("/api/")) {

            return res.status(401).json({

                success: false,

                message: "Sessão de administrador expirada. Faça login novamente."

            });

        }

        return res.redirect("/login-admin");

    }

    next();

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = verificarAutenticacao;
