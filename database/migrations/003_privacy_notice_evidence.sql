-- Registra separadamente a ciência do aviso e o consentimento de dado sensível.
-- Colunas permanecem nulas para cadastros anteriores; nenhuma aceitação retroativa é presumida.
ALTER TABLE membros ADD COLUMN IF NOT EXISTS privacy_notice_version VARCHAR(30);
ALTER TABLE membros ADD COLUMN IF NOT EXISTS privacy_notice_text TEXT;
ALTER TABLE membros ADD COLUMN IF NOT EXISTS privacy_notice_at TIMESTAMPTZ;
ALTER TABLE privacy_consents ADD COLUMN IF NOT EXISTS notice_text TEXT;
