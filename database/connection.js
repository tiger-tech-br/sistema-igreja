require("dotenv").config({ quiet: true });

const { Pool } = require("pg");

function getDatabasePort() {
    const candidates = [
        ["DB_PORT", process.env.DB_PORT],
        ["PGPORT", process.env.PGPORT],
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
        host: process.env.DB_HOST || process.env.PGHOST,
        port: getDatabasePort(),
        user: process.env.DB_USER || process.env.PGUSER,
        password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
        database: process.env.DB_NAME || process.env.PGDATABASE,
    };

const pool = new Pool(poolConfig);

module.exports = pool;
