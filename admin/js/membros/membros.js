// =========================
// ELEMENTOS
// =========================

const lista = document.getElementById("lista-membros");

const pesquisa = document.getElementById("pesquisa");

// =========================
// VARIÁVEIS
// =========================

let todosMembros = [];

let membroParaExcluir = null;



// =========================
// CARREGAR MEMBROS
// =========================

async function carregarMembros() {

    try {

        const resposta = await fetch("/api/membros");

        const resultado = await resposta.json();

        if (!resultado.success) {

            alert(resultado.message);

            return;

        }

        todosMembros = resultado.data;

        renderizarMembros(todosMembros);

    } catch (erro) {

        console.error("[MEMBROS]", erro);

    }

}

// =========================
// CRIAR CARD
// =========================

function criarCardMembro(membro) {

    const card = document.createElement("div");

    card.className = "membro-card";

    card.innerHTML = `

        <div class="membro-info">

            <h3>${membro.nome}</h3>

            <p>

                <strong>Cargo:</strong>

                ${membro.cargo || "Não informado"}

            </p>

            <p>

                <strong>Matrícula:</strong>

                ${membro.matricula || "Não informada"}

            </p>

            <p>

                <strong>Validade:</strong>

                ${membro.validade || "Não informada"}

            </p>

        </div>

        <div class="membro-acoes">

            <button class="btn-editar">

                <i class="fa-solid fa-pen"></i>

            </button>

            <button class="btn-qrcode">

                <i class="fa-solid fa-download"></i>

            </button>

            <button class="btn-credencial">

                <i class="fa-solid fa-id-card"></i>

            </button>

            <button class="btn-perfil">

                <i class="fa-solid fa-user"></i>

            </button>

            <button class="btn-excluir">

                <i class="fa-solid fa-trash"></i>

            </button>

        </div>

    `;

    adicionarEventosCard(card, membro);

    return card;

}

// =========================
// EVENTOS DO CARD
// =========================

function adicionarEventosCard(card, membro) {

    card.querySelector(".btn-editar")
        .addEventListener("click", () => {

            editarMembro(membro.id);

        });

        card.querySelector(".btn-credencial")
        .addEventListener("click", () => {

        baixarCredencial(membro.id);

    });

        card.querySelector(".btn-qrcode")
        .addEventListener("click", () => {

            baixarQRCode(membro);

        });

    card.querySelector(".btn-perfil")
        .addEventListener("click", () => {

            abrirPerfil(membro.id);

        });

    card.querySelector(".btn-excluir")
        .addEventListener("click", () => {

            abrirConfirmacaoExclusao(membro);

        });

}

// =========================
// PESQUISAR MEMBROS
// =========================

function pesquisarMembros() {

    const texto = pesquisa.value
        .trim()
        .toLowerCase();

    const membrosFiltrados = todosMembros.filter((membro) =>

        membro.nome
            .toLowerCase()
            .includes(texto)

    );

    renderizarMembros(membrosFiltrados);

}

// =========================
// EVENTOS
// =========================

pesquisa.addEventListener(
    "input",
    pesquisarMembros
);

// =========================
// RENDERIZAR MEMBROS
// =========================

function renderizarMembros(membros) {

    lista.replaceChildren();

    membros.forEach((membro) => {

        lista.appendChild(

            criarCardMembro(membro)

        );

    });

}


// =========================
// NAVEGAÇÃO
// =========================

function abrirPagina(url) {

    window.location.href = url;

}


// =========================
// PERFIL
// =========================

function abrirPerfil(id) {

    abrirPagina(`/perfil?id=${id}`);

}

// =========================
// EDITAR
// =========================

function editarMembro(id) {

    abrirPagina(`/cadastro?id=${id}`);

}

// =========================
// BAIXAR CREDENCIAL
// =========================

function baixarCredencial(id) {

    window.open(

        `/credencial/${id}`,

        "_blank"

    );

}

// =========================
// BAIXAR QR CODE
// =========================


function baixarQRCode(membro) {

    window.open(

        `/api/membros/qrcode/${membro.id}`,

        "_blank"

    );

}

// =========================
// CONFIRMAR EXCLUSÃO
// =========================

function obterModalExclusao() {

    let modal = document.getElementById("modal-exclusao-membro");

    if (modal) {

        return modal;

    }

    modal = document.createElement("div");

    modal.id = "modal-exclusao-membro";
    modal.className = "modal-exclusao hidden";
    modal.innerHTML = `
        <div class="modal-exclusao__caixa" role="dialog" aria-modal="true" aria-labelledby="titulo-exclusao-membro">
            <h3 id="titulo-exclusao-membro">Excluir membro?</h3>
            <p id="texto-exclusao-membro"></p>
            <div class="modal-exclusao__acoes">
                <button type="button" class="btn-cancelar-exclusao">Cancelar</button>
                <button type="button" class="btn-confirmar-exclusao">Sim, excluir</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener("click", (evento) => {

        if (evento.target === modal) {

            fecharConfirmacaoExclusao();

        }

    });

    modal.querySelector(".btn-cancelar-exclusao")
        .addEventListener("click", fecharConfirmacaoExclusao);

    modal.querySelector(".btn-confirmar-exclusao")
        .addEventListener("click", () => {

            if (membroParaExcluir) {

                excluirMembro(membroParaExcluir.id);

            }

        });

    return modal;

}

function abrirConfirmacaoExclusao(membro) {

    membroParaExcluir = membro;

    const modal = obterModalExclusao();

    modal.querySelector("#texto-exclusao-membro").textContent =
        `Deseja excluir ${membro.nome}? Esta acao nao pode ser desfeita.`;

    modal.classList.remove("hidden");

}

function fecharConfirmacaoExclusao() {

    const modal = document.getElementById("modal-exclusao-membro");

    if (modal) {

        modal.classList.add("hidden");

    }

    membroParaExcluir = null;

}


// =========================
// EXCLUIR
// =========================


async function excluirMembro(id) {

    try {

        const resposta = await fetch(

            `/api/membros/${id}`,

            {

                method: "DELETE"

            }

        );

        const resultado = await resposta.json();

        alert(resultado.message);

        if (resultado.success) {

            fecharConfirmacaoExclusao();

            carregarMembros();

        }

    } catch (erro) {

        console.error("[EXCLUIR_MEMBRO]", erro);

        alert("Erro ao excluir o membro.");

    }

}


// =========================
// INICIALIZAÇÃO
// =========================

document.addEventListener("DOMContentLoaded", () => {

    carregarMembros();

});
