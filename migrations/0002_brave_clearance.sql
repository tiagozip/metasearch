CREATE TABLE IF NOT EXISTS brave_clearance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  value TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_brave_clearance_live ON brave_clearance (kind, expires_at);
