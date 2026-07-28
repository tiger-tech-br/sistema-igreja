require("dotenv").config({ quiet: true });

const membroModel = require("../models/membroModel");
const qrCodeService = require("../services/qrCodeService");

async function regerarQRCodes() {

    try {

        const membros = await membroModel.listar();

        console.log(`Encontrados ${membros.length} membros.`);

        for (const membro of membros) {

            const caminhoQRCode = await qrCodeService.gerarQRCode(membro.id);

            await membroModel.atualizarQRCode(

                membro.id,

                caminhoQRCode

            );

            console.log(`✔ QR Code atualizado: ${membro.nome}`);

        }

        console.log("Todos os QR Codes foram atualizados.");

        process.exit();

    } catch (erro) {

        console.error("[REGERAR_QRCODES]", erro);

        process.exit(1);

    }

}

regerarQRCodes();
