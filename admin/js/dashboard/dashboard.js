// =====================================
// ELEMENTOS
// =====================================

const totalMembros = document.getElementById("totalMembros");

const tabelaUltimos = document.getElementById("tabelaUltimos");

// =====================================
// RENDERIZAÇÃO
// =====================================

function renderizarTotalMembros(total) {

    totalMembros.textContent = total;

}


function renderizarUltimosAcessos(acessos) {

    tabelaUltimos.innerHTML = "";

    acessos.forEach((acesso) => {

        tabelaUltimos.innerHTML += `

            <tr>

                <td>${acesso.nome}</td>

                <td>${acesso.data}</td>

                <td>${acesso.horario}</td>

            </tr>

        `;

    });

}

// =====================================
// BUSCAR DADOS
// =====================================

async function carregarDashboard() {

    try {

        const resposta = await fetch("/api/membros/dashboard");

        const resultado = await resposta.json();

        if (!resultado.success) {

            return;

        }

        renderizarTotalMembros(
            resultado.data.totalMembros
        );

            renderizarUltimosAcessos(
                resultado.data.ultimosAcessos
            );

    } catch (erro) {

        console.error("[DASHBOARD]", erro);

    }

}

document.addEventListener("DOMContentLoaded", () => {

    carregarDashboard();

    setInterval(() => {

        carregarDashboard();

    }, 5000);

});