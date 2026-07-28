// =====================================
// MIDDLEWARE DE ERRO
// =====================================

function errorMiddleware(

    erro,

    req,

    res,

    next

) {

    console.error(

        "======================================"

    );

    console.error(

        "[ERROR MIDDLEWARE]"

    );

    console.error(erro);

    console.error(

        "======================================"

    );

    return res.status(500).json({

        success: false,

        message: "Ocorreu um erro interno no servidor."

    });

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = errorMiddleware;