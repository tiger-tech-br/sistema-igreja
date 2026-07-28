// =====================================
// ELEMENTOS
// =====================================

const btnMenu =
    document.getElementById("btnMenu");

const sidebar =
    document.querySelector(".sidebar");

const overlay =
    document.querySelector(".overlay");

const icone =
    btnMenu?.querySelector("i");

// =====================================
// UTILITÁRIOS
// =====================================

function menuExiste() {

    return (

        btnMenu &&

        sidebar &&

        overlay &&

        icone

    );

}

// =====================================
// ABRIR MENU
// =====================================

function abrirMenu() {

    sidebar.classList.add("aberto");

    overlay.classList.add("ativo");

    document.body.classList.add("menu-aberto");

    icone.classList.remove("fa-bars");

    icone.classList.add("fa-xmark");

}

// =====================================
// FECHAR MENU
// =====================================

function fecharMenu() {

    sidebar.classList.remove("aberto");

    overlay.classList.remove("ativo");

    document.body.classList.remove("menu-aberto");

    icone.classList.remove("fa-xmark");

    icone.classList.add("fa-bars");

}

// =====================================
// ALTERNAR MENU
// =====================================

function alternarMenu() {

    if (sidebar.classList.contains("aberto")) {

        fecharMenu();

        return;

    }

    abrirMenu();

}

// =====================================
// EVENTOS
// =====================================

function adicionarEventos() {

    btnMenu.addEventListener(

        "click",

        alternarMenu

    );

    overlay.addEventListener(

        "click",

        fecharMenu

    );

    document

        .querySelectorAll(".menu a")

        .forEach((link) => {

            link.addEventListener(

                "click",

                fecharMenu

            );

        });

}

// =====================================
// INICIALIZAÇÃO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        if (!menuExiste()) {

            return;

        }

        adicionarEventos();

    }

);