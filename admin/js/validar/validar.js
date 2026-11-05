import { renderCredential } from '/js/credencial-view.js';

// =====================================
// ELEMENTOS
// =====================================

const campoNome =
    document.getElementById("nome");

const areaCargo =
    document.getElementById("areaCargo");

const campoCargo =
    document.getElementById("cargo");

const campoMatricula =
    document.getElementById("matricula");

const campoValidade =
    document.getElementById("validade");

// =====================================
// VARIAVEIS
// =====================================

const params =
    new URLSearchParams(window.location.search);

const id =
    params.get("id");

// =====================================
// RENDERIZAR MEMBRO
// =====================================

function renderizarMembro(membro) {
    renderCredential(membro, {
        name: campoNome,
        role: campoCargo,
        roleArea: areaCargo,
        registration: campoMatricula,
        validity: campoValidade
    });
}

// =====================================
// CARREGAR MEMBRO
// =====================================

async function carregarMembro() {

    if (!/^\d+$/.test(id || "")) {

        alert("Credencial invalida.");

        return;

    }

    try {

        const resposta =
            await fetch(`/api/membros/validar/${id}`);

        const resultado =
            await resposta.json();

        if (!resultado.success) {

            alert(resultado.message);

            return;

        }

        renderizarMembro(resultado.data);

        // A consulta pública é somente leitura. A presença é registrada
        // exclusivamente pelo scanner de um administrador autenticado.

    } catch (erro) {

        console.error(

            "[VALIDAR]",

            erro

        );

        alert(

            "Erro ao carregar a credencial."

        );

    }

}

// =====================================
// INICIALIZACAO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        carregarMembro();

    }

);
