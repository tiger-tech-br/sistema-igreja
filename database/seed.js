// =====================================
// VARIÁVEIS DE AMBIENTE
// =====================================

require("dotenv").config({ quiet: true });

// =====================================
// IMPORTAÇÕES
// =====================================

const bcrypt =
    require("bcrypt");

const pool =
    require("./connection");

// =====================================
// DADOS DO ADMINISTRADOR
// =====================================

const administrador = {

    nome: "Administrador",

    email: "admin@igreja.com",

    senha: "Admin123"

};

// =====================================
// CRIAR ADMINISTRADOR
// =====================================

async function criarAdministrador() {

    try {

        const existe = await pool.query(

            `

            SELECT id

            FROM administradores

            WHERE email = $1;

            `,

            [

                administrador.email

            ]

        );

        if (existe.rows.length > 0) {

            console.log(

                "⚠️ Administrador já existe."

            );

            return;

        }

        const senhaHash =
            await bcrypt.hash(

                administrador.senha,

                10

            );

        await pool.query(

            `

            INSERT INTO administradores (

                nome,

                email,

                senha

            )

            VALUES (

                $1,

                $2,

                $3

            );

            `,

            [

                administrador.nome,

                administrador.email,

                senhaHash

            ]

        );

        console.log(

            "======================================"

        );

        console.log(

            "✅ Administrador criado com sucesso!"

        );

        console.log(

            `📧 E-mail: ${administrador.email}`

        );

        console.log(

            `🔑 Senha: ${administrador.senha}`

        );

        console.log(

            "======================================"

        );

    } catch (erro) {

        console.error(

            "[SEED]",

            erro

        );

    } finally {

        await pool.end();

    }

}

// =====================================
// EXECUTAR
// =====================================

criarAdministrador();
