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

const areaExcluirCadastro =
    document.getElementById("areaExcluirCadastro");

const btnExcluirCadastro =
    document.getElementById("btnExcluirCadastro");

const btnEditarAdministrativo =
    document.getElementById("btnEditarAdministrativo");

const params =
    new URLSearchParams(window.location.search);

const membroId =
    params.get("id");

function configurarVoltarPerfil() {

    if (!linkVoltarPerfil) {

        return;

    }

    linkVoltarPerfil.href =
        "/dashboard";

    const texto =
        linkVoltarPerfil.querySelector("span");

    if (texto) {

        texto.textContent =
            "Voltar";

    }

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

        const url =

            membroId
                ? `/api/membros/${membroId}`
                : "/api/membros/perfil";

        const resposta =

            await fetch(

                url

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

        if (

            membroId &&

            areaExcluirCadastro

        ) {

            areaExcluirCadastro.classList.remove("hidden");

        }

    } catch (erro) {

        console.error(erro);

        alert(

            erro.message ||

            "Erro ao carregar o perfil."

        );

        window.location.href =
            "/dashboard";

    }

}

async function excluirCadastro() {

    if (!membroId) {

        return;

    }

    const confirmar =
        confirm("Tem certeza que deseja excluir este cadastro?");

    if (!confirmar) {

        return;

    }

    try {

        const resposta =
            await fetch(

                `/api/membros/${membroId}`,

                {

                    method: "DELETE"

                }

            );

        const resultado =
            await resposta.json();

        alert(

            resultado.message ||
            "Cadastro excluido."

        );

        if (resultado.success) {

            window.location.href = "/admin/membros";

        }

    }

    catch (erro) {

        console.error("[PERFIL][EXCLUIR]", erro);

        alert("Erro ao excluir o cadastro.");

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

        if (btnExcluirCadastro) {

            btnExcluirCadastro.addEventListener(

                "click",

                excluirCadastro

            );

        }

        if (btnEditarAdministrativo && membroId) {

            btnEditarAdministrativo.addEventListener(

                "click",

                () => {

                    window.location.href =
                        `/cadastro?id=${membroId}`;

                }

            );

        }

    }

);
