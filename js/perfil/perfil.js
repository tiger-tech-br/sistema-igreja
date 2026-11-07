// =====================================
// PERFIL DO MEMBRO
// =====================================

// =====================================
// ELEMENTOS
// =====================================

const campoNome =
    document.getElementById("nome");

const linkVoltarPerfil =
    document.getElementById("linkVoltarPerfil");

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

const qrCode =
    document.getElementById("qrCode");

const qrStatus =
    document.getElementById("perfilQrStatus");

let perfilExcluido = false;

function configurarVoltarPerfil() {

    if (!linkVoltarPerfil) {

        return;

    }

    linkVoltarPerfil.href =
        "/";

}



// =====================================
// UTILITÁRIOS
// =====================================

function textoOuPadrao(valor) {

    if (

        valor === null ||

        valor === undefined ||

        valor === ""

    ) {

        return "Não informado";

    }

    return valor;

}

function mostrarCampo(

    elemento,

    valor

) {

    const info =
        elemento.closest(".info");

    if (

        valor === null ||

        valor === undefined ||

        valor === ""

    ) {

        if (info) {

            info.hidden = true;

        }

        elemento.textContent = "";

        return;

    }

    if (info) {

        info.hidden = false;

    }

    elemento.textContent =

        textoOuPadrao(valor);

}

// =====================================
// RENDERIZAR PERFIL
// =====================================

function renderizarPerfil(membro) {
    if (perfilExcluido) return;

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

    qrCode.hidden = true;
    qrCode.removeAttribute("src");
    if (qrStatus) qrStatus.hidden = false;

    if (typeof membro.qr_code === "string" && membro.qr_code.trim()) {
        if (qrStatus) qrStatus.textContent = "Carregando seu QR Code...";
        qrCode.onload = () => {
            if (perfilExcluido) return;
            qrCode.hidden = false;
            if (qrStatus) qrStatus.hidden = true;
        };
        qrCode.onerror = () => {
            if (perfilExcluido) return;
            qrCode.hidden = true;
            if (qrStatus) {
                qrStatus.hidden = false;
                qrStatus.textContent = "Não foi possível carregar seu QR Code. Tente novamente em instantes.";
            }
        };
        qrCode.src = membro.qr_code;
    } else if (qrStatus) {
        qrStatus.textContent = "Seu QR Code não está disponível. Consulte Privacidade e seus dados para verificar suas autorizações.";
    }

}


// =====================================
// CARREGAR PERFIL
// =====================================

async function carregarPerfil() {
    if (perfilExcluido) return;

    try {

        const url =

            "/api/membros/perfil";

        const resposta =

            await fetch(

                url

            );

        const resultado =

            await resposta.json();

        if (perfilExcluido) return;

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
        if (perfilExcluido) return;

        console.error(erro);

        alert(

            erro.message ||

            "Erro ao carregar o perfil."

        );

        window.location.href =
            "/";

    }

}

// =====================================
// INICIALIZACAO
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        configurarVoltarPerfil();

        carregarPerfil();

    }

);

document.addEventListener('member:deleted', () => {
    perfilExcluido = true;
    for (const element of [campoNome, campoCargo, campoMatricula, campoValidade, campoCelular, campoTelefone, campoEmail, campoEndereco, campoMinisterio, campoSexo, campoEstadoCivil, campoNascimento]) element.textContent = '';
    qrCode.onload = null;
    qrCode.onerror = null;
    qrCode.removeAttribute('src');
    qrCode.hidden = true;
    if (qrStatus) { qrStatus.textContent = ''; qrStatus.hidden = true; }
    document.querySelectorAll('.member-identity, .member-profile-grid').forEach(element => { element.hidden = true; });
    document.querySelectorAll('#perfilNavegacao a[href="/perfil"], #perfilNavegacao a[href="/membros"], #perfilNavegacao a[href="/logout"]').forEach(element => { element.hidden = true; });
    const title = document.getElementById('tituloPerfil');
    const description = document.getElementById('descricaoPerfil');
    if (title) title.textContent = 'Conta excluída';
    if (description) description.textContent = 'Seu cadastro foi removido e você saiu da conta.';
});
