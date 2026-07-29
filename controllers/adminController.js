// =====================================
// IMPORTAÇÕES
// =====================================

const bcrypt =
    require("bcrypt");
    
const adminModel =
    require("../models/adminModel");
      
const validarEmail =
require("../utils/validarEmail");
// =====================================
// UTILITÁRIOS
// =====================================


function validarNome(nome) {

    const regexNome =
        /^[A-Za-zÀ-ÿ\s]{3,100}$/;

    return regexNome.test(nome);

}

function validarSenha(senha) {

    const regexSenha =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    return regexSenha.test(senha);

}

// =====================================
// LOGIN
// =====================================


async function login(req, res) {

    try {

        const email =
            req.body.email
                ?.trim()
                .toLowerCase();

        const senha =
            req.body.senha
                ?.trim();

        if (!email || !senha) {

            return res.status(400).json({

                success: false,

                message: "Informe o e-mail e a senha."

            });

        }

        if (!validarEmail(email)) {

            return res.status(400).json({

                success: false,

                message: "E-mail inválido."

            });

        }

        if (email !== "admin@igreja.com") {

            return res.status(401).json({

                success: false,

                message: "E-mail ou senha inválidos."

            });

        }

        if (senha.length < 8 || senha.length > 100) {

            return res.status(400).json({

                success: false,

                message: "Senha inválida."

            });

        }

        const administrador =
            await adminModel.buscarPorEmail(email);

        if (!administrador) {

            return res.status(401).json({

                success: false,

                message: "E-mail ou senha inválidos."

            });

        }

        const senhaCorreta =
            await bcrypt.compare(

                senha,

                administrador.senha

            );

        if (!senhaCorreta) {

            return res.status(401).json({

                success: false,

                message: "E-mail ou senha inválidos."

            });

        }

        req.session.regenerate((erro) => {

            if (erro) {

                return res.status(500).json({

                    success: false,

                    message: "Erro ao iniciar a sessão."

                });

            }

            req.session.admin = {

                id: administrador.id,

                nome: administrador.nome,

                email: administrador.email

            };

            return res.status(200).json({

                success: true,

                message: "Login realizado com sucesso."

            });

        });

    } catch (erro) {

        console.error(

            "[LOGIN]",

            erro

        );

        return res.status(500).json({

            success: false,

            message: "Erro interno do servidor."

        });

    }

}

// =====================================
// LOGOUT
// =====================================


function logout(req, res) {

    req.session.destroy((erro) => {

        if (erro) {

            console.error(

                "[LOGOUT]",

                erro

            );

            return res.status(500).json({

                success: false,

                message: "Erro ao encerrar a sessão."

            });

        }

        res.clearCookie("igreja.sid");

        return res.redirect("/");

    });

}

// =====================================
// CADASTRAR ADMINISTRADOR
// =====================================

async function cadastrarAdministrador(req, res) {

    try {

        const nome =
            req.body.nome
                ?.trim();

        const email =
            req.body.email
                ?.trim()
                .toLowerCase();

        const senha =
            req.body.senha
                ?.trim();

        if (!nome || !email || !senha) {

            return res.status(400).json({

                success: false,

                message: "Preencha todos os campos."

            });

        }

        if (!validarNome(nome)) {

            return res.status(400).json({

                success: false,

                message: "Nome inválido."

            });

        }

        if (!validarEmail(email)) {

            return res.status(400).json({

                success: false,

                message: "E-mail inválido."

            });

        }

        if (!validarSenha(senha)) {

            return res.status(400).json({

                success: false,

                message: "A senha deve conter pelo menos 8 caracteres, uma letra maiúscula, uma minúscula e um número."

            });

        }

        const administrador =
            await adminModel.buscarPorEmail(email);

        if (administrador) {

            return res.status(400).json({

                success: false,

                message: "Já existe um administrador com este e-mail."

            });

        }

        const senhaCriptografada =
            await bcrypt.hash(

                senha,

                10

            );

        const novoAdministrador =
            await adminModel.criarAdministrador(

                nome,

                email,

                senhaCriptografada

            );

        return res.status(201).json({

            success: true,

            message: "Administrador cadastrado com sucesso.",

            data: novoAdministrador

        });

    } catch (erro) {

        console.error(

            "[CADASTRAR_ADMIN]",

            erro

        );

        return res.status(500).json({

            success: false,

            message: "Erro interno do servidor."

        });

    }

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = {

    login,

    logout,

    cadastrarAdministrador

};
