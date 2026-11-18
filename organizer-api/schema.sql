CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  event_json TEXT NOT NULL,
  end_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_active ON submissions (end_date, id);

CREATE TABLE IF NOT EXISTS artisans (
  id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL
);
