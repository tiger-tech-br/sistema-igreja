// =====================================
// IMPORTAÇÕES
// =====================================

const express =
    require("express");

const adminController =
    require("../controllers/adminController");

const loginLimiter =
    require("../middlewares/loginLimiter");

const verificarAutenticacao =
    require("../middlewares/auth");

// =====================================
// ROUTER
// =====================================

const router = express.Router();

// =====================================
// LOGIN
// =====================================

router.post(

    "/admin/login",

    loginLimiter,

    adminController.login

);

// =====================================
// CADASTRAR ADMINISTRADOR
// =====================================

router.post(

    "/admin",

    verificarAutenticacao,

    adminController.cadastrarAdministrador

);

// =====================================
// LOGOUT
// =====================================

router.get(

    "/logout",

    adminController.logout

);

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = router;
