// =====================================
// IMPORTAÇÕES
// =====================================

const fs =
    require("fs");

const path =
    require("path");

const { Resend } =
    require("resend");

// =====================================
// CONFIGURAÇÃO DO RESEND
// =====================================

let resend;

function obterClienteResend() {

    if (!process.env.RESEND_API_KEY) {

        throw new Error("RESEND_API_KEY não configurada.");

    }

    if (!resend) {

        resend =
            new Resend(

                process.env.RESEND_API_KEY

            );

    }

    return resend;

}

function obterRemetente() {

    return (

        process.env.EMAIL_FROM ||
        "Tiger Tech <suporte@tigertech.dev.br>"

    );

}

// =====================================
// LER TEMPLATE
// =====================================

function lerTemplate(

    arquivo

) {

    return fs.readFileSync(

        path.join(

            __dirname,

            "..",

            "emails",

            arquivo

        ),

        "utf-8"

    );

}

// =====================================
// SUBSTITUIR VARIÁVEIS
// =====================================

function substituirVariaveis(

    html,

    dados = {}

) {

    Object.keys(dados).forEach((chave) => {

        html = html.replaceAll(

            `{{${chave}}}`,

            String(dados[chave] ?? "")

        );

    });

    return html;

}

// =====================================
// ENVIAR E-MAIL
// =====================================

async function enviarEmail(

    destinatario,

    assunto,

    html

) {

    try {

        const resposta =

            await obterClienteResend().emails.send({

                from:

                    obterRemetente(),

                to:

                    destinatario,

                subject:

                    assunto,

                html

            });

        if (resposta.error) {

            console.error(

                "[EMAIL_SERVICE][RESEND]",

                resposta.error

            );

            throw new Error(

                resposta.error.message

            );

        }

        return resposta.data;

    }

    catch (erro) {

        console.error(

            "[EMAIL_SERVICE]",

            erro

        );

        throw erro;

    }

}

// =====================================
// ENVIAR TEMPLATE
// =====================================

async function enviarTemplate({

    para,

    assunto,

    template,

    dados

}) {

    try {

        let html =

            lerTemplate(

                template

            );

        html =

            substituirVariaveis(

                html,

                dados

            );

        return enviarEmail(

            para,

            assunto,

            html

        );

    }

    catch (erro) {

        console.error(

            "[EMAIL_SERVICE]",

            erro

        );

        throw erro;

    }

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = {

    enviarEmail,

    enviarTemplate

};
