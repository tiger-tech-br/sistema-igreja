// =====================================
// IMPORTAÇÕES
// =====================================

const membroModel =
    require("../models/membroModel");

const credencialService =
    require("../services/credencialService");

// =====================================
// GERAR CREDENCIAL
// =====================================

async function gerar(req, res) {

    try {

        const { id } = req.params;

        const membro =
            await membroModel.buscarPorId(id);

        if (!membro) {

            return res.status(404).json({

                success: false,

                message: "Membro não encontrado."

            });

        }

        credencialService.gerarCredencial(

            membro,

            res

        );

    } catch (erro) {

        console.error(

            "[CREDENCIAL_CONTROLLER]",

            erro

        );

        return res.status(500).json({

            success: false,

            message: "Erro ao gerar a credencial."

        });

    }

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = {

    gerar

};