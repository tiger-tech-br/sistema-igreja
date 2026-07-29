// =====================================
// ELEMENTOS
// =====================================

const btnCancelar =
    document.getElementById("btnCancelar");

// =====================================
// CONFIGURACOES
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
// UTILITARIOS
// =====================================

function abrirPagina(url) {

    window.location.href = url;

}

function pararScanner() {

    if (html5QrCode.isScanning) {

        return html5QrCode.stop();

    }

    return Promise.resolve();

}

function abrirCredencialValidada(textoLido) {

    if (

        textoLido.startsWith("http://") ||

        textoLido.startsWith("https://")

    ) {

        const url = new URL(textoLido);

        const id =
            url.searchParams.get("id");

        if (

            url.pathname === "/validar" &&

            /^\d+$/.test(id || "")

        ) {

            abrirPagina(`/validar?id=${id}`);

            return true;

        }

        return false;

    }

    if (textoLido.startsWith("/validar?")) {

        const url = new URL(textoLido, window.location.origin);

        const id =
            url.searchParams.get("id");

        if (/^\d+$/.test(id || "")) {

            abrirPagina(`/validar?id=${id}`);

            return true;

        }

    }

    if (textoLido.startsWith("MEMBRO:")) {

        const id =
            textoLido.replace("MEMBRO:", "").trim();

        if (/^\d+$/.test(id)) {

            abrirPagina(`/validar?id=${id}`);

            return true;

        }

    }

    return false;

}

// =====================================
// LEITURA COM SUCESSO
// =====================================

function sucesso(textoLido) {

    pararScanner().then(() => {

        if (!abrirCredencialValidada(textoLido)) {

            alert("QR Code invalido.");

            iniciarScanner();

        }

    });

}

// =====================================
// LEITURA INVALIDA
// =====================================

function erro() {

    // Evita milhares de mensagens no console durante a leitura.

}

// =====================================
// INICIAR SCANNER
// =====================================

async function iniciarScanner() {

    try {

        const cameras =
            await Html5Qrcode.getCameras();

        if (!cameras.length) {

            alert("Nenhuma camera encontrada.");

            return;

        }

        let camera = cameras[0].id;

        const traseira = cameras.find((item) => {

            const label =
                item.label.toLowerCase();

            return (
                label.includes("back") ||
                label.includes("rear") ||
                label.includes("environment") ||
                label.includes("traseira")
            );

        });

        if (traseira) {

            camera = traseira.id;

        }

        await html5QrCode.start(

            camera,

            config,

            sucesso,

            erro

        );

    } catch (erroScanner) {

        console.error("[SCANNER]", erroScanner);

        alert("Nao foi possivel acessar a camera.");

    }

}

// =====================================
// EVENTOS
// =====================================

btnCancelar.addEventListener(

    "click",

    () => {

        pararScanner().finally(() => {

            abrirPagina("/dashboard");

        });

    }

);

window.addEventListener("beforeunload", () => {

    pararScanner();

});

// =====================================
// INICIALIZACAO
// =====================================

document.addEventListener("DOMContentLoaded", () => {

    iniciarScanner();

});
