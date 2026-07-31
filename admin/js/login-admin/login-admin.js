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

    if (!campoEmail) {

        alert("Campo de e-mail não encontrado.");

        return false;

    }

    const email = campoEmail.value.trim();

    if (email === "") {

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

function validarSenha() {

    if (!campoSenha) {

        alert("Campo de senha não encontrado.");

        return false;

    }

    const senha = campoSenha.value.trim();

    if (senha === "") {

        alert("Informe a senha.");

        campoSenha.focus();

        return false;

    }

    return true;

}

function validarFormulario() {

    if (!validarEmail()) {

        return false;

    }

    if (!validarSenha()) {

        return false;

    }

    return true;

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

        const resposta = await fetch("/api/admin/login", {

            method: "POST",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify({

                email: campoEmail.value.trim(),

                senha: campoSenha.value.trim()

            })

        });

        const resultado = await resposta.json();

        if (!resposta.ok) {

            alert(resultado.message);

            return;

        }

        window.location.href = "/dashboard";

    } catch (erro) {

        console.error("[LOGIN]", erro);

        alert("Erro ao conectar ao servidor.");

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

document.addEventListener("DOMContentLoaded", () => {

    if (campoEmail) {

        campoEmail.focus();

    }

});
