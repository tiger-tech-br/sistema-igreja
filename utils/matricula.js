// =====================================
// GERAR MATRÍCULA
// =====================================

function gerarMatricula() {

    return Math.floor(

        10000000 +

        Math.random() * 90000000

    ).toString();

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = gerarMatricula;