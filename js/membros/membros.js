// =====================================
// LISTA DE MEMBROS
// =====================================

// =====================================
// ELEMENTOS
// =====================================

const tabelaMembros =
    document.getElementById("listaMembros");

// =====================================
// UTILITÁRIOS
// =====================================

function limparTabela() {

    tabelaMembros.innerHTML = "";

}

function criarLinha(nome) {

    const linha =
        document.createElement("tr");

    linha.innerHTML = `

        <td>

            <div class="nome-membro">

                <i class="fa-solid fa-user"></i>

                <span>${nome}</span>

            </div>

        </td>

    `;

    return linha;

}

function mostrarListaVazia() {

    tabelaMembros.innerHTML = `

        <tr>

            <td class="lista-vazia">

                Nenhum membro encontrado.

            </td>

        </tr>

    `;

}

// =====================================
// CARREGAR MEMBROS
// =====================================

async function carregarMembros() {

    limparTabela();

    try {

        const resposta =

            await fetch(

                "/api/membros/lista"

            );

        const resultado =

            await resposta.json();

        if (!resposta.ok) {

            throw new Error(

                resultado.message ||

                "Erro ao carregar os membros."

            );

        }

        const membros =

            resultado.data;

        if (

            !Array.isArray(membros) ||

            membros.length === 0

        ) {

            mostrarListaVazia();

            return;

        }

        membros.forEach((membro) => {

            tabelaMembros.appendChild(

                criarLinha(

                    membro.nome

                )

            );

        });

    }

    catch (erro) {

        console.error(

            "[MEMBROS]",

            erro

        );

        mostrarListaVazia();

    }

}

// =====================================
// INICIALIZAÇÃO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        carregarMembros();

    }

);