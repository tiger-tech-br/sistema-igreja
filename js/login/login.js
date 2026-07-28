// =====================================
// ELEMENTOS
// =====================================

const formulario =
    document.getElementById("formLogin");

const campoEmail =
    document.getElementById("email");

const campoSenha =
    document.getElementById("senha");

// =====================================
// VALIDAÇÕES
// =====================================

function validarEmail() {

    const email =

        campoEmail.value.trim();

    if (!email) {

        alert(

            "Informe o e-mail."

        );

        campoEmail.focus();

        return false;

    }

    const regex =

        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!regex.test(email)) {

        alert(

            "Informe um e-mail válido."

        );

        campoEmail.focus();

        return false;

    }

    return true;

}

function validarSenha() {

    const senha =

        campoSenha.value.trim();

    if (!senha) {

        alert(

            "Informe a senha."

        );

        campoSenha.focus();

        return false;

    }

    return true;

}

function validarFormulario() {

    return (

        validarEmail()

        &&

        validarSenha()

    );

}

// =====================================
// LOGIN
// =====================================

async function fazerLogin(event) {

    event.preventDefault();

    if (!validarFormulario()) {

        return;

    }

    try {

        const resposta =

            await fetch(

                "/api/membros/login",

                {

                    method: "POST",

                    headers: {

                        "Content-Type": "application/json"

                    },

                    body: JSON.stringify({

                        email:

                            campoEmail.value.trim(),

                        senha:

                            campoSenha.value.trim()

                    })

                }

            );

                const resultado =

                    await resposta.json();

                if (!resposta.ok) {

                    alert(

                        resultado.message

                    );

                    return;

                }

                // Limpa o formulário

                formulario.reset();

                window.location.reload();

                // Fecha o dropdown (se existir)

                const loginMenu =

                    document.getElementById("loginMenu");

                if (loginMenu) {

                    loginMenu.classList.remove("active");

                }

                // Atualiza o botão Login → Andrey

                if (typeof verificarSessao === "function") {

                    await verificarSessao();

                }
        }

    catch (erro) {

        console.error(

            "[LOGIN_MEMBRO]",

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

if (formulario) {

    formulario.addEventListener(

        "submit",

        fazerLogin

    );

}

// =====================================
// INICIALIZAÇÃO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        if (campoEmail) {

            campoEmail.focus();

        }

    }

);