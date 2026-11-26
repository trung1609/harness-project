CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
  activated_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  session_generation INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_notes_owner_updated_at
  ON notes (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS task_series (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  series_month DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  series_id UUID,
  title TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  progress TEXT NOT NULL DEFAULT 'TODO' CHECK (progress IN ('TODO', 'IN_PROGRESS', 'DONE')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, id),
  CONSTRAINT fk_tasks_owner_series
    FOREIGN KEY (owner_id, series_id)
    REFERENCES task_series (owner_id, id)
    ON DELETE CASCADE,
  CONSTRAINT chk_tasks_same_day_slot
    CHECK (start_time < end_time AND end_time < TIME '24:00:00'),
  CONSTRAINT uq_tasks_series_scheduled_date
    UNIQUE (series_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_scheduled_date
  ON tasks (owner_id, scheduled_date);

CREATE TABLE IF NOT EXISTS task_notes (
  owner_id UUID NOT NULL,
  task_id UUID NOT NULL,
  note_id UUID NOT NULL,
  PRIMARY KEY (task_id, note_id),
  CONSTRAINT fk_task_notes_task
    FOREIGN KEY (owner_id, task_id)
    REFERENCES tasks (owner_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_task_notes_note
    FOREIGN KEY (owner_id, note_id)
    REFERENCES notes (owner_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_requests (
  id UUID PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  request_text TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS support_evidence (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE REFERENCES support_requests(id) ON DELETE CASCADE,
  cloudinary_asset_id TEXT NOT NULL UNIQUE,
  public_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_upload_intents (
  id UUID PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  public_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_jobs (
  id UUID PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  notification_type TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  support_request_id UUID REFERENCES support_requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
