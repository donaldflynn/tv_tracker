CREATE TABLE IF NOT EXISTS pending_auth (
  id               TEXT    PRIMARY KEY,  -- random UUID
  trakt_slug       TEXT    NOT NULL,
  access_token     TEXT    NOT NULL,
  refresh_token    TEXT    NOT NULL,
  token_expires_at INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL      -- unix timestamp, 15 min TTL
);
