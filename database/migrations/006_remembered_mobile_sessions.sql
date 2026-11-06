-- Only hashes of high-entropy remember credentials are persisted on the server.
CREATE TABLE IF NOT EXISTS remembered_mobile_sessions (
    id UUID PRIMARY KEY,
    app VARCHAR(10) NOT NULL CHECK (app IN ('leitor', 'membro')),
    admin_id INTEGER REFERENCES administradores(id) ON DELETE CASCADE,
    membro_id INTEGER REFERENCES membros(id) ON DELETE CASCADE,
    auth_version INTEGER NOT NULL CHECK (auth_version > 0),
    token_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CHECK ((app = 'leitor' AND admin_id IS NOT NULL AND membro_id IS NULL)
        OR (app = 'membro' AND membro_id IS NOT NULL AND admin_id IS NULL))
);
CREATE INDEX IF NOT EXISTS remembered_mobile_sessions_expiry_idx
    ON remembered_mobile_sessions(expires_at);
