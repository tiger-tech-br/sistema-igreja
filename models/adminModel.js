// =====================================
// IMPORTAÇÃO
// =====================================

const pool =
    require("../database/connection");

// =====================================
// BUSCAR POR E-MAIL
// =====================================

async function buscarPorEmail(email) {

    const sql = `

        SELECT *

        FROM administradores

        WHERE email = $1;

    `;

    try {

        const resultado =
            await pool.query(

                sql,

                [email]

            );

        return resultado.rows[0];

    } catch (erro) {

        console.error(

            "[ADMIN_MODEL][BUSCAR_EMAIL]",

            erro

        );

        throw erro;

    }

}

// =====================================
// BUSCAR POR ID
// =====================================

async function buscarPorId(id) {

    const sql = `

        SELECT

            id,

            nome,

            email,

            criado_em

        FROM administradores

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

            "[ADMIN_MODEL][BUSCAR_ID]",

            erro

        );

        throw erro;

    }

}

// =====================================
// CRIAR ADMINISTRADOR
// =====================================

async function criarAdministrador(

    nome,

    email,

    senha

) {

    const sql = `

        INSERT INTO administradores (

            nome,

            email,

            senha

        )

        VALUES (

            $1,

            $2,

            $3

        )

        RETURNING

            id,

            nome,

            email,

            criado_em;

    `;

    try {

        const resultado =
            await pool.query(

                sql,

                [

                    nome,

                    email,

                    senha

                ]

            );

        return resultado.rows[0];

    } catch (erro) {

        console.error(

            "[ADMIN_MODEL][CRIAR]",

            erro

        );

        throw erro;

    }

}

// =====================================
// EXPORTAÇÃO
// =====================================

module.exports = {

    buscarPorEmail,

    buscarPorId,

    criarAdministrador

};