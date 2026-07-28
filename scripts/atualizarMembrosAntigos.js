const membroModel = require("../models/membroModel");

const gerarMatricula = require("../utils/matricula");
const gerarValidade = require("../utils/validade");

async function atualizarMembrosAntigos() {

    try {

        const membros = await membroModel.listarSemMatricula();

        console.log(`Encontrados ${membros.length} membros.`);

        for (const membro of membros) {

            let matricula;

            let existe = true;

            while (existe) {

                matricula = gerarMatricula();

                existe =
                    await membroModel.buscarPorMatricula(matricula);

            }

            const validade = gerarValidade();

            await membroModel.atualizarMatriculaValidade(

                membro.id,

                matricula,

                validade

            );

            console.log(

                `✔ ${membro.nome} atualizado.`

            );

        }

        console.log("Migração concluída!");

    } catch (erro) {

        console.error(erro);

    }

}

atualizarMembrosAntigos();