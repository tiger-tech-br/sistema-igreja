require("dotenv").config({ quiet: true });

const { Pool } = require("pg");

function getDatabaseHost() {
    const candidates = [
        ["PGHOST", process.env.PGHOST],
        ["DB_HOST", process.env.DB_HOST],
    ];

    for (const [name, rawHost] of candidates) {
        if (!rawHost) {
            continue;
        }

        const host = rawHost.trim();

        if (
            host.includes("${{") ||
            host.includes("}}")
        ) {
            console.warn(
                `[DATABASE] Host do banco invalido ignorado: ${name}="${host}".`
            );
            continue;
        }

        const railwayInternalHost = "postgres.railway.internal";

        if (
            host.includes(railwayInternalHost) &&
            host !== railwayInternalHost
        ) {
            console.warn(
                `[DATABASE] Host do banco corrigido: ${name}="${host}" -> "${railwayInternalHost}".`
            );
            return railwayInternalHost;
        }

        return host;
    }

    return undefined;
}

function getDatabasePort() {
    const candidates = [
        ["PGPORT", process.env.PGPORT],
        ["DB_PORT", process.env.DB_PORT],
    ];

    const invalidPorts = [];

    for (const [name, rawPort] of candidates) {
        if (!rawPort) {
            continue;
        }

        const port = Number(rawPort);

        if (
            Number.isInteger(port) &&
            port >= 0 &&
            port < 65536
        ) {
            return port;
        }

        invalidPorts.push(`${name}="${rawPort}"`);
    }

    if (invalidPorts.length > 0) {
        console.warn(
            `[DATABASE] Porta do banco invalida ignorada: ${invalidPorts.join(", ")}. Usando porta padrao 5432.`
        );
    }

    return 5432;
}

const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
    }
    : {
        host: getDatabaseHost(),
        port: getDatabasePort(),
        user: process.env.PGUSER || process.env.DB_USER,
        password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
        database: process.env.PGDATABASE || process.env.DB_NAME,
    };

const pool = new Pool(poolConfig);

module.exports = pool;
