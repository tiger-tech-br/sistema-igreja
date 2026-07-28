// =====================================
// CADASTRO DE MEMBROS
// =====================================

// =====================================
// ELEMENTOS
// =====================================

const formulario =
    document.getElementById("formCadastro");

const params =
    new URLSearchParams(
        window.location.search
    );

const id =
    params.get("id");

// =====================================
// CAMPOS
// =====================================

const campoNome =
    document.getElementById("nome");

const campoCelular =
    document.getElementById("celular");

const campoTelefone =
    document.getElementById("telefone");

const campoEmail =
    document.getElementById("email");

const campoEndereco =
    document.getElementById("endereco");

const campoSexo =
    document.getElementById("sexo");

const campoEstadoCivil =
    document.getElementById("estadoCivil");

const campoDataNascimento =
    document.getElementById("dataNascimento");

const campoSenha =
    document.getElementById("senha");

const erroData =
    document.getElementById("erroData");

// =====================================
// UTILITÃRIOS
// =====================================

function estaEditando() {

    return id !== null;

}

function limparFormulario() {

    formulario.reset();

    limparErroData();

}

function limparErroData() {

    erroData.textContent = "";

    campoDataNascimento.classList.remove(

        "input-erro",

        "input-sucesso"

    );

}

function mostrarErroData(mensagem) {

    limparErroData();

    erroData.textContent = mensagem;

    campoDataNascimento.classList.add(

        "input-erro"

    );

}

function marcarDataValida() {

    limparErroData();

    campoDataNascimento.classList.add(

        "input-sucesso"

    );

}

// =====================================
// MÃSCARA CELULAR
// =====================================

function aplicarMascaraCelular() {

    let valor =

        campoCelular.value

            .replace(/\D/g, "")

            .slice(0, 11);

    if (valor.length > 10) {

        valor = valor.replace(

            /^(\d{2})(\d{5})(\d{4})$/,

            "($1) $2-$3"

        );

    }

    else if (valor.length > 6) {

        valor = valor.replace(

            /^(\d{2})(\d{4,5})(\d+)/,

            "($1) $2-$3"

        );

    }

    else if (valor.length > 2) {

        valor = valor.replace(

            /^(\d{2})(\d+)/,

            "($1) $2"

        );

    }

    campoCelular.value = valor;

}

// =====================================
// MÃSCARA TELEFONE
// =====================================

function aplicarMascaraTelefone() {

    let valor =

        campoTelefone.value

            .replace(/\D/g, "")

            .slice(0, 10);

    if (valor.length > 6) {

        valor = valor.replace(

            /^(\d{2})(\d{4})(\d+)$/,

            "($1) $2-$3"

        );

    }

    else if (valor.length > 2) {

        valor = valor.replace(

            /^(\d{2})(\d+)/,

            "($1) $2"

        );

    }

    campoTelefone.value = valor;

}

// =====================================
// MÃSCARA DATA
// =====================================

function aplicarMascaraData() {

    let valor =

        campoDataNascimento.value

            .replace(/\D/g, "")

            .slice(0, 8);

    if (valor.length > 4) {

        valor =

            `${valor.slice(0, 2)}/${valor.slice(2, 4)}/${valor.slice(4)}`;

    }

    else if (valor.length > 2) {

        valor =

            `${valor.slice(0, 2)}/${valor.slice(2)}`;

    }

    campoDataNascimento.value = valor;

}

// =====================================
// VALIDAR NOME
// =====================================

function validarNome() {

    return campoNome.value.trim().length >= 3;

}

// =====================================
// VALIDAR CELULAR
// =====================================

function validarCelular() {

    const celular =

        campoCelular.value.replace(/\D/g, "");

    return celular.length === 11;

}

// =====================================
// VALIDAR TELEFONE
// =====================================

function validarTelefone() {

    const telefone =

        campoTelefone.value.replace(/\D/g, "");

    if (telefone === "") {

        return true;

    }

    return telefone.length === 10;

}

// =====================================
// VALIDAR E-MAIL
// =====================================

function validarEmail() {

    const email =

        campoEmail.value.trim();

    const regex =

        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return regex.test(email);

}

// =====================================
// VALIDAR SENHA
// =====================================

function validarSenha() {

    return campoSenha.value.trim().length >= 6;

}

// =====================================
// VALIDAR DATA
// =====================================

function validarDataNascimento() {

    const valor =

        campoDataNascimento.value.trim();

    if (valor === "") {

        mostrarErroData(

            "Informe a data de nascimento."

        );

        return false;

    }

    const regex =

        /^(\d{2})\/(\d{2})\/(\d{4})$/;

    if (!regex.test(valor)) {

        mostrarErroData(

            "Formato invÃ¡lido. Utilize DD/MM/AAAA."

        );

        return false;

    }

    const [

        ,

        diaTexto,

        mesTexto,

        anoTexto

    ] = valor.match(regex);

    const dia = Number(diaTexto);

    const mes = Number(mesTexto);

    const ano = Number(anoTexto);

    if (

        mes < 1 ||

        mes > 12

    ) {

        mostrarErroData(

            "MÃªs invÃ¡lido."

        );

        return false;

    }

    const diasPorMes = [

        31,

        (ano % 4 === 0 && ano % 100 !== 0) ||

        (ano % 400 === 0)

            ? 29

            : 28,

        31,

        30,

        31,

        30,

        31,

        31,

        30,

        31,

        30,

        31

    ];

    if (

        dia < 1 ||

        dia > diasPorMes[mes - 1]

    ) {

        mostrarErroData(

            "Dia invÃ¡lido."

        );

        return false;

    }

    marcarDataValida();

    return valor;

}

// =====================================
// VALIDAR FORMULÃRIO
// =====================================

function validarFormulario() {

    if (!validarNome()) {

        alert(

            "Informe um nome vÃ¡lido."

        );

        campoNome.focus();

        return false;

    }

    if (!validarCelular()) {

        alert(

            "Informe um celular vÃ¡lido."

        );

        campoCelular.focus();

        return false;

    }

    if (!validarTelefone()) {

        alert(

            "Informe um telefone fixo vÃ¡lido ou deixe em branco."

        );

        campoTelefone.focus();

        return false;

    }

    if (!validarEmail()) {

        alert(

            "Informe um e-mail vÃ¡lido."

        );

        campoEmail.focus();

        return false;

    }

    if (!validarSenha()) {

        alert(

            "A senha deve possuir pelo menos 6 caracteres."

        );

        campoSenha.focus();

        return false;

    }

    if (!validarDataNascimento()) {

        campoDataNascimento.focus();

        return false;

    }

    return true;

}

// =====================================
// OBTER DADOS DO FORMULÃRIO
// =====================================

function obterDadosFormulario() {

    return {

        nome:

            campoNome.value.trim(),

        celular:

            campoCelular.value.trim(),

        telefone:

            campoTelefone.value.trim(),

        email:

            campoEmail.value.trim(),

        endereco:

            campoEndereco.value.trim(),

        sexo:

            campoSexo.value,

        estadoCivil:

            campoEstadoCivil.value,

        dataNascimento:

            campoDataNascimento.value.trim(),

        senha:

            campoSenha.value

    };

}

// =====================================
// PREENCHER FORMULÃRIO
// =====================================

function preencherFormulario(membro) {

    campoNome.value =
        membro.nome || "";

    campoCelular.value =
        membro.celular || "";

    campoTelefone.value =
        membro.telefone || "";

    campoEmail.value =
        membro.email || "";

    campoEndereco.value =
        membro.endereco || "";
    campoSexo.value =
        membro.sexo || "";

    campoEstadoCivil.value =
        membro.estado_civil || "";

    campoDataNascimento.value =
        membro.data_nascimento || "";
}

// =====================================
// CARREGAR MEMBRO
// =====================================

async function carregarMembro() {

    if (!estaEditando()) {

        return;

    }

    try {

        const resposta =

            await fetch(

                `/api/membros/${id}`

            );

        const resultado =

            await resposta.json();

        if (!resultado.success) {

            throw new Error(

                resultado.message

            );

        }

        preencherFormulario(

            resultado.data

        );

    }

    catch (erro) {

        console.error(

            "[CADASTRO]",

            erro

        );

        alert(

            "Erro ao carregar o membro."

        );

        window.location.href =

            "/";

    }

}

// =====================================
// SALVAR MEMBRO
// =====================================

async function salvarMembro(event) {

    event.preventDefault();

    if (!validarFormulario()) {

        return;

    }

    const dados =

        obterDadosFormulario();

    const url =

        estaEditando()

            ? `/api/membros/${id}`

            : "/api/membros";

    const metodo =

        estaEditando()

            ? "PUT"

            : "POST";

    try {

        const resposta =

            await fetch(url, {

                method: metodo,

                headers: {

                    "Content-Type":

                        "application/json"

                },

                body:

                    JSON.stringify(dados)

            });

        const resultado =

            await resposta.json();

        if (!resposta.ok) {

            throw new Error(

                resultado.message ||

                "Erro ao salvar o cadastro."

            );

        }

        alert(

            resultado.message

        );

        if (estaEditando()) {

            window.location.href =

                "/perfil";

            return;

        }

        limparFormulario();

        campoNome.focus();

    }

    catch (erro) {

        console.error(

            "[CADASTRO]",

            erro

        );

        alert(

            erro.message ||

            "Erro ao salvar o cadastro."

        );

    }

}

// =====================================
// EVENTOS
// =====================================

campoCelular.addEventListener(

    "input",

    aplicarMascaraCelular

);

campoTelefone.addEventListener(

    "input",

    aplicarMascaraTelefone

);

campoDataNascimento.addEventListener(

    "input",

    aplicarMascaraData

);

formulario.addEventListener(

    "submit",

    salvarMembro

);

// =====================================
// INICIALIZAÃ‡ÃƒO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        carregarMembro();

        campoNome.focus();

    }

);