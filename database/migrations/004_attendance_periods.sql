-- Classify existing and future records using their Sao Paulo local time.
-- A generated column prevents clients from choosing a different period.
ALTER TABLE acessos ADD COLUMN periodo TEXT GENERATED ALWAYS AS (
    CASE
        WHEN horario < TIME '12:00:00' THEN 'manha'
        WHEN horario < TIME '18:00:00' THEN 'tarde'
        ELSE 'noite'
    END
) STORED;

CREATE UNIQUE INDEX acessos_membro_data_periodo_unique
ON acessos (membro_id, data, periodo);

-- Replace the previous daily limit only after the new index is ready.
DROP INDEX acessos_membro_data_unique;
