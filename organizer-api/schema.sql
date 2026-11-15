CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  event_json TEXT NOT NULL,
  end_date TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS submissions_active ON submissions (cancelled, end_date, id);
