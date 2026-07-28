// =====================================
// ELEMENTOS
// =====================================

const btnCancelar =
    document.getElementById("btnCancelar");

// =====================================
// CONFIGURAÇÕES
// =====================================

const html5QrCode =
    new Html5Qrcode("reader");

const config = {

    fps: 10,

    qrbox: {

        width: 250,

        height: 250

    }

};

// =====================================
// UTILITÁRIOS
// =====================================

function abrirPagina(url) {

    window.location.href = url;

}

// =====================================
// LEITURA COM SUCESSO
// =====================================

function sucesso(textoLido) {

    html5QrCode.stop().then(() => {

        // QR Code contém uma URL
        if (

            textoLido.startsWith("http://") ||

            textoLido.startsWith("https://")

        ) {

            abrirPagina(textoLido);

            return;

        }

        // QR Code contém o ID do membro
        if (textoLido.startsWith("MEMBRO:")) {

            const id = textoLido.replace(

                "MEMBRO:",

                ""

            );

            abrirPagina(

                `/validar?id=${id}`

            );

            return;

        }

        alert("QR Code inválido.");

    });

}

// =====================================
// LEITURA INVÁLIDA
// =====================================

function erro() {

    // Não faz nada.
    // Evita milhares de mensagens no console.

}

// =====================================
// INICIAR SCANNER
// =====================================

async function iniciarScanner() {

    try {

        const cameras =
            await Html5Qrcode.getCameras();

        if (!cameras.length) {

            alert("Nenhuma câmera encontrada.");

            return;

        }

        let camera = cameras[0].id;

        const traseira = cameras.find((camera) =>

            camera.label
                .toLowerCase()
                .includes("back")

            ||

            camera.label
                .toLowerCase()
                .includes("rear")

            ||

            camera.label
                .toLowerCase()
                .includes("environment")

        );

        if (traseira) {

            camera = traseira.id;

        }

        await html5QrCode.start(

            camera,

            config,

            sucesso,

            erro

        );

    } catch (erro) {

        console.error("[SCANNER]", erro);

        alert("Não foi possível acessar a câmera.");

    }

}

// =====================================
// EVENTOS
// =====================================

btnCancelar.addEventListener(

    "click",

    () => {

        abrirPagina("/dashboard");

    }

);

// =====================================
// INICIALIZAÇÃO
// =====================================

document.addEventListener("DOMContentLoaded", () => {

    iniciarScanner();

});
