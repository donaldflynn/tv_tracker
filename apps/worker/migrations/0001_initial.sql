CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  trakt_slug       TEXT    NOT NULL UNIQUE,
  email            TEXT    NOT NULL,
  access_token     TEXT    NOT NULL,
  refresh_token    TEXT    NOT NULL,
  token_expires_at INTEGER NOT NULL,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS show_notifications (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trakt_show_id         INTEGER NOT NULL,
  show_title            TEXT    NOT NULL,
  show_slug             TEXT    NOT NULL,
  show_poster_url       TEXT,
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  last_known_season     INTEGER NOT NULL DEFAULT 0,
  last_checked_at       INTEGER,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, trakt_show_id)
);

CREATE INDEX IF NOT EXISTS idx_show_notifications_user
  ON show_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_show_notifications_enabled
  ON show_notifications(notifications_enabled);
