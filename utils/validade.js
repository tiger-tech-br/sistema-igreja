// =====================================
// GERAR VALIDADE
// =====================================

function gerarValidade() {

    const hoje = new Date();

    hoje.setFullYear(

        hoje.getFullYear() + 2

    );

    return hoje

        .toISOString()

        .split("T")[0];

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = gerarValidade;