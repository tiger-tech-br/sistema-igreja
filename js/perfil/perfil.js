// =====================================
// PERFIL DO MEMBRO
// =====================================

// =====================================
// ELEMENTOS
// =====================================

const campoNome =
    document.getElementById("nome");

const campoCargo =
    document.getElementById("cargo");

const campoMatricula =
    document.getElementById("matricula");

const campoValidade =
    document.getElementById("validade");

const campoCelular =
    document.getElementById("celular");

const campoTelefone =
    document.getElementById("telefone");

const campoEmail =
    document.getElementById("email");

const campoEndereco =
    document.getElementById("endereco");

const campoMinisterio =
    document.getElementById("ministerio");

const campoSexo =
    document.getElementById("sexo");

const campoEstadoCivil =
    document.getElementById("estadoCivil");

const campoNascimento =
    document.getElementById("nascimento");

const campoIdMembro =
    document.getElementById("idMembro");

const qrCode =
    document.getElementById("qrCode");



// =====================================
// UTILITÃRIOS
// =====================================

function textoOuPadrao(valor) {

    if (

        valor === null ||

        valor === undefined ||

        valor === ""

    ) {

        return "NÃ£o informado";

    }

    return valor;

}

function mostrarCampo(

    elemento,

    valor

) {

    elemento.textContent =

        textoOuPadrao(valor);

}

// =====================================
// RENDERIZAR PERFIL
// =====================================

function renderizarPerfil(membro) {

    mostrarCampo(

        campoNome,

        membro.nome

    );

    mostrarCampo(

        campoCargo,

        membro.cargo

    );

    mostrarCampo(

        campoMatricula,

        membro.matricula

    );

    mostrarCampo(

        campoValidade,

        membro.validade

    );

    mostrarCampo(

        campoCelular,

        membro.celular

    );

    mostrarCampo(

        campoTelefone,

        membro.telefone

    );

    mostrarCampo(

        campoEmail,

        membro.email

    );

    mostrarCampo(

        campoEndereco,

        membro.endereco

    );

    mostrarCampo(

        campoMinisterio,

        membro.ministerio

    );

    mostrarCampo(

        campoSexo,

        membro.sexo

    );

    mostrarCampo(

        campoEstadoCivil,

        membro.estado_civil

    );

    mostrarCampo(

        campoNascimento,

        membro.data_nascimento

    );

    mostrarCampo(

        campoIdMembro,

        membro.id

    );

    if (

        membro.qr_code &&

        membro.qr_code.trim() !== ""

    ) {

        qrCode.src =

            membro.qr_code;

    }

    else {

        qrCode.src =

            "/images/qrcode-exemplo.png";

    }

}


// =====================================
// CARREGAR PERFIL
// =====================================

async function carregarPerfil() {

    try {

        const resposta =

            await fetch(

                "/api/membros/perfil"

            );

        const resultado =

            await resposta.json();

        if (!resposta.ok) {

            throw new Error(

                resultado.message ||

                "Erro ao carregar o perfil."

            );

        }

        renderizarPerfil(

            resultado.data

        );

    } catch (erro) {

        console.error(erro);

        alert(

            erro.message ||

            "Erro ao carregar o perfil."

        );

        window.location.href = "/";

    }

}


// =====================================
// INICIALIZAÃ‡ÃƒO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        carregarPerfil();

    }

);
