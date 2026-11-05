-- One bounded, private receipt per member. There is no additional scan history.
-- The counter is updated in the same transaction that confirms attendance.
CREATE TABLE IF NOT EXISTS member_scan_state (
    membro_id INTEGER PRIMARY KEY REFERENCES membros(id) ON DELETE CASCADE,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    acesso_id INTEGER REFERENCES acessos(id) ON DELETE SET NULL,
    already_recorded BOOLEAN NOT NULL DEFAULT FALSE,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
