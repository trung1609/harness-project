ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notes_owner_deleted_at
  ON notes (owner_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notes_deleted_at_purge
  ON notes (deleted_at)
  WHERE deleted_at IS NOT NULL;
