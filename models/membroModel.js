// =====================================
// IMPORTA?ÃƒO
// =====================================

const pool =
    require("../database/connection");

const bcrypt = require("bcrypt");
    

// =====================================
// CLASSE
// =====================================

class MembroModel {

    // =====================================
    // CRIAR
    // =====================================

    async criar(dados) {

        const {

            nome,
            dataNascimento,
            telefone,
            email,
            senha,
            celular,
            endereco,
            cargo,
            ministerio,
            sexo,
            estadoCivil,
            matricula,
            validade

        } = dados;

        // SENHA

        const senhaHash =

        await bcrypt.hash(

        senha,

        10

        );

        const sql = `

            INSERT INTO membros (

                nome,
                data_nascimento,
                telefone,
                celular,
                email,
                senha,
                email_verificado,
                endereco,
                cargo,
                ministerio,
                sexo,
                estado_civil,
                matricula,
                validade

            )

            VALUES (

                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14

            )

            RETURNING
                id,
                nome,
                data_nascimento,
                telefone,
                celular,
                email,
                email_verificado,
                endereco,
                cargo,
                ministerio,
                sexo,
                estado_civil,
                matricula,
                validade,
                qr_code,
                criado_em;

        `;

            const valores = [

                    nome,

                    dataNascimento || null,

                    telefone,

                    celular,

                    email,

                    senhaHash,

                    true,

                    endereco,

                    cargo,

                    ministerio,

                    sexo,

                    estadoCivil,
                    matricula,

                    validade

                ];
        try {

            const resultado =
                await pool.query(sql, valores);

            return resultado.rows[0];

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][CRIAR]",

                erro

            );

            throw erro;

        }

    }


        // =====================================
    // LISTAR
    // =====================================

 async listar() {

    const sql = `

        SELECT

            id,

            nome,

            TO_CHAR(

                data_nascimento,

                'DD/MM/YYYY'

            ) AS data_nascimento,

            telefone,

            celular,

            email,

            endereco,

            cargo,

            ministerio,

            sexo,

            estado_civil,
                matricula,

            TO_CHAR(

                validade,

                'DD/MM/YYYY'

            ) AS validade,

            qr_code

        FROM membros

        ORDER BY nome;

    `;

    try {

        const resultado =

            await pool.query(sql);

        return resultado.rows;

    }

    catch (erro) {

        console.error(

            "[MEMBRO_MODEL][LISTAR]",

            erro

        );

        throw erro;

    }

}

    // =====================================
// LISTAR NOMES
// =====================================

async listarNomes() {

    const sql = `

        SELECT

            id,

            nome

        FROM membros

        ORDER BY nome;

    `;

    try {

        const resultado =

            await pool.query(sql);

        return resultado.rows;

    }

    catch (erro) {

        console.error(

            "[MEMBRO_MODEL][LISTAR_NOMES]",

            erro

        );

        throw erro;

    }

}

// =====================================
// BUSCAR POR E-MAIL
// =====================================

async buscarPorEmail(email) {

    const sql = `

        SELECT *

        FROM membros

        WHERE email = $1

        LIMIT 1;

    `;

    try {

        const resultado =

            await pool.query(

                sql,

                [email]

            );

        return resultado.rows[0] || null;

    }

    catch (erro) {

        console.error(

            "[MEMBRO_MODEL][BUSCAR_EMAIL]",

            erro

        );

        throw erro;

    }

}

// =====================================
// SALVAR TOKEN DE RECUPERA?ÃƒO
// =====================================

async salvarTokenRecuperacao(

    id,

    token,

    expiracao

) {

    const sql = `

        UPDATE membros

        SET

            token_redefinicao = $1,

            token_expira_em = $2

        WHERE id = $3

        RETURNING *;

    `;

    try {

        const resultado =

            await pool.query(

                sql,

                [

                    token,

                    expiracao,

                    id

                ]

            );

        return resultado.rows[0];

    }

    catch (erro) {

        console.error(

            "[MEMBRO_MODEL][SALVAR_TOKEN]",

            erro

        );

        throw erro;

    }

}

// =====================================
// BUSCAR POR TOKEN
// =====================================

async buscarPorToken(token) {

    const sql = `

        SELECT *

        FROM membros

        WHERE token_redefinicao = $1

        LIMIT 1;

    `;

    try {

        const resultado =

            await pool.query(

                sql,

                [

                    token

                ]

            );

        return resultado.rows[0] || null;

    }

    catch (erro) {

        console.error(

            "[MEMBRO_MODEL][BUSCAR_TOKEN]",

            erro

        );

        throw erro;

    }

}

// =====================================
// ATUALIZAR SENHA
// =====================================

async atualizarSenha(

    id,

    senha

) {

    const sql = `

        UPDATE membros

        SET

            senha = $1

        WHERE id = $2

        RETURNING id;

    `;

    try {

        const resultado =

            await pool.query(

                sql,

                [

                    senha,

                    id

                ]

            );

        return resultado.rows[0];

    }

    catch (erro) {

        console.error(

            "[MEMBRO_MODEL][ATUALIZAR_SENHA]",

            erro

        );

        throw erro;

    }

}

// =====================================
// LIMPAR TOKEN
// =====================================

async limparTokenRecuperacao(

    id

) {

    const sql = `

        UPDATE membros

        SET

            token_redefinicao = NULL,

            token_expira_em = NULL

        WHERE id = $1;

    `;

    try {

        await pool.query(

            sql,

            [

                id

            ]

        );

    }

    catch (erro) {

        console.error(

            "[MEMBRO_MODEL][LIMPAR_TOKEN]",

            erro

        );

        throw erro;

    }

}

    // =====================================
    // BUSCAR POR ID
    // =====================================

    async buscarPorId(id) {

        const sql = `

            SELECT

                id,

                nome,

                TO_CHAR(

                    data_nascimento,

                    'DD/MM/YYYY'

                ) AS data_nascimento,

                telefone,

                celular,

                email,

                endereco,

                cargo,

                ministerio,

                sexo,

                estado_civil,
                matricula,

                TO_CHAR(

                    validade,

                    'DD/MM/YYYY'

                ) AS validade,

                qr_code,

                token_expira_em,

                email_verificado

            FROM membros

            WHERE id = $1;

        `;

        try {

            const resultado =
                await pool.query(

                    sql,

                    [id]

                );

            return resultado.rows[0];

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][BUSCAR_POR_ID]",

                erro

            );

            throw erro;

        }

    }

    // =====================================
    // BUSCAR POR MATR?CULA
    // =====================================

    async buscarPorMatricula(matricula) {

        const sql = `

            SELECT id

            FROM membros

            WHERE matricula = $1

            LIMIT 1;

        `;

        try {

            const resultado =
                await pool.query(

                    sql,

                    [matricula]

                );

            return resultado.rows[0] || null;

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][BUSCAR_MATRICULA]",

                erro

            );

            throw erro;

        }

    }

        // =====================================
    // ATUALIZAR
    // =====================================

    async atualizar(id, dados) {

        const {

            nome,
            dataNascimento,
            telefone,
            celular,
            email,
            endereco,
            cargo,
            ministerio,
            sexo,
            estadoCivil,
        } = dados;

        const sql = `

            UPDATE membros

            SET

                nome = $1,
                data_nascimento = $2,
                telefone = $3,
                celular = $4,
                email = $5,
                endereco = $6,
                cargo = $7,
                ministerio = $8,
                sexo = $9,
                estado_civil = $10
            WHERE id = $11

            RETURNING
                id,
                nome,
                data_nascimento,
                telefone,
                celular,
                email,
                email_verificado,
                endereco,
                cargo,
                ministerio,
                sexo,
                estado_civil,
                matricula,
                validade,
                qr_code,
                criado_em;

        `;

        const valores = [

            nome,

            dataNascimento || null,

            telefone,

            celular,

            email,

            endereco,

            cargo,

            ministerio,

            sexo,

            estadoCivil,
            id

        ];

        try {

            const resultado =
                await pool.query(

                    sql,

                    valores

                );

            return resultado.rows[0];

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][ATUALIZAR]",

                erro

            );

            throw erro;

        }

    }

    // =====================================
    // EXCLUIR
    // =====================================

    async excluir(id) {

        const sql = `

            DELETE FROM membros

            WHERE id = $1

            RETURNING *;

        `;

        try {

            const resultado =
                await pool.query(

                    sql,

                    [id]

                );

            return resultado.rows[0];

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][EXCLUIR]",

                erro

            );

            throw erro;

        }

    }

    // =====================================
    // ATUALIZAR QR CODE
    // =====================================


    async atualizarQRCode(id, qrCode) {

        const sql = `

            UPDATE membros

            SET qr_code = $1

            WHERE id = $2

            RETURNING *;

        `;

        try {

            const resultado =
                await pool.query(

                    sql,

                    [

                        qrCode,

                        id

                    ]

                );

            return resultado.rows[0];

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][ATUALIZAR_QRCODE]",

                erro

            );

            throw erro;

        }

    }

    // =====================================
    // ATUALIZAR DADOS ADMINISTRATIVOS
    // =====================================

    async atualizarDadosAdministrativos(id, dados) {

        const {

            cargo,
            ministerio

        } = dados;

        const sql = `

            UPDATE membros

            SET

                cargo = $1,
                ministerio = $2

            WHERE id = $3

            RETURNING
                id,
                nome,
                data_nascimento,
                telefone,
                celular,
                email,
                email_verificado,
                endereco,
                cargo,
                ministerio,
                sexo,
                estado_civil,
                matricula,
                validade,
                qr_code,
                criado_em;

        `;

        const valores = [

            cargo || null,

            ministerio || null,

            id

        ];

        try {

            const resultado =
                await pool.query(sql, valores);

            return resultado.rows[0];

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][ATUALIZAR_ADMIN]",

                erro

            );

            throw erro;

        }

    }

        // =====================================
    // LISTAR SEM MATR?CULA
    // =====================================

    async listarSemMatricula() {

        const sql = `

            SELECT *

            FROM membros

            WHERE matricula IS NULL

               OR validade IS NULL;

        `;

        try {

            const resultado =
                await pool.query(sql);

            return resultado.rows;

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][LISTAR_SEM_MATRICULA]",

                erro

            );

            throw erro;

        }

    }

    // =====================================
    // ATUALIZAR MATR?CULA E VALIDADE
    // =====================================

    async atualizarMatriculaValidade(

        id,

        matricula,

        validade

    ) {

        const sql = `

            UPDATE membros

            SET

                matricula = $1,

                validade = $2

            WHERE id = $3;

        `;

        try {

            await pool.query(

                sql,

                [

                    matricula,

                    validade,

                    id

                ]

            );

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][ATUALIZAR_MATRICULA]",

                erro

            );

            throw erro;

        }

    }

    // =====================================
    // ÚLTIMOS MEMBROS
    // =====================================

    async listarUltimos(limit = 5) {

        const sql = `

            SELECT

                id,

                nome,

                cargo

            FROM membros

            ORDER BY id DESC

            LIMIT $1;

        `;

        try {

            const resultado =
                await pool.query(

                    sql,

                    [limit]

                );

            return resultado.rows;

        } catch (erro) {

            console.error(

                "[MEMBRO_MODEL][ULTIMOS]",

                erro

            );

            throw erro;

        }

    }

    // =====================================
// REGISTRAR ACESSO
// =====================================

async registrarAcesso(

    membroId

) {

    const sql = `

        INSERT INTO acessos (

            membro_id,

            data,

            horario

        )

        VALUES (

            $1,

            CURRENT_DATE,

            CURRENT_TIME

        )

        RETURNING *;

    `;

    try {

        const resultado =

            await pool.query(

                sql,

                [

                    membroId

                ]

            );

        return resultado.rows[0];

    }

    catch (erro) {

        console.error(

            "[MEMBRO_MODEL][REGISTRAR_ACESSO]",

            erro

        );

        throw erro;

    }

}

// =====================================
// LISTAR ÚLTIMOS ACESSOS
// =====================================

async listarUltimosAcessos(

    limit = 10

) {

    const sql = `
            SELECT

            m.nome,

            TO_CHAR(

                a.data,

                'DD/MM/YYYY'

            ) AS data,

            TO_CHAR(

                a.horario,

                'HH24:MI'

            ) AS horario

        FROM acessos a

        INNER JOIN membros m

            ON m.id = a.membro_id

        ORDER BY a.id DESC

        LIMIT $1;

    `;

    try {

        const resultado =

            await pool.query(

                sql,

                [

                    limit

                ]

            );

        return resultado.rows;

    }

    catch (erro) {

        console.error(

            "[MEMBRO_MODEL][LISTAR_ULTIMOS_ACESSOS]",

            erro

        );

        throw erro;

    }

}

    // =====================================
    // DASHBOARD
    // =====================================


async dashboard() {

    const total =

        await pool.query(

            `

            SELECT COUNT(*) AS total

            FROM membros

            `

        );

    const ultimosAcessos =

        await this.listarUltimosAcessos();

    return {

        totalMembros:

            Number(

                total.rows[0].total

            ),

        ultimosAcessos

    };

}

}

// =====================================
// EXPORTA?ÃƒO
// =====================================

module.exports = new MembroModel();
