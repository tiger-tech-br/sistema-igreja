// =========================
// ELEMENTOS
// =========================

const lista = document.getElementById("lista-membros");

const pesquisa = document.getElementById("pesquisa");

// =========================
// VARIÁVEIS
// =========================

let todosMembros = [];



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

            excluirMembro(membro.id);

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

function confirmarExclusao() {

    return confirm(

        "Tem certeza que deseja excluir este membro?"

    );

}


// =========================
// EXCLUIR
// =========================


async function excluirMembro(id) {

    if (!confirmarExclusao()) {

        return;

    }

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
