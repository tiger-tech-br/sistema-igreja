-- Account activation is distinct from verification of email ownership.
-- Existing accounts keep their current email-confirmation flow and access.
ALTER TABLE membros ADD COLUMN IF NOT EXISTS cadastro_liberado BOOLEAN NOT NULL DEFAULT FALSE;
