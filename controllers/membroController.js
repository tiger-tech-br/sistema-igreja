// =====================================
// IMPORTAÇÕES
// =====================================

const fs = require("fs");
const path = require("path");

const bcrypt =
    require("bcrypt");

const crypto =
require("crypto");

const {
    enviarTemplate
} = require("../services/emailService");

const membroModel =
    require("../models/membroModel");

const qrCodeService =
    require("../services/qrCodeService");

const validarEmail =
    require("../utils/validarEmail");

const gerarMatricula =
    require("../utils/matricula");

const gerarValidade =
    require("../utils/validade");

const estadosCivisPermitidos = new Set([
    "Solteiro(a)",
    "Casado(a)",
    "Divorciado(a)",
    "Viúvo(a)"
]);

const sexosPermitidos = new Set([
    "Masculino",
    "Feminino"
]);

function validarDataNascimentoTexto(valor) {
    if (!/^(\d{2})\/(\d{2})\/(\d{4})$/.test(valor)) {
        return false;
    }

    const [diaTexto, mesTexto, anoTexto] = valor.split("/");
    const dia = Number(diaTexto);
    const mes = Number(mesTexto);
    const ano = Number(anoTexto);
    const data = new Date(ano, mes - 1, dia);

    return (
        data.getFullYear() === ano &&
        data.getMonth() === mes - 1 &&
        data.getDate() === dia
    );
}

function validarCadastroMembro(dados) {
    const nome = dados.nome?.trim();
    const celular = dados.celular?.replace(/\D/g, "");
    const telefone = dados.telefone?.replace(/\D/g, "") || "";
    const email = dados.email?.trim().toLowerCase();
    const senha = dados.senha || "";
    const endereco = dados.endereco?.trim();
    const sexo = dados.sexo;
    const estadoCivil = dados.estadoCivil;
    const dataNascimento = dados.dataNascimento?.trim();

    if (!nome || !/^[A-Za-zÀ-ÿ\s]{3,150}$/.test(nome)) {
        return "Informe um nome válido.";
    }

    if (!celular || celular.length !== 11) {
        return "Informe um celular válido.";
    }

    if (telefone && telefone.length !== 10) {
        return "Informe um telefone fixo válido ou deixe em branco.";
    }

    if (!validarEmail(email)) {
        return "Informe um e-mail válido.";
    }

    if (!senha || senha.length < 8 || senha.length > 100) {
        return "A senha deve possuir pelo menos 8 caracteres.";
    }

    if (!dataNascimento || !validarDataNascimentoTexto(dataNascimento)) {
        return "Informe uma data de nascimento válida.";
    }

    if (!sexo || !sexosPermitidos.has(sexo)) {
        return "Informe o sexo.";
    }

    if (!estadoCivil || !estadosCivisPermitidos.has(estadoCivil)) {
        return "Informe o estado civil.";
    }

    if (!endereco || endereco.length < 10 || endereco.length > 300) {
        return "Informe um endereço válido.";
    }

    dados.nome = nome;
    dados.celular = celular;
    dados.telefone = telefone || null;
    dados.email = email;
    dados.endereco = endereco;

    return null;
}


    async function gerarMatriculaUnica() {

    let matricula;

    let existe = true;

    while (existe) {

        matricula = gerarMatricula();

        existe =
            await membroModel.buscarPorMatricula(
                matricula
            );

    }

    return matricula;

}

    // =====================================
// GARANTIR QR CODE
// =====================================

    async function garantirQRCode(membro) {

        if (!membro) {

            return null;

        }

        const pasta = path.join(

            __dirname,

            "..",

            "qrcodes"

        );

        if (!fs.existsSync(pasta)) {

            fs.mkdirSync(

                pasta,

                {

                    recursive: true

                }

            );

        }

        const caminhoArquivo = path.join(

            pasta,

            `membro-${membro.id}.png`

        );

        const caminhoQRCodeEsperado =
            `/qrcodes/membro-${membro.id}.png`;

        if (
            membro.qr_code !== caminhoQRCodeEsperado ||
            !fs.existsSync(caminhoArquivo)
        ) {

            const caminhoQRCode =

                await qrCodeService.gerarQRCode(

                    membro.id

                );

            await membroModel.atualizarQRCode(

                membro.id,

                caminhoQRCode

            );

            membro.qr_code = caminhoQRCode;

        }

        return membro;



    }

function removerDadosSensiveis(membro) {

    if (!membro) {

        return membro;

    }

    const {
        senha,
        token_recuperacao,
        token_redefinicao,
        token_expira_em,
        ...dadosPublicos
    } = membro;

    return dadosPublicos;

}

    // =====================================
    // CRIAR
    // =====================================

    async function criar(req, res) {

    try {

        const erroValidacao =
            validarCadastroMembro(req.body);

        if (erroValidacao) {

            return res.status(400).json({

                success: false,

                message: erroValidacao

            });

        }

        req.body.matricula =
            await gerarMatriculaUnica();

        req.body.validade =
            gerarValidade();

        const membro =
            await membroModel.criar(req.body);

        const caminhoQRCode =
            await qrCodeService.gerarQRCode(
                membro.id
            );

        await membroModel.atualizarQRCode(

            membro.id,

            caminhoQRCode

        );

        membro.qr_code = caminhoQRCode;

        enviarTemplate({

            para:
                membro.email,

            assunto:
                "Cadastro realizado com sucesso",

            template:
                "email-boas-vindas.html",

            dados: {

                nome:
                    membro.nome,

                link:
                    `${process.env.APP_URL || "http://localhost:3000"}`

            }

        }).catch((erro) => {

            console.error(

                "[MEMBRO_CONTROLLER][EMAIL_BOAS_VINDAS]",

                erro

            );

        });

        return res.status(201).json({

            success: true,

            message: "Membro cadastrado com sucesso.",

            data: removerDadosSensiveis(membro)

        });

        } catch (erro) {

        console.error("[MEMBRO_CONTROLLER][CRIAR]", erro);

        return res.status(500).json({

            success: false,

            message: erro.message

        });

    }

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

        const membro =

            await membroModel.buscarPorEmail(

                email

            );

        if (!membro || !membro.senha) {

            return res.status(401).json({

                success: false,

                message: "E-mail ou senha inválidos."

            });

        }

        const senhaCorreta =

            await bcrypt.compare(

                senha,

                membro.senha

            );

        if (!senhaCorreta) {

            return res.status(401).json({

                success: false,

                message: "E-mail ou senha inválidos."

            });

        }

                // =========================
        // E-MAIL CONFIRMADO
        // =========================

        if (!membro.email_verificado) {

            return res.status(403).json({

                success: true,

                message:
                    "Confirme seu e-mail antes de entrar."

            });

        }

        // =========================
// SESSÃƒO
// =========================

req.session.regenerate((erro) => {

    if (erro) {

        return res.status(500).json({

            success: false,

            message: "Erro ao iniciar a sessão."

        });

    }

        req.session.membro = {

        id: membro.id,

        nome: membro.nome.split(" ")[0],

        email: membro.email

    };

    // =========================
    // SUCESSO
    // =========================

    return res.status(200).json({

        success: true,

        message: "Login realizado com sucesso.",

        data: {

            id: membro.id,

            nome: membro.nome,

            email: membro.email

        }

    });

});

    } catch (erro) {

        console.error(

            "[MEMBRO_CONTROLLER][LOGIN]",

            erro

        );

        return res.status(500).json({

            success: false,

            message: "Erro interno ao realizar o login."

        });

    }

}

// =====================================
// ESQUECI A SENHA
// =====================================

async function esqueciSenha(req, res) {

    try {

        const email =

            req.body.email
                ?.trim()
                .toLowerCase();

        if (!email) {

            return res.status(400).json({

                success: false,

                message: "Informe o e-mail."

            });

        }

        if (!validarEmail(email)) {

            return res.status(400).json({

                success: false,

                message: "E-mail inválido."

            });

        }

        const membro =

            await membroModel.buscarPorEmail(

                email

            );

                        // =====================================
        // MEMBRO ENCONTRADO
        // =====================================

        if (membro) {

            const token =

                crypto.randomBytes(32)

                    .toString("hex");

            const expiracao =

                new Date(

                    Date.now()

                    +

                    1000 * 60 * 60

                );

            await membroModel.salvarTokenRecuperacao(

                membro.id,

                token,

                expiracao

            );

                const link =

                    `${process.env.APP_URL || "http://localhost:3000"}/redefinir-senha?token=${token}`;
                await enviarTemplate({

                    para:
                        membro.email,

                    assunto:
                        "Recuperacao de senha",

                    template:
                        "email-redefinir-senha.html",

                    dados: {

                        nome:
                            membro.nome,

                        link

                    }

                });

        }

        // =====================================
        // RESPOSTA
        // =====================================

        return res.status(200).json({

            success: true,

            message:

                "Se existir uma conta vinculada a este e-mail, você receberá um link para redefinir sua senha."

        });

    } catch (erro) {

        console.error(

            "[MEMBRO_CONTROLLER][ESQUECI_SENHA]",

            erro

        );

        return res.status(500).json({

            success: false,

            message: "Erro interno ao processar a solicitação."

        });

    }

}

// =====================================
// REDEFINIR SENHA
// =====================================

async function redefinirSenha(req, res) {

    try {

        const {

            token,

            senha

        } = req.body;

        if (

            !token ||

            !senha

        ) {

            return res.status(400).json({

                success: false,

                message: "Dados inválidos."

            });

        }

        const membro =

            await membroModel.buscarPorToken(

                token

            );

        if (!membro) {

            return res.status(400).json({

                success: false,

                message: "Token inválido."

            });

        }

        if (

            new Date()

            >

            new Date(

                membro.token_expira_em

            )

        ) {

            return res.status(400).json({

                success: false,

                message: "O link expirou."

            });

        }

        const senhaHash =

            await bcrypt.hash(

                senha,

                10

            );

        await membroModel.atualizarSenha(

            membro.id,

            senhaHash

        );

        await membroModel.limparTokenRecuperacao(

            membro.id

        );

        await enviarTemplate({

            para:
                membro.email,

            assunto:
                "Senha alterada com sucesso",

            template:
                "email-senha-alterada.html",

            dados: {

                nome:
                    membro.nome

            }

        });

        return res.status(200).json({

            success: true,

            message: "Senha alterada com sucesso."

        });

    }

    catch (erro) {

        console.error(

            "[MEMBRO_CONTROLLER][REDEFINIR_SENHA]",

            erro

        );

        return res.status(500).json({

            success: false,

            message: "Erro interno."

        });

    }

}

function logout(req, res) {

    delete req.session.membro;

    return res.status(200).json({

        success: true,

        message: "Logout realizado com sucesso."

    });

}

// =====================================
// STATUS DA SESSÃƒO
// =====================================

function sessao(req, res) {

    if (!req.session.membro) {

        return res.json({

            logado: false

        });

    }

    return res.json({

        logado: true,

        nome: req.session.membro.nome,

        id: req.session.membro.id

    });

}

// =====================================
// PERFIL DO MEMBRO LOGADO
// =====================================

async function perfil(req, res) {

    try {

        const membro =

            await membroModel.buscarPorId(

                req.session.membro.id

            );

        if (!membro) {

            return res.status(404).json({

                success: false,

                message: "Membro não encontrado."

            });

        }

        const membroAtualizado =

            await garantirQRCode(

                membro

            );

        return res.json({

            success: true,

            data: removerDadosSensiveis(membroAtualizado)

        });

    }

    catch (erro) {

        console.error(

            "[MEMBRO_CONTROLLER][PERFIL]",

            erro

        );

        return res.status(500).json({

            success: false,

            message:

                "Erro ao carregar o perfil."

        });

    }

}


        // =====================================
    // LISTAR
    // =====================================

    async function listar(req, res) {

        try {

            const membros =
                await membroModel.listar();

            return res.status(200).json({

                success: true,

                message: "Membros carregados com sucesso.",

                data: membros

            });

        } catch (erro) {

            console.error(

                "[MEMBRO_CONTROLLER][LISTAR]",

                erro

            );

            return res.status(500).json({

                success: false,

                message: "Erro interno ao listar os membros."

            });

        }

    }

    // =====================================
// LISTAR NOMES
// =====================================

async function listarNomes(req, res) {

    try {

        const membros =

            await membroModel.listarNomes();

        return res.status(200).json({

            success: true,

            message: "Lista carregada com sucesso.",

            data: membros

        });

    }

    catch (erro) {

        console.error(

            "[MEMBRO_CONTROLLER][LISTAR_NOMES]",

            erro

        );

        return res.status(500).json({

            success: false,

            message: "Erro ao carregar a lista."

        });

    }

}

    // =====================================
    // BUSCAR POR ID
    // =====================================


        async function buscarPorId(req, res) {

            try {

                const { id } = req.params;

                let membro =
                    await membroModel.buscarPorId(id);

                if (!membro) {

                    return res.status(404).json({

                        success: false,

                        message: "Membro não encontrado."

                    });

                }

                membro =
                    await garantirQRCode(membro);

                return res.status(200).json({

                    success: true,

                    message: "Membro encontrado.",

                    data: removerDadosSensiveis(membro)

                });

            } catch (erro) {

                console.error(

                    "[MEMBRO_CONTROLLER][BUSCAR_POR_ID]",

                    erro

                );

                return res.status(500).json({

                    success: false,

                    message: "Erro ao buscar o membro."

            });

            }

}

  // =====================================
// ATUALIZAR
// =====================================

    async function atualizar(req, res) {

        try {

            const { id } = req.params;

            const membro =

                await membroModel.atualizar(

                    id,

                    req.body

                );

            if (!membro) {

                return res.status(404).json({

                    success: false,

                    message: "Membro não encontrado."

                });

            }

            const membroAtualizado =

                await garantirQRCode(

                    membro

                );

            return res.status(200).json({

                success: true,

                message: "Membro atualizado com sucesso.",

                data: removerDadosSensiveis(membroAtualizado)

            });

        } catch (erro) {

            console.error(

                "[MEMBRO_CONTROLLER][ATUALIZAR]",

                erro

            );

            return res.status(500).json({

                success: false,

                message: "Erro ao atualizar o membro."

            });

        }

    }

    // =====================================
    // EXCLUIR
    // =====================================

    async function excluir(req, res) {

        try {

            const { id } = req.params;

            const membro =
                await membroModel.excluir(id);

            if (!membro) {

                return res.status(404).json({

                    success: false,

                    message: "Membro não encontrado."

                });

            }

            return res.status(200).json({

                success: true,

                message: "Membro excluído com sucesso."

            });

        } catch (erro) {

            console.error(

                "[MEMBRO_CONTROLLER][EXCLUIR]",

                erro

            );

            return res.status(500).json({

                success: false,

                message: "Erro ao excluir o membro."

            });

        }

    }


        // =====================================
    // VALIDAR CREDENCIAL
    // =====================================

    async function validar(req, res) {

        try {

            const { id } = req.params;

            if (!/^\d+$/.test(id)) {

                return res.status(400).json({

                    success: false,

                    message: "Credencial inválida."

                });

            }

            const membro =
            await membroModel.buscarPorId(id);

            if (!membro) {

                return res.status(404).json({

                    success: false,

                    message: "Membro não encontrado."

                });

            }

                // =====================================
                // REGISTRAR ACESSO
                // =====================================

                await membroModel.registrarAcesso(

                    membro.id

                );

                const membroAtualizado =

                await garantirQRCode(

                    membro

                );

                return res.status(200).json({

                    success: true,

                    data: removerDadosSensiveis(membroAtualizado)

                });

        } catch (erro) {

            console.error(

                "[MEMBRO_CONTROLLER][VALIDAR]",

                erro

            );

            return res.status(500).json({

                success: false,

                message: "Erro ao validar a credencial."

            });

        }

    }

    // =====================================
    // ÚLTIMOS MEMBROS
    // =====================================

    async function ultimos(req, res) {

        try {

            const membros =
                await membroModel.listarUltimos(5);

            return res.status(200).json({

                success: true,

                data: membros

            });

        } catch (erro) {

            console.error(

                "[MEMBRO_CONTROLLER][ULTIMOS]",

                erro

            );

            return res.status(500).json({

                success: false,

                message: "Erro ao buscar os Últimos membros."

            });

        }

    }

    // =====================================
    // DASHBOARD
    // =====================================

    async function dashboard(req, res) {

        try {

            const dados =
                await membroModel.dashboard();

            return res.status(200).json({

                success: true,

                data: dados

            });

        } catch (erro) {

            console.error(

                "[MEMBRO_CONTROLLER][DASHBOARD]",

                erro

            );

            return res.status(500).json({

                success: false,

                message: "Erro ao carregar o dashboard."

            });

        }

    }



    // =====================================
// BAIXAR QR CODE
// =====================================

async function baixarQRCode(req, res) {

    try {

        const { id } = req.params;

        if (!/^\d+$/.test(id)) {

            return res.status(400).json({

                success: false,

                message: "ID inválido."

            });

        }

        const membro =
            await membroModel.buscarPorId(id);

        if (!membro) {

            return res.status(404).json({

                success: false,

                message: "Membro não encontrado."

            });

        }

        const buffer =
            await qrCodeService.gerarQRCodeBuffer(id);

        const nomeArquivo = membro.nome
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "-")
            .toLowerCase();

        res.setHeader(
            "Content-Type",
            "image/png"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="qrcode-${nomeArquivo}.png"`
        );

        return res.send(buffer);

    } catch (erro) {

        console.error(

            "[MEMBRO_CONTROLLER][BAIXAR_QRCODE]",

            erro

        );

        return res.status(500).json({

            success: false,

            message: "Erro ao gerar o QR Code."

        });

    }

}


module.exports = {

    criar,

    login,

    logout,

    sessao,

    esqueciSenha,

    redefinirSenha,

    perfil,

    listar,

    listarNomes,

    dashboard,

    ultimos,

    validar,

    baixarQRCode,

    buscarPorId,

    atualizar,

    excluir

};
