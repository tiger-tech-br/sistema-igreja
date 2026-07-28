require("dotenv").config({ quiet: true });

const bcrypt = require("bcrypt");

const adminModel = require("../models/adminModel");

// =====================================
// CRIAR ADMINISTRADOR
// =====================================

async function criarAdministrador() {

    try {

        const nome = process.argv[2]?.trim();

        const email = process.argv[3]?.trim().toLowerCase();

        const senha = process.argv[4]?.trim();

        if (!nome || !email || !senha) {

            console.log("");

            console.log("Uso:");

            console.log('npm run criar-admin -- "Nome" "email@dominio.com" "Senha123"');

            process.exit(1);

        }

        // =========================
        // VALIDAR NOME
        // =========================

        const regexNome = /^[A-Za-zÀ-ÿ\s]{3,100}$/;

        if (!regexNome.test(nome)) {

            console.log("Nome inválido.");

            process.exit(1);

        }

        // =========================
        // VALIDAR E-MAIL
        // =========================

        const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!regexEmail.test(email)) {

            console.log("E-mail inválido.");

            process.exit(1);

        }

        // =========================
        // VALIDAR SENHA
        // =========================

        const regexSenha = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

        if (!regexSenha.test(senha)) {

            console.log("A senha deve conter pelo menos 8 caracteres, uma letra maiúscula, uma minúscula e um número.");

            process.exit(1);

        }

        // =========================
        // VERIFICAR ADMINISTRADOR
        // =========================

        const administradorExistente = await adminModel.buscarPorEmail(email);

        if (administradorExistente) {

            console.log("Já existe um administrador com esse e-mail.");

            process.exit(1);

        }

        // =========================
        // CRIPTOGRAFAR SENHA
        // =========================

        const senhaCriptografada = await bcrypt.hash(senha, 10);

        // =========================
        // CADASTRAR
        // =========================

        const administrador = await adminModel.criarAdministrador(

            nome,

            email,

            senhaCriptografada

        );

        console.log("");

        console.log("Administrador criado com sucesso!");

        console.log(administrador);

        process.exit(0);

    } catch (erro) {

        console.error("[CRIAR_ADMIN]", erro);

        process.exit(1);

    }

}

criarAdministrador();
