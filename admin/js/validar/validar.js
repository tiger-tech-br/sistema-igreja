// =====================================
// ELEMENTOS
// =====================================

const campoNome = 
    document.getElementById("nome");

const campoCargo =
    document.getElementById("cargo");

const campoMatricula =
    document.getElementById("matricula");

const campoValidade =
    document.getElementById("validade");

// =====================================
// VARIÁVEIS
// =====================================

const params =
    new URLSearchParams(window.location.search);

const id =
    params.get("id");

// =====================================
// UTILITÁRIOS
// =====================================

function formatarData(data) {

    if (!data) {

        return "Não informada";

    }

    if (String(data).includes("/")) {

        return data;

    }

    return new Date(data)
        .toLocaleDateString("pt-BR");

}

// =====================================
// RENDERIZAR MEMBRO
// =====================================

function renderizarMembro(membro) {

    campoNome.textContent = 
        membro.nome || "Não informado";

    campoCargo.textContent =
        membro.cargo || "Não informado";

    campoMatricula.textContent =
        membro.matricula || "Não informada";

    campoValidade.textContent =
        formatarData(membro.validade);

}

// =====================================
// CARREGAR MEMBRO
// =====================================

async function carregarMembro() {

    if (!id) {

        alert("Membro não informado.");

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

        renderizarMembro(

            resultado.data

        );

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
// INICIALIZAÇÃO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        carregarMembro();

    }

);
