// =====================================
// ELEMENTOS
// =====================================

const formulario =

    document.getElementById(

        "formRedefinirSenha"

    );

const campoSenha =

    document.getElementById(

        "senha"

    );

const campoConfirmacao =

    document.getElementById(

        "confirmarSenha"

    );

const botaoMostrarSenha =

    document.getElementById(

        "mostrarSenha"

    );

const botaoMostrarConfirmacao =

    document.getElementById(

        "mostrarConfirmacao"

    );

// =====================================
// TOKEN
// =====================================

const parametros =

    new URLSearchParams(

        window.location.search

    );

const token =

    parametros.get(

        "token"

    );

// =====================================
// MOSTRAR / OCULTAR SENHA
// =====================================

botaoMostrarSenha.addEventListener(

    "click",

    () => {

        if (

            campoSenha.type === "password"

        ) {

            campoSenha.type = "text";

            botaoMostrarSenha.innerHTML =

                '<i class="fa-solid fa-eye-slash"></i>';

        }

        else {

            campoSenha.type = "password";

            botaoMostrarSenha.innerHTML =

                '<i class="fa-solid fa-eye"></i>';

        }

    }

);

botaoMostrarConfirmacao.addEventListener(

    "click",

    () => {

        if (

            campoConfirmacao.type === "password"

        ) {

            campoConfirmacao.type = "text";

            botaoMostrarConfirmacao.innerHTML =

                '<i class="fa-solid fa-eye-slash"></i>';

        }

        else {

            campoConfirmacao.type = "password";

            botaoMostrarConfirmacao.innerHTML =

                '<i class="fa-solid fa-eye"></i>';

        }

    }

);

// =====================================
// ENVIAR
// =====================================

formulario.addEventListener(

    "submit",

    async (evento) => {

        evento.preventDefault();

        const senha =

            campoSenha.value.trim();

        const confirmarSenha =

            campoConfirmacao.value.trim();

        if (!token) {

            alert(

                "Token inválido."

            );

            return;

        }

        if (

            senha.length < 8

        ) {

            alert(

                "A senha deve possuir pelo menos 8 caracteres."

            );

            return;

        }

        if (

            senha !== confirmarSenha

        ) {

            alert(

                "As senhas não coincidem."

            );

            return;

        }

        try {

            const resposta =

                await fetch(

                    "/api/membros/redefinir-senha",

                    {

                        method: "POST",

                        headers: {

                            "Content-Type":

                                "application/json"

                        },

                        body: JSON.stringify({

                            token,

                            senha

                        })

                    }

                );

            const dados =

                await resposta.json();

            if (!dados.success) {

                alert(

                    dados.message

                );

                return;

            }

            alert(

                "Senha alterada com sucesso."

            );

            window.location.href = "/";

        }

        catch (erro) {

            console.error(

                erro

            );

            alert(

                "Erro ao redefinir a senha."

            );

        }

    }

);