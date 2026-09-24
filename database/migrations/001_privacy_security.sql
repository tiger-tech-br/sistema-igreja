-- Additive migration. Run once before starting the new application.
ALTER TABLE membros ADD COLUMN IF NOT EXISTS celular VARCHAR(20);
ALTER TABLE membros ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE administradores ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE membros ADD COLUMN IF NOT EXISTS consent_version VARCHAR(30);
ALTER TABLE membros ADD COLUMN IF NOT EXISTS consent_text TEXT;
ALTER TABLE membros ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE membros ADD COLUMN IF NOT EXISTS consent_revoked_at TIMESTAMPTZ;
ALTER TABLE membros ADD COLUMN IF NOT EXISTS confirmation_expires_at TIMESTAMPTZ;
ALTER TABLE membros ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE membros ADD COLUMN IF NOT EXISTS token_confirmacao VARCHAR(255);
ALTER TABLE membros ADD COLUMN IF NOT EXISTS token_redefinicao VARCHAR(255);
ALTER TABLE membros ADD COLUMN IF NOT EXISTS token_expira_em TIMESTAMP;
ALTER TABLE membros ALTER COLUMN email_verificado SET DEFAULT FALSE;
UPDATE membros SET email_verificado = FALSE WHERE email_verificado IS NULL;
ALTER TABLE membros ALTER COLUMN email_verificado SET NOT NULL;
CREATE TABLE IF NOT EXISTS privacy_requests (
    id UUID PRIMARY KEY,
    membro_id INTEGER REFERENCES membros(id) ON DELETE SET NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('acesso', 'correcao', 'exclusao', 'revogacao', 'informacao', 'oposicao')),
    mensagem VARCHAR(2000) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluida')),
    resposta VARCHAR(2000),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    concluido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS privacy_requests_member_idx ON privacy_requests(membro_id);
CREATE TABLE IF NOT EXISTS privacy_consents (
    id BIGSERIAL PRIMARY KEY, membro_id INTEGER NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
    version VARCHAR(30) NOT NULL, texto TEXT NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS security_rate_limits (
    key CHAR(64) PRIMARY KEY, hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON security_rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS security_audit (
    id BIGSERIAL PRIMARY KEY, actor_id INTEGER, action VARCHAR(60) NOT NULL,
    target_id INTEGER, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- No historical consent or email verification is invented by this migration.
