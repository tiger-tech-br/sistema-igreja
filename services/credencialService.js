// =====================================
// IMPORTAÇÕES
// =====================================

const PDFDocument =
    require("pdfkit");

const QRCode =
    require("qrcode");

const fs =
    require("fs");

const path =
    require("path");

// =====================================
// CONFIGURAÇÃO
// =====================================

const dourado = "#D4AF37";

const preto = "#111111";

const branco = "#FFFFFF";

const appUrl =
    process.env.APP_URL || "http://localhost:3000";

// =====================================
// FORMATAR DATA
// =====================================

function formatarData(data) {

    if (!data) {

        return "-";

    }

    if (String(data).includes("/")) {

        return String(data);

    }

    const dataFormatada =
        new Date(data);

    if (Number.isNaN(dataFormatada.getTime())) {

        return "-";

    }

    return dataFormatada
        .toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo"
        });

}

// =====================================
// DESENHAR QR CODE
// =====================================

async function desenharQRCode(

    doc,

    membro

) {

    const url =

        `${appUrl}/validar?id=${membro.id}`;

    const buffer =

        await QRCode.toBuffer(

            url,

            {

                width: 500,

                margin: 2,

                color: {

                    dark: "#000000",

                    light: "#FFFFFF"

                }

            }

        );

    doc.image(

        buffer,

        176,

        75,

        {

            width: 46

        }

    );

}

// =====================================
// GERAR CREDENCIAL
// =====================================

async function gerarCredencial(

    membro,

    res

) {

    const doc = new PDFDocument({

        size: [

            243,

            153

        ],

        margin: 0

    });

    doc.info.Title = `Credencial - ${membro.nome}`;

    const nomeArquivo =

        (membro.nome || "membro")

            .normalize("NFD")

            .replace(/[\u0300-\u036f]/g, "")

            .replace(/\s+/g, "-")

            .toLowerCase();

    res.setHeader(

        "Content-Type",

        "application/pdf"

    );

    res.setHeader(

        "Content-Disposition",

        `inline; filename=credencial-${nomeArquivo}.pdf`

    );

    doc.pipe(res);

    // =====================================
    // FUNDO
    // =====================================

    doc

        .roundedRect(

            0,

            0,

            243,

            153,

            8

        )

        .fill(preto);

    doc

        .lineWidth(2)

        .strokeColor(dourado)

        .roundedRect(

            3,

            3,

            237,

            147,

            8

        )

        .stroke();

    // =====================================
    // LOGO
    // =====================================

    const logo = path.join(

        __dirname,

        "..",

        "images",

        "assembleia-logo.png"

    );

    if (

        fs.existsSync(logo)

    ) {

        doc.image(

            logo,

            96,

            6,

            {

                width: 50

            }

        );

    }

    // =====================================
    // TÍTULO
    // =====================================

    doc

        .fillColor(dourado)

        .font("Helvetica-Bold")

        .fontSize(12)

        .text(

            "ASSEMBLÉIA DE DEUS",

            0,

            48,

            {

                width: 243,

                align: "center"

            }

        );

            // =====================================
    // DADOS
    // =====================================

    let y = 74;

    doc.fontSize(7.5);

    doc.fillColor(dourado);

    doc.text(

        "Nome:",

        12,

        y

    );

    doc.fillColor(branco);

    doc.text(

        membro.nome || "-",

        60,

        y

    );

    y += 14;

    doc.fillColor(dourado);

    doc.text(

        "Cargo:",

        12,

        y

    );

    doc.fillColor(branco);

    doc.text(

        membro.cargo || "-",

        60,

        y

    );

    y += 14;

    doc.fillColor(dourado);

    doc.text(

        "Matrícula:",

        12,

        y

    );

    doc.fillColor(branco);

    doc.text(

        membro.matricula || "-",

        60,

        y

    );

    y += 14;

    doc.fillColor(dourado);

    doc.text(

        "Validade:",

        12,

        y

    );

    doc.fillColor(branco);

    doc.text(

        formatarData(

            membro.validade

        ),

        60,

        y

    );

    // =====================================
    // QR CODE
    // =====================================

    await desenharQRCode(

        doc,

        membro

    );

        // =====================================
    // FINALIZAR PDF
    // =====================================

    doc.end();

}


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

        await credencialService.gerarCredencial(

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

    gerarCredencial

};
