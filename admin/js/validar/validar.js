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
// UTILITARIOS
// =====================================

function formatarData(data) {

    if (!data) {

        return "Nao informada";

    }

    if (String(data).includes("/")) {

        return data;

    }

    return new Date(data)
        .toLocaleDateString("pt-BR");

}

function mostrarTexto(elemento, valor, padrao = "") {

    elemento.textContent =
        valor || padrao;

}

// =====================================
// RENDERIZAR MEMBRO
// =====================================

function renderizarMembro(membro) {

    mostrarTexto(
        campoNome,
        membro.nome,
        "Membro nao informado"
    );

    if (membro.cargo) {

        areaCargo.hidden = false;

        mostrarTexto(
            campoCargo,
            membro.cargo
        );

    } else {

        areaCargo.hidden = true;

        campoCargo.textContent = "";

    }

    mostrarTexto(
        campoMatricula,
        membro.matricula,
        "Nao informada"
    );

    campoValidade.textContent =
        formatarData(membro.validade);

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
// INICIALIZACAO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        carregarMembro();

    }

);
