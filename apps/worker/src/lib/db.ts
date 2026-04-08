import type { DbUser, DbShowNotification } from '@showtracker/types';

export async function getUserById(db: D1Database, id: number): Promise<DbUser | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
}

export async function getUserBySlug(db: D1Database, slug: string): Promise<DbUser | null> {
  return db.prepare('SELECT * FROM users WHERE trakt_slug = ?').bind(slug).first<DbUser>();
}

export async function createUser(
  db: D1Database,
  data: {
    trakt_slug: string;
    email: string;
    access_token: string;
    refresh_token: string;
    token_expires_at: number;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO users (trakt_slug, email, access_token, refresh_token, token_expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(data.trakt_slug, data.email, data.access_token, data.refresh_token, data.token_expires_at)
    .run();
  return result.meta.last_row_id as number;
}

export async function updateUserTokens(
  db: D1Database,
  userId: number,
  tokens: { access_token: string; refresh_token: string; token_expires_at: number },
): Promise<void> {
  await db
    .prepare(
      'UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?',
    )
    .bind(tokens.access_token, tokens.refresh_token, tokens.token_expires_at, userId)
    .run();
}

export async function getNotificationsByUser(
  db: D1Database,
  userId: number,
): Promise<DbShowNotification[]> {
  const result = await db
    .prepare('SELECT * FROM show_notifications WHERE user_id = ? ORDER BY show_title ASC')
    .bind(userId)
    .all<DbShowNotification>();
  return result.results;
}

export async function getNotification(
  db: D1Database,
  userId: number,
  traktShowId: number,
): Promise<DbShowNotification | null> {
  return db
    .prepare('SELECT * FROM show_notifications WHERE user_id = ? AND trakt_show_id = ?')
    .bind(userId, traktShowId)
    .first<DbShowNotification>();
}

export async function upsertNotification(
  db: D1Database,
  data: {
    user_id: number;
    trakt_show_id: number;
    show_title: string;
    show_slug: string;
    show_poster_url: string | null;
    last_known_season: number;
  },
): Promise<DbShowNotification> {
  await db
    .prepare(
      `INSERT INTO show_notifications
         (user_id, trakt_show_id, show_title, show_slug, show_poster_url, last_known_season)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, trakt_show_id) DO NOTHING`,
    )
    .bind(
      data.user_id,
      data.trakt_show_id,
      data.show_title,
      data.show_slug,
      data.show_poster_url,
      data.last_known_season,
    )
    .run();

  return (await getNotification(db, data.user_id, data.trakt_show_id))!;
}

export async function updateNotificationEnabled(
  db: D1Database,
  userId: number,
  traktShowId: number,
  enabled: boolean,
): Promise<DbShowNotification | null> {
  await db
    .prepare(
      'UPDATE show_notifications SET notifications_enabled = ? WHERE user_id = ? AND trakt_show_id = ?',
    )
    .bind(enabled ? 1 : 0, userId, traktShowId)
    .run();
  return getNotification(db, userId, traktShowId);
}

export async function deleteNotification(
  db: D1Database,
  userId: number,
  traktShowId: number,
): Promise<void> {
  await db
    .prepare('DELETE FROM show_notifications WHERE user_id = ? AND trakt_show_id = ?')
    .bind(userId, traktShowId)
    .run();
}

export async function getEnabledNotificationsForCron(
  db: D1Database,
): Promise<{ user_id: number }[]> {
  const result = await db
    .prepare(
      'SELECT DISTINCT user_id FROM show_notifications WHERE notifications_enabled = 1 OR needs_season_init = 1',
    )
    .all<{ user_id: number }>();
  return result.results;
}

export async function getEnabledShowsForUser(
  db: D1Database,
  userId: number,
): Promise<DbShowNotification[]> {
  const result = await db
    .prepare(
      'SELECT * FROM show_notifications WHERE user_id = ? AND (notifications_enabled = 1 OR needs_season_init = 1)',
    )
    .bind(userId)
    .all<DbShowNotification>();
  return result.results;
}

export async function updateLastKnownSeason(
  db: D1Database,
  id: number,
  lastKnownSeason: number,
): Promise<void> {
  await db
    .prepare(
      'UPDATE show_notifications SET last_known_season = ?, last_checked_at = unixepoch() WHERE id = ?',
    )
    .bind(lastKnownSeason, id)
    .run();
}

export async function touchLastChecked(db: D1Database, id: number): Promise<void> {
  await db
    .prepare('UPDATE show_notifications SET last_checked_at = unixepoch() WHERE id = ?')
    .bind(id)
    .run();
}

export async function bulkInsertUntracked(
  db: D1Database,
  userId: number,
  shows: Array<{ trakt_show_id: number; show_title: string; show_slug: string }>,
): Promise<void> {
  if (shows.length === 0) return;
  const stmts = shows.map((s) =>
    db
      .prepare(
        `INSERT INTO show_notifications
           (user_id, trakt_show_id, show_title, show_slug, last_known_season, needs_season_init)
         VALUES (?, ?, ?, ?, 0, 1)
         ON CONFLICT(user_id, trakt_show_id) DO NOTHING`,
      )
      .bind(userId, s.trakt_show_id, s.show_title, s.show_slug),
  );
  await db.batch(stmts);
}

export async function initializeShowSeason(
  db: D1Database,
  id: number,
  lastKnownSeason: number,
): Promise<void> {
  await db
    .prepare(
      'UPDATE show_notifications SET last_known_season = ?, needs_season_init = 0, last_checked_at = unixepoch() WHERE id = ?',
    )
    .bind(lastKnownSeason, id)
    .run();
}

// ── Pending auth ──────────────────────────────────────────────────────────────

export interface PendingAuthRow {
  id: string;
  trakt_slug: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  expires_at: number;
}

export async function createPendingAuth(
  db: D1Database,
  data: Omit<PendingAuthRow, 'id' | 'expires_at'>,
): Promise<string> {
  const id = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minutes
  await db
    .prepare(
      `INSERT INTO pending_auth (id, trakt_slug, access_token, refresh_token, token_expires_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, data.trakt_slug, data.access_token, data.refresh_token, data.token_expires_at, expiresAt)
    .run();
  return id;
}

export async function consumePendingAuth(
  db: D1Database,
  id: string,
): Promise<PendingAuthRow | null> {
  const row = await db
    .prepare('SELECT * FROM pending_auth WHERE id = ? AND expires_at > unixepoch()')
    .bind(id)
    .first<PendingAuthRow>();

  if (row) {
    await db.prepare('DELETE FROM pending_auth WHERE id = ?').bind(id).run();
  }
  return row ?? null;
}
