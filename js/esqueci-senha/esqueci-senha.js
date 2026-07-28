// =====================================
// ELEMENTOS
// =====================================

const formulario =
    document.getElementById("formRecuperar");

const campoEmail =
    document.getElementById("email");

// =====================================
// VALIDAÇÕES
// =====================================

function validarEmail() {

    const email =
        campoEmail.value.trim();

    if (!email) {

        alert("Informe o e-mail.");

        campoEmail.focus();

        return false;

    }

    const regex =

        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!regex.test(email)) {

        alert("Informe um e-mail válido.");

        campoEmail.focus();

        return false;

    }

    return true;

}

// =====================================
// ENVIAR
// =====================================

async function enviarRecuperacao(event) {

    event.preventDefault();

    if (!validarEmail()) {

        return;

    }

    try {

        const resposta = await fetch(

            "/api/membros/esqueci-senha",

            {

                method: "POST",

                headers: {

                    "Content-Type":

                        "application/json"

                },

                body: JSON.stringify({

                    email:

                        campoEmail.value.trim()

                })

            }

        );

        const resultado =

            await resposta.json();

        alert(resultado.message);

        if (resposta.ok) {

            formulario.reset();

            campoEmail.focus();

        }

    }

    catch (erro) {

        console.error(

            "[RECUPERAR_SENHA]",

            erro

        );

        alert(

            "Erro ao conectar ao servidor."

        );

    }

}

// =====================================
// EVENTOS
// =====================================

formulario.addEventListener(

    "submit",

    enviarRecuperacao

);

// =====================================
// INICIALIZAÇÃO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        campoEmail.focus();

    }

);