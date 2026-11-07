const { randomInt } = require('node:crypto');

function gerarMatricula() {
    return randomInt(10000000, 100000000).toString();
}

module.exports = gerarMatricula;
