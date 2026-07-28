// =====================================
// IMPORTAÇÕES
// =====================================

const express =
    require("express");

const credencialController =
    require("../controllers/credencialController");

// =====================================
// ROUTER
// =====================================

const router =
    express.Router();

// =====================================
// GERAR CREDENCIAL
// =====================================

router.get(

    "/:id",

    credencialController.gerar

);

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = router;