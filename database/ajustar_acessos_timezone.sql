-- Ajusta acessos antigos gravados em UTC para o horario de Sao Paulo (UTC-3).
-- Use primeiro o SELECT de conferencia. Rode o UPDATE apenas se o resultado estiver correto.

-- 1) Conferir antes:
SELECT
    id,
    membro_id,
    data AS data_atual,
    horario AS horario_atual,
    ((data + horario) - INTERVAL '3 hours')::DATE AS data_corrigida,
    ((data + horario) - INTERVAL '3 hours')::TIME AS horario_corrigido
FROM acessos
ORDER BY id DESC;

-- 2) Aplicar correcao:
UPDATE acessos
SET
    data = ((data + horario) - INTERVAL '3 hours')::DATE,
    horario = ((data + horario) - INTERVAL '3 hours')::TIME
WHERE id IN (
    SELECT id
    FROM acessos
);
