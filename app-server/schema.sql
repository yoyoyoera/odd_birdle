-- Odd Birdle app server (DAILY and accounts). See docs/APP-API.md.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  delete_code_hash TEXT,
  alias TEXT NOT NULL,
  nickname TEXT,
  nickname_locked INTEGER NOT NULL DEFAULT 0,
  nickname_changed_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  is_account INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS users_delete_code ON users(delete_code_hash) WHERE delete_code_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_last_seen ON users(is_account, last_seen);

CREATE TABLE IF NOT EXISTS devices (
  user_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, secret_hash)
);

CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  sub TEXT NOT NULL,
  user_id TEXT NOT NULL,
  refresh_token_enc TEXT,
  PRIMARY KEY (provider, sub)
);
CREATE INDEX IF NOT EXISTS identities_user ON identities(user_id);

CREATE TABLE IF NOT EXISTS attempts (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  used INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  result TEXT
);
CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id);

CREATE TABLE IF NOT EXISTS clears (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  rank INTEGER NOT NULL,
  seconds REAL NOT NULL,
  mine INTEGER,
  theirs INTEGER,
  attempt INTEGER,
  PRIMARY KEY (user_id, date),
  UNIQUE (date, rank)
);

CREATE TABLE IF NOT EXISTS day_counters (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  reporter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (reporter_id, target_id)
);
CREATE INDEX IF NOT EXISTS reports_target ON reports(target_id);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS throttle (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);

-- Errors the app reports (docs/APP-API.md): one row per kind of error, with a count. No user id, no address, no device id.
CREATE TABLE IF NOT EXISTS errors (
  signature TEXT NOT NULL,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  message TEXT NOT NULL,
  place TEXT NOT NULL,
  mode TEXT NOT NULL,
  count INTEGER NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (signature, platform, version)
);
