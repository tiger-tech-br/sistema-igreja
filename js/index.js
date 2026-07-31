// ======================================
// SITE INSTITUCIONAL
// Assembléia de Deus
// index.js
// ======================================

document.addEventListener(

    "DOMContentLoaded",

    () => {

        // ======================================
        // ESTADO DA SESSÃO
        // ======================================

        let usuarioLogado = false;

        // ======================================
        // ELEMENTOS
        // ======================================

        const header =

            document.querySelector(

                "header"

            );

        const menu =

            document.querySelector(

                ".menu"

            );

        const btnMenu =

            document.querySelector(

                ".menu-mobile"

            );

        const backdrop =

            document.querySelector(

                ".menu-backdrop"

            );

        // ======================================
        // DESKTOP
        // ======================================

        const btnLogin =

            document.getElementById(

                "btnLogin"

            );

        const loginMenu =

            document.getElementById(

                "loginMenu"

            );

        // ======================================
        // MOBILE
        // ======================================

        const btnCloseMenu =

            document.getElementById(

                "btnCloseMenu"

            );

        const btnMobileLogin =

            document.getElementById(

                "btnMobileLogin"

            );

        const mobileLoginForm =

            document.getElementById(

                "mobileLoginForm"

            );

        const mobileEmail =

            document.getElementById(

                "mobileEmail"

            );

        const btnVoltarLogin =

            document.getElementById(

                "btnVoltarLogin"

            );

        const mobileLogin =

            document.getElementById(

                "mobileLogin"

            );

        const mobileUser =

            document.getElementById(

                "mobileUser"

            );

        const mobilePerfil =

            document.getElementById(

                "mobilePerfil"

            );

        const mobileLogout =

            document.getElementById(

                "mobileLogout"

            );

        const mobileNome =

            document.getElementById(

                "mobileNome"

            );

        const mobileLogoutBtn =

            document.getElementById(

                "mobileLogoutBtn"

            );


                    // ======================================
        // HEADER
        // ======================================

        function atualizarHeader() {

            if (!header) {

                return;

            }

            header.classList.toggle(

                "header-scroll",

                window.scrollY > 50

            );

        }

        atualizarHeader();

        window.addEventListener(

            "scroll",

            atualizarHeader

        );

        // ======================================
        // MENU MOBILE
        // ======================================

        function atualizarIconeMenu() {

            if (!btnMenu || !menu) {

                return;

            }

            const icone =

                btnMenu.querySelector("i");

            if (!icone) {

                return;

            }

            const menuAberto =

                menu.classList.contains(

                    "active"

                );

            icone.classList.toggle(

                "fa-bars",

                !menuAberto

            );

            icone.classList.toggle(

                "fa-xmark",

                menuAberto

            );

        }

        function abrirMenu() {

            if (

                !menu ||

                !backdrop ||

                !btnMenu

            ) {

                return;

            }

            menu.classList.add(

                "active"

            );

            backdrop.classList.add(

                "active"

            );

            btnMenu.classList.add(

                "active"

            );

            document.body.style.overflow =

                "hidden";

            btnMenu.setAttribute(

                "aria-expanded",

                "true"

            );

            atualizarIconeMenu();

        }

        function fecharMenu() {

            if (

                !menu ||

                !backdrop ||

                !btnMenu

            ) {

                return;

            }

            menu.classList.remove(

                "active"

            );

            backdrop.classList.remove(

                "active"

            );

            btnMenu.classList.remove(

                "active"

            );

            document.body.style.overflow =

                "";

            btnMenu.setAttribute(

                "aria-expanded",

                "false"

            );

            if (mobileLoginForm) {

                mobileLoginForm.classList.add(

                    "hidden"

                );

            }

            atualizarIconeMenu();

        }

        function alternarMenu() {

            if (

                menu.classList.contains(

                    "active"

                )

            ) {

                fecharMenu();

            }

            else {

                abrirMenu();

            }

        }

        if (btnMenu) {

            btnMenu.addEventListener(

                "click",

                alternarMenu

            );

        }

        if (btnCloseMenu) {

            btnCloseMenu.addEventListener(

                "click",

                fecharMenu

            );

        }

        if (backdrop) {

            backdrop.addEventListener(

                "click",

                fecharMenu

            );

        }

        document.addEventListener(

            "keydown",

            (event) => {

                if (

                    event.key ===

                    "Escape"

                ) {

                    fecharMenu();

                }

            }

        );

        window.addEventListener(

            "resize",

            () => {

                if (

                    window.innerWidth >

                    992

                ) {

                    fecharMenu();

                }

            }

        );

                // ======================================
        // SCROLL SUAVE
        // ======================================

        const linksInternos =

            document.querySelectorAll(

                'a[href^="#"]'

            );

        linksInternos.forEach(

            (link) => {

                link.addEventListener(

                    "click",

                    (event) => {

                        const href =

                            link.getAttribute(

                                "href"

                            );

                        if (

                            href === "#"

                        ) {

                            return;

                        }

                        const destino =

                            document.querySelector(

                                href

                            );

                        if (

                            !destino

                        ) {

                            return;

                        }

                        event.preventDefault();

                        destino.scrollIntoView({

                            behavior: "smooth",

                            block: "start"

                        });

                        fecharMenu();

                    }

                );

            }

        );

                // ======================================
        // LOGIN DESKTOP
        // ======================================

        function abrirDropdownLogin() {

            if (

                !btnLogin ||

                !loginMenu

            ) {

                return;

            }

            loginMenu.classList.add(

                "active"

            );

            btnLogin.classList.add(

                "active"

            );

        }

        function fecharDropdownLogin() {

            if (

                !btnLogin ||

                !loginMenu

            ) {

                return;

            }

            loginMenu.classList.remove(

                "active"

            );

            btnLogin.classList.remove(

                "active"

            );

        }

        function alternarDropdownLogin() {

            if (

                window.innerWidth <= 992

            ) {

                return;

            }

            loginMenu.classList.toggle(

                "active"

            );

            btnLogin.classList.toggle(

                "active"

            );

        }

        if (

            btnLogin &&

            loginMenu

        ) {

            btnLogin.addEventListener(

                "click",

                (event) => {

                    event.stopPropagation();

                    alternarDropdownLogin();

                }

            );

            document.addEventListener(

                "click",

                (event) => {

                    if (

                        window.innerWidth <= 992

                    ) {

                        return;

                    }

                    if (

                        !btnLogin.contains(

                            event.target

                        )

                        &&

                        !loginMenu.contains(

                            event.target

                        )

                    ) {

                        fecharDropdownLogin();

                    }

                }

            );

        }

                // ======================================
        // MENU DO MEMBRO (DESKTOP)
        // ======================================

        function atualizarMenuMembro(membro) {

            if (

                !btnLogin ||

                !loginMenu

            ) {

                return;

            }

            const primeiroNome =

                membro.nome.split(

                    " "

                )[0];

            btnLogin.innerHTML = `

                <i class="fa-solid fa-circle-user"></i>

                ${primeiroNome}

                <i class="fa-solid fa-chevron-down"></i>

            `;

            loginMenu.innerHTML = `

                <a href="/perfil">

                    <i class="fa-solid fa-user"></i>

                    <span>

                        Ver Perfil

                    </span>

                </a>

                <a
                    href="#"
                    id="btnLogout">

                    <i class="fa-solid fa-right-from-bracket"></i>

                    <span>

                        Sair

                    </span>

                </a>

            `;

            adicionarEventoLogout();

        }

        function atualizarMenuDeslogado() {

            usuarioLogado = false;

            if (btnLogin && loginMenu) {

                btnLogin.innerHTML = `

                    <i class="fa-solid fa-circle-user"></i>

                    <span>Login</span>

                    <i class="fa-solid fa-chevron-down"></i>

                `;

                loginMenu.innerHTML = `

                    <form
                        action="/api/membros/login"
                        method="POST"
                        novalidate
                        class="login-form member-login-form">

                        <label for="email">E-mail</label>

                        <input
                            type="email"
                            id="email"
                            name="email"
                            autocomplete="email"
                            required>

                        <label for="senha">Senha</label>

                        <input
                            type="password"
                            id="senha"
                            name="senha"
                            autocomplete="current-password"
                            required>

                        <button
                            type="submit"
                            class="btn-login">
                            Entrar
                        </button>

                        <a href="/esqueci-senha">Esqueceu sua senha?</a>
                        <a href="/cadastro">Cadastre-se</a>

                    </form>

                `;

                adicionarEventosLogin();

            }

            if (mobileLogin) {

                mobileLogin.classList.remove("hidden");

            }

            if (mobileUser) {

                mobileUser.classList.add("hidden");

            }

            if (mobilePerfil) {

                mobilePerfil.classList.add("hidden");

            }

            if (mobileLogout) {

                mobileLogout.classList.add("hidden");

            }

        }

        function atualizarMenusLogado(nome) {

            usuarioLogado = true;

            const primeiroNome =
                (nome || "Membro")
                    .trim()
                    .split(" ")[0];

            atualizarMenuMembro({

                nome: primeiroNome

            });

            if (mobileLogin) {

                mobileLogin.classList.add("hidden");

            }

            if (mobileUser) {

                mobileUser.classList.remove("hidden");

            }

            if (mobilePerfil) {

                mobilePerfil.classList.remove("hidden");

            }

            if (mobileLogout) {

                mobileLogout.classList.remove("hidden");

            }

            if (mobileNome) {

                mobileNome.textContent =
                    primeiroNome;

            }

        }

        // ======================================
        // LOGOUT
        // ======================================

        async function sair() {

            await fetch(

                "/logout",

                {

                    method: "GET"

                }

            );

            fecharDropdownLogin();

            if (mobileLoginForm) {

                mobileLoginForm.classList.add("hidden");

            }

            fecharMenu();

            atualizarMenuDeslogado();

        }

        function adicionarEventoLogout() {

            const btnLogout =

                document.getElementById(

                    "btnLogout"

                );

            if (!btnLogout) {

                return;

            }

            btnLogout.addEventListener(

                "click",

                (event) => {

                    event.preventDefault();

                    sair().catch(() => {

                        window.location.href =

                            "/logout";

                    });

                }

            );

        }

                // ======================================
        // VERIFICAR SESSÃO
        // ======================================

        async function enviarLogin(formulario) {

            const dados =
                new FormData(formulario);

            const resposta =
                await fetch(
                    "/api/membros/login",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            email: dados.get("email"),
                            senha: dados.get("senha")
                        })
                    }
                );

            const resultado =
                await resposta.json();

            if (!resposta.ok) {

                throw new Error(
                    resultado.message ||
                    "Erro ao realizar login."
                );

            }

            atualizarMenusLogado(

                resultado.data?.nome ||
                resultado.nome ||
                dados.get("email")

            );

            fecharDropdownLogin();

            if (mobileLoginForm) {

                mobileLoginForm.classList.add("hidden");

            }

            fecharMenu();

        }

        function adicionarEventosLogin() {

            document
                .querySelectorAll(".member-login-form")
                .forEach((formulario) => {

                    if (formulario.dataset.loginReady === "true") {

                        return;

                    }

                    formulario.dataset.loginReady = "true";

                    formulario.addEventListener(
                        "submit",
                        async (event) => {

                            event.preventDefault();

                            const botao =
                                formulario.querySelector(".btn-login");

                            try {

                                if (botao) {

                                    botao.disabled = true;
                                    botao.textContent = "Entrando...";

                                }

                                await enviarLogin(formulario);

                            } catch (erro) {

                                alert(erro.message);

                            } finally {

                                if (botao) {

                                    botao.disabled = false;
                                    botao.textContent = "Entrar";

                                }

                            }

                        }
                    );

                });

        }

        adicionarEventosLogin();

        async function verificarSessao() {

            try {

                const resposta =

                    await fetch(

                        "/api/membros/sessao"

                    );

                const resultado =

                    await resposta.json();

                if (

                    !resultado.logado

                ) {

                    atualizarMenuDeslogado();

                    return;

                }

                atualizarMenusLogado(

                    resultado.nome

                );

            }

            catch (erro) {

                console.error(

                    "[SESSÃO]",

                    erro

                );

            }

        }

                // ======================================
        // LOGIN MOBILE
        // ======================================

        function mostrarFormularioLogin() {

            if (

                !mobileLoginForm

            ) {

                return;

            }

            if (mobileLogin) {

                mobileLogin.classList.add(

                    "hidden"

                );

            }

            if (mobileUser) {

                mobileUser.classList.add(

                    "hidden"

                );

            }

            if (mobilePerfil) {

                mobilePerfil.classList.add(

                    "hidden"

                );

            }

            if (mobileLogout) {

                mobileLogout.classList.add(

                    "hidden"

                );

            }

            if (menu) {

                menu.classList.remove(

                    "active"

                );

            }

            if (btnMenu) {

                btnMenu.classList.remove(

                    "active"

                );

                btnMenu.setAttribute(

                    "aria-expanded",

                    "false"

                );

            }

            if (backdrop) {

                backdrop.classList.add(

                    "active"

                );

            }

            document.body.style.overflow =

                "hidden";

            mobileLoginForm.classList.remove(

                "hidden"

            );

            if (mobileEmail) {

                mobileEmail.focus();

            }

        }

        function voltarMenuPrincipal() {

            if (

                !mobileLoginForm

            ) {

                return;

            }

            mobileLoginForm.classList.add(

                "hidden"

            );

            abrirMenu();

            if (usuarioLogado) {

                if (mobileUser) {

                    mobileUser.classList.remove(

                        "hidden"

                    );

                }

                if (mobilePerfil) {

                    mobilePerfil.classList.remove(

                        "hidden"

                    );

                }

                if (mobileLogout) {

                    mobileLogout.classList.remove(

                        "hidden"

                    );

                }

            }

            else {

                if (mobileLogin) {

                    mobileLogin.classList.remove(

                        "hidden"

                    );

                }

            }

        }

        if (

            btnMobileLogin &&

            mobileLoginForm

        ) {

            btnMobileLogin.addEventListener(

                "click",

                (event) => {

                    event.preventDefault();

                    mostrarFormularioLogin();

                }

            );

        }

        if (

            btnVoltarLogin &&

            mobileLoginForm

        ) {

            btnVoltarLogin.addEventListener(

                "click",

                () => {

                    voltarMenuPrincipal();

                }

            );

        }

        // ======================================
        // LOGOUT MOBILE
        // ======================================

        if (mobileLogoutBtn) {

            mobileLogoutBtn.addEventListener(

                "click",

                (event) => {

                    event.preventDefault();

                    sair().catch(() => {

                        window.location.href =

                            "/logout";

                    });

                }

            );

        }

        // ======================================
        // INICIALIZAÇÃO
        // ======================================

        verificarSessao();

                // ======================================
        // ANIMAÇÃO DAS SEÇÕES
        // ======================================

        const elementosAnimados =

            document.querySelectorAll(

                ".section-title,\
                .hero-content,\
                .hero-image,\
                .sobre-content,\
                .missao-card,\
                .pastor-content,\
                .culto-card,\
                .evento-card,\
                .foto,\
                .contato-content"

            );

        if (

            elementosAnimados.length > 0

        ) {

            const observer =

                new IntersectionObserver(

                    (entries) => {

                        entries.forEach(

                            (entry) => {

                                if (

                                    !entry.isIntersecting

                                ) {

                                    return;

                                }

                                entry.target.classList.add(

                                    "show"

                                );

                                observer.unobserve(

                                    entry.target

                                );

                            }

                        );

                    },

                    {

                        threshold:0.15,

                        rootMargin:

                            "0px 0px -80px 0px"

                    }

                );

            elementosAnimados.forEach(

                (elemento) => {

                    observer.observe(

                        elemento

                    );

                }

            );

        }

                // ======================================
        // GALERIA
        // ======================================

        const fotosGaleria =

            document.querySelectorAll(

                ".foto img"

            );

        fotosGaleria.forEach(

            (foto) => {

                foto.addEventListener(

                    "click",

                    () => {

                        // ======================================
                        // FUTURAMENTE:
                        // abrirLightbox(foto);
                        // ======================================

                    }

                );

            }

        );

    }

);

// ======================================
// FUNÇÕES FUTURAS
// ======================================

/*

function abrirLightbox(imagem){

    // Implementação futura

}

function fecharLightbox(){

    // Implementação futura

}

*/
