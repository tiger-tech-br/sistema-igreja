// =====================================
// IMPORTAÇÕES
// =====================================

const express = require("express");

const membroController =
    require("../controllers/membroController");

const verificarMembro =
    require("../middlewares/authMembro");

const verificarAutenticacao =
    require("../middlewares/auth");

// =====================================
// ROUTER
// =====================================

const router = express.Router();

// =====================================
// ROTAS
// =====================================

// Cadastrar membro

router.post(

    "/",

    membroController.criar

);

// Login

router.post(

    "/login",

    membroController.login

);

// =====================================
// STATUS DA SESSÃO
// =====================================

router.get(

    "/sessao",

    membroController.sessao

);

// Recuperar senha

router.post(

    "/esqueci-senha",

    membroController.esqueciSenha

);

router.get(
    "/redefinir-senha",
    (req, res) => {
        const token =
            req.query.token;

        const destino =
            token
                ? `/redefinir-senha?token=${encodeURIComponent(token)}`
                : "/redefinir-senha";

        res.redirect(destino);
    }
);

router.post(
    "/redefinir-senha",
    membroController.redefinirSenha
);

// Listar membros

router.get(
    "/",
    verificarAutenticacao,
    membroController.listar
);

// =====================================
// LISTAR NOMES
// =====================================

router.get(

    "/lista",

    verificarMembro,

    membroController.listarNomes

);

// Dashboard

router.get(
    "/dashboard",
    verificarAutenticacao,
    membroController.dashboard
);

// Últimos cadastrados

router.get(
    "/ultimos",
    verificarAutenticacao,
    membroController.ultimos
);

// Validar credencial

router.get(
    "/validar/:id",
    membroController.validar
);

// Baixar QR Code

router.get(
    "/qrcode/:id",
    verificarAutenticacao,
    membroController.baixarQRCode
);

// Perfil do membro logado

router.get(

    "/perfil",

    verificarMembro,

    membroController.perfil

);

// Buscar por ID

router.get(
    "/:id",
    verificarAutenticacao,
    membroController.buscarPorId
);

// Atualizar membro

router.put(
    "/:id",
    verificarAutenticacao,
    membroController.atualizar
);

// Excluir membro

router.delete(
    "/:id",
    verificarAutenticacao,
    membroController.excluir
);

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = router;
