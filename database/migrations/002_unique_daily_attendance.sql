-- Preserve the first attendance for each member/day and remove duplicates.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY membro_id, data ORDER BY horario, id) AS position
    FROM acessos
)
DELETE FROM acessos
WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX IF NOT EXISTS acessos_membro_data_unique
ON acessos (membro_id, data);
