-- Remove o campo de observacoes da tabela de membros.
-- Rode no pgAdmin somente depois que o site publicado estiver com o codigo atualizado.

ALTER TABLE membros
DROP COLUMN IF EXISTS observacoes;
