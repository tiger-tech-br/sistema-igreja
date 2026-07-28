// =====================================
// VARIÁVEIS DE AMBIENTE
// =====================================

require("dotenv").config({ quiet: true });

// =====================================
// IMPORTAÇÕES
// =====================================

const QRCode =
    require("qrcode");

const path =
    require("path");

const fs =
    require("fs");

// =====================================
// CAMINHO DA PASTA
// =====================================

const pastaQRCode = path.join(

    __dirname,

    "..",

    "qrcodes"

);

const appUrl =
    process.env.APP_URL || "http://localhost:3000";

// =====================================
// GARANTIR PASTA
// =====================================

function garantirPasta() {

    if (!fs.existsSync(pastaQRCode)) {

        fs.mkdirSync(

            pastaQRCode,

            {

                recursive: true

            }

        );

    }

}

// =====================================
// GERAR QR CODE
// =====================================

async function gerarQRCode(id) {

    try {

        garantirPasta();

        const nomeArquivo =
            `membro-${id}.png`;

        const caminhoCompleto =
            path.join(

                pastaQRCode,

                nomeArquivo

            );

        const conteudo =
            `${appUrl}/validar?id=${id}`;

        await QRCode.toFile(

            caminhoCompleto,

            conteudo,

            {

                width: 500,

                margin: 2,

                color: {

                    dark: "#000000",

                    light: "#FFFFFF"

                }

            }

        );

        return `/qrcodes/${nomeArquivo}`;

    } catch (erro) {

        console.error(

            "[QRCODE_SERVICE]",

            erro

        );

        throw erro;

    }

}

// =====================================
// GERAR QR CODE EM MEMÓRIA
// =====================================

async function gerarQRCodeBuffer(id) {

    const conteudo =
        `${appUrl}/validar?id=${id}`;

    return await QRCode.toBuffer(
        conteudo,
        {
            type: "png",
            width: 500,
            margin: 2,
            color: {
                dark: "#000000",
                light: "#FFFFFF"
            }
        }
    );

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = {

    gerarQRCode,
    gerarQRCodeBuffer

};
