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

let modalLogout;

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

function obterModalLogout() {
    if (modalLogout) {
        return modalLogout;
    }

    modalLogout = document.createElement("div");
    modalLogout.className = "logout-modal";
    modalLogout.hidden = true;
    modalLogout.innerHTML = `
        <section class="logout-modal__card" role="dialog" aria-modal="true" aria-labelledby="logout-modal-titulo">
            <div class="logout-modal__icon"><i class="fa-solid fa-right-from-bracket"></i></div>
            <h2 id="logout-modal-titulo">Encerrar sessão?</h2>
            <p>Você precisará informar sua senha novamente para acessar o painel.</p>
            <div class="logout-modal__actions">
                <button type="button" class="btn btn-secondary" data-cancelar>Continuar no painel</button>
                <button type="button" class="btn btn-danger" data-confirmar>Sim, sair</button>
            </div>
            <p class="logout-modal__status" role="status"></p>
        </section>`;
    document.body.appendChild(modalLogout);

    modalLogout.querySelector("[data-cancelar]").addEventListener("click", fecharModalLogout);
    modalLogout.addEventListener("click", (event) => {
        if (event.target === modalLogout) fecharModalLogout();
    });
    modalLogout.querySelector("[data-confirmar]").addEventListener("click", encerrarSessao);
    return modalLogout;
}

function abrirModalLogout() {
    const modal = obterModalLogout();
    modal.hidden = false;
    document.body.classList.add("modal-aberto");
    modal.querySelector("[data-cancelar]").focus();
}

function fecharModalLogout() {
    if (!modalLogout) return;
    modalLogout.hidden = true;
    document.body.classList.remove("modal-aberto");
}

async function encerrarSessao() {
    const modal = obterModalLogout();
    const confirmar = modal.querySelector("[data-confirmar]");
    const status = modal.querySelector(".logout-modal__status");
    confirmar.disabled = true;
    status.textContent = "Encerrando sessão...";
    try {
        const resposta = await fetch("/logout-admin", { method: "POST" });
        if (!resposta.ok) throw new Error();
        window.location.replace("/login-admin");
    } catch (erro) {
        confirmar.disabled = false;
        status.textContent = "Não foi possível encerrar a sessão. Tente novamente.";
    }
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

    document
        .querySelectorAll('a[href="/logout-admin"]')
        .forEach((link) => {
            link.addEventListener("click", (event) => {
                event.preventDefault();
                fecharMenu();
                abrirModalLogout();
            });
        });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modalLogout && !modalLogout.hidden) {
            fecharModalLogout();
        }
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
