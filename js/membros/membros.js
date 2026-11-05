// A lista acessada pelo membro mantém o mesmo endpoint e exibe somente nomes.
const tabelaMembros = document.getElementById("listaMembros");
const statusMembros = document.getElementById("statusMembros");

function limparTabela() {
    tabelaMembros.replaceChildren();
}

function criarLinha(nome) {
    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    const pessoa = document.createElement("div");
    pessoa.className = "nome-membro";
    const icone = document.createElement("i");
    icone.className = "fa-regular fa-user";
    icone.setAttribute("aria-hidden", "true");
    const texto = document.createElement("span");
    texto.textContent = nome || "Nome não informado";
    pessoa.append(icone, texto);
    celula.appendChild(pessoa);
    linha.appendChild(celula);
    return linha;
}

function mostrarListaVazia(mensagem = "Nenhum membro encontrado.") {
    limparTabela();
    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    celula.className = "lista-vazia";
    celula.textContent = mensagem;
    linha.appendChild(celula);
    tabelaMembros.appendChild(linha);
}

async function carregarMembros() {
    limparTabela();
    if (statusMembros) {
        statusMembros.setAttribute("role", "status");
        statusMembros.textContent = "Carregando membros...";
    }
    try {
        const resposta = await fetch("/api/membros/lista");
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.message || "Não foi possível carregar os membros.");
        const membros = resultado.data;
        if (!Array.isArray(membros) || membros.length === 0) {
            mostrarListaVazia();
            if (statusMembros) statusMembros.textContent = "";
            return;
        }
        membros.forEach(membro => tabelaMembros.appendChild(criarLinha(membro.nome)));
        if (statusMembros) statusMembros.textContent = membros.length === 1 ? "1 membro na comunidade" : membros.length + " membros na comunidade";
    } catch (erro) {
        console.error("[MEMBROS]", erro);
        mostrarListaVazia("Não foi possível carregar a lista. Tente novamente em instantes.");
        if (statusMembros) {
            statusMembros.setAttribute("role", "alert");
            statusMembros.textContent = erro.message || "Não foi possível carregar os membros.";
        }
    }
}

document.addEventListener("DOMContentLoaded", carregarMembros);
