-- Ajustes idempotentes para o projeto igreja-v2.
-- Pode rodar no pgAdmin sem apagar dados existentes.

ALTER TABLE membros
ADD COLUMN IF NOT EXISTS senha VARCHAR(255);

ALTER TABLE membros
ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN DEFAULT TRUE;

ALTER TABLE membros
ADD COLUMN IF NOT EXISTS token_confirmacao VARCHAR(255);

ALTER TABLE membros
ADD COLUMN IF NOT EXISTS token_redefinicao VARCHAR(255);

ALTER TABLE membros
ADD COLUMN IF NOT EXISTS token_expira_em TIMESTAMP;

ALTER TABLE membros
ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMP;

ALTER TABLE membros
ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE membros
ADD COLUMN IF NOT EXISTS celular VARCHAR(20);

CREATE TABLE IF NOT EXISTS acessos (

    id SERIAL PRIMARY KEY,

    membro_id INTEGER NOT NULL REFERENCES membros(id) ON DELETE CASCADE,

    data DATE NOT NULL DEFAULT CURRENT_DATE,

    horario TIME NOT NULL DEFAULT CURRENT_TIME,

    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'membros'
        AND column_name = 'created_at'
    ) THEN
        EXECUTE '
            UPDATE membros
            SET criado_em = created_at
            WHERE criado_em IS NULL
            AND created_at IS NOT NULL
        ';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS membros_email_unique
ON membros (email)
WHERE email IS NOT NULL
AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS membros_matricula_unique
ON membros (matricula)
WHERE matricula IS NOT NULL
AND matricula <> '';

SELECT
    COUNT(*) AS total_membros,
    COUNT(*) FILTER (WHERE senha IS NULL OR senha = '') AS membros_sem_senha,
    COUNT(*) FILTER (WHERE email IS NULL OR email = '') AS membros_sem_email,
    COUNT(*) FILTER (WHERE matricula IS NULL OR matricula = '') AS membros_sem_matricula
FROM membros;
