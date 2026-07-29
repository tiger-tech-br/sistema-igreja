// =====================================
// VARIÁVEIS DE AMBIENTE
// =====================================

require("dotenv").config({ quiet: true });

// =====================================
// IMPORTAÇÕES
// =====================================

const express =
    require("express");



const path =
    require("path");

const session =
    require("express-session");

const helmet =
    require("helmet");

const compression =
    require("compression");

const pool =
    require("./database/connection");

const PgSession =
    require("connect-pg-simple")(session);

const membroRoutes =
    require("./routes/membroRoutes");

const adminRoutes =
    require("./routes/adminRoutes");

const credencialRoutes =
    require("./routes/credencialRoutes");

const verificarAutenticacao =
    require("./middlewares/auth");

const verificarMembro =
    require("./middlewares/authMembro");

const errorMiddleware =
    require("./middlewares/errorMiddleware");

// =====================================
// CONFIGURAÇÕES
// =====================================

function verificarPerfil(

    req,

    res,

    next

) {

    if (

        !req.session.membro &&

        !req.session.admin

    ) {

        return res.redirect("/");

    }

    next();

}

const app = express();

app.set("trust proxy", 1);

const isProduction =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT);

const PORT =
    process.env.PORT || 3000;

app.disable("x-powered-by");

// =====================================
// HELMET
// =====================================

app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "upgrade-insecure-requests": null,

                scriptSrc: [
                    "'self'",
                    "https://unpkg.com",
                    "https://cdnjs.cloudflare.com"
                ],

                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com",
                    "https://cdnjs.cloudflare.com"
                ],

                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com",
                    "https://cdnjs.cloudflare.com"
                ],

                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:"
                ],

                connectSrc: [
                    "'self'",
                    "https://viacep.com.br"
                ]
            }
        },

        crossOriginEmbedderPolicy: false,
        hsts: isProduction
    })
);




// =====================================
// COMPRESSÃO
// =====================================

app.use(

    compression()

);

// =====================================
// BODY PARSER
// =====================================

app.use(

    express.json({
        limit: "100kb"
    })

);

app.use(

    express.urlencoded({

        extended: true,

        limit: "100kb"

    })

);

// =====================================
// SESSÃO
// =====================================

app.use(

    session({

        name: "igreja.sid",

        store: new PgSession({
            pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),

        secret:

            process.env.SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

        cookie: {

            httpOnly: true,

            secure: isProduction,

            sameSite: "lax",

            maxAge:

                1000 * 60 * 60 * 2

        }

    })

);

// =====================================
// LOG DAS REQUISIÇÕES
// =====================================

app.use(

    (req, res, next) => {

        console.log(

            req.method,

            req.url

        );

        next();

    }

);


// =====================================
// ARQUIVOS ESTÁTICOS
// =====================================

app.use(

    (req, res, next) => {

        const paginasAdminProtegidas = new Set([
            "/admin/dashboard.html",
            "/admin/membros.html",
            "/admin/scanner.html"
        ]);

        if (
            paginasAdminProtegidas.has(req.path) &&
            !req.session.admin
        ) {

            return res.redirect("/login-admin");

        }

        next();

    }

);

app.use(

    express.static(__dirname)

);

app.use(

    "/qrcodes",

    express.static(

        path.join(

            __dirname,

            "qrcodes"

        )

    )

);

// =====================================
// ROTAS DA API
// =====================================

app.use(

    "/api/membros",

    membroRoutes

);

app.use(

    "/api",

    adminRoutes

);

app.use(

    "/credencial",

    verificarAutenticacao,

    credencialRoutes

);

// =====================================
// ROTAS DAS PÁGINAS
// =====================================

// Home

app.get(

    "/",

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "index.html"

            )

        );

    }

);


// Logout

app.get(

    "/logout",

    (req, res) => {

        delete req.session.membro;

        if (

            !req.session.admin

        ) {

            req.session.destroy(() => {

                res.clearCookie(

                    "igreja.sid"

                );

                res.redirect("/");

            });

            return;

        }

        res.redirect("/");

    }

);


app.get(

    "/logout-admin",

    (req, res) => {

        delete req.session.admin;

        if (!req.session.membro) {

            req.session.destroy(() => {

                res.clearCookie("igreja.sid");

                res.redirect("/login-admin");

            });

            return;

        }

        res.redirect("/login-admin");

    }

);

// =====================================
// LOGIN ADMIN
// =====================================

app.get(

    "/login-admin",

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "admin",

                "index.html"

            )

        );

    }

);

// Dashboard

app.get(

    "/dashboard",

    verificarAutenticacao,

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "admin",

                "dashboard.html"

            )

        );

    }

);

// Cadastro

app.get(

    "/cadastro",

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "cadastro.html"

            )

        );

    }

);

// Esqueci minha senha

app.get(

    "/esqueci-senha",

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "esqueci-senha.html"

            )

        );

    }

);

// Redefinir senha

app.get(

    "/redefinir-senha",

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "redefinir.senha.html"

            )

        );

    }

);

// Membros

app.get(

    "/admin/membros",

    verificarAutenticacao,

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "admin",

                "membros.html"

            )

        );

    }

);

app.get(

    "/membros",

    verificarMembro,

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "membros.html"

            )

        );

    }

);

// Perfil

app.get(

    "/perfil",

    verificarMembro,

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "perfil.html"

            )

        );

    }

);

app.get(

    "/admin/perfil",

    verificarAutenticacao,

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "admin",

                "perfil.html"

            )

        );

    }

);

// Scanner

app.get(

    "/scanner",

    verificarAutenticacao,

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "admin",

                "scanner.html"

            )

        );

    }

);

// Validação pública

app.get(

    "/validar",

    (req, res) => {

        res.sendFile(

            path.join(

                __dirname,

                "admin",

                "validar.html"

            )

        );

    }

);

// =====================================
// 404
// =====================================

app.use(

    (req, res) => {

        return res.status(404).json({

            success: false,

            message: "Rota não encontrada."

        });

    }

);

// =====================================
// MIDDLEWARE DE ERRO
// =====================================

app.use(

    errorMiddleware

);

// =====================================
// INICIAR SERVIDOR
// =====================================

async function iniciarServidor() {

    try {

        await pool.connect();

        console.log(

            "🗄️ PostgreSQL conectado com sucesso!"

        );

        app.listen(

            PORT,

            "0.0.0.0",

            () => {

                console.log(

                    "======================================"

                );

                console.log(

                    "🚀 Servidor iniciado com sucesso!"

                );

                console.log(

                    `🌐 http://localhost:${PORT}`

                );

                console.log(

                    "======================================"

                );

            }

        );

    } catch (erro) {

        console.error(

            "[DATABASE]",

            erro

        );

    }

}

iniciarServidor();
