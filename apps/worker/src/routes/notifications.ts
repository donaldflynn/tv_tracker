import { Hono } from 'hono';
import {
  getNotificationsByUser,
  upsertNotification,
  updateNotificationEnabled,
  deleteNotification,
  getNotification,
  getUserById,
} from '../lib/db';
import { TraktClient, fetchTmdbPoster } from '../lib/trakt';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import type { NotificationRow } from '@showtracker/types';
import { sendEpisodeDigest, type EpisodeTrigger, type UpcomingEntry } from '../lib/email';

const notifications = new Hono<AppEnv>();

function toRow(n: import('@showtracker/types').DbShowNotification): NotificationRow {
  return {
    id: n.id,
    trakt_show_id: n.trakt_show_id,
    show_title: n.show_title,
    show_slug: n.show_slug,
    show_poster_url: n.show_poster_url,
    notifications_enabled: n.notifications_enabled === 1,
    last_known_season: n.last_known_season,
    last_checked_at: n.last_checked_at,
    created_at: n.created_at,
  };
}

// ── POST /api/notifications/test-email ───────────────────────────────────────

notifications.post('/test-email', requireAuth, async (c) => {
  const userId = c.get('userId');
  const user = await getUserById(c.env.DB, userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const now = new Date();
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);
  const inTwoWeeks = new Date(now);
  inTwoWeeks.setDate(now.getDate() + 14);

  const sampleTriggers: EpisodeTrigger[] = [
    {
      showTitle: 'The Bear',
      showSlug: 'the-bear',
      reason: 'season_premiere',
      episode: {
        season: 4,
        number: 1,
        title: 'Premiere',
        overview: 'Carmy and the crew face new challenges as the restaurant enters its next chapter.',
        first_aired: now.toISOString(),
      },
    },
    {
      showTitle: 'Severance',
      showSlug: 'severance',
      reason: 'after_break',
      episode: {
        season: 2,
        number: 5,
        title: 'Chikhai Bardo',
        overview: 'Mark navigates the growing mysteries of Lumon Industries.',
        first_aired: now.toISOString(),
      },
      daysSince: 127,
    },
  ];

  const sampleUpcoming: UpcomingEntry[] = [
    {
      showTitle: 'Succession',
      showSlug: 'succession',
      episode: {
        season: 5,
        number: 1,
        title: 'The Rehearsal',
        first_aired: nextWeek.toISOString(),
      },
    },
    {
      showTitle: 'The White Lotus',
      showSlug: 'the-white-lotus',
      episode: {
        season: 3,
        number: 4,
        title: 'New Arrivals',
        first_aired: inTwoWeeks.toISOString(),
      },
    },
  ];

  try {
    await sendEpisodeDigest({
      resendApiKey: c.env.RESEND_API_KEY,
      from: c.env.EMAIL_FROM,
      to: user.email,
      triggers: sampleTriggers,
      upcoming: sampleUpcoming,
      isTest: true,
    });
    return c.json({ ok: true, sent_to: user.email });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

// ── GET /api/notifications ────────────────────────────────────────────────────

notifications.get('/', requireAuth, async (c) => {
  const userId = c.get('userId');
  const rows = await getNotificationsByUser(c.env.DB, userId);
  return c.json(rows.map(toRow));
});

// ── POST /api/notifications ───────────────────────────────────────────────────

notifications.post('/', requireAuth, async (c) => {
  let body: {
    trakt_show_id?: number;
    show_title?: string;
    show_slug?: string;
    show_poster_url?: string | null;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { trakt_show_id, show_title, show_slug } = body;
  if (!trakt_show_id || !show_title || !show_slug) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const user = c.get('user');
  const userId = c.get('userId');

  // Try to get poster URL if not provided
  let posterUrl = body.show_poster_url ?? null;
  if (!posterUrl && c.env.TMDB_API_KEY) {
    try {
      // We need TMDB ID — fetch show details first
      const trakt = new TraktClient({
        clientId: c.env.TRAKT_CLIENT_ID,
        clientSecret: c.env.TRAKT_CLIENT_SECRET,
        redirectUri: c.env.TRAKT_REDIRECT_URI,
        accessToken: user.access_token,
        refreshToken: user.refresh_token,
        tokenExpiresAt: user.token_expires_at,
        userId,
        db: c.env.DB,
      });
      const details = await trakt.getShowDetails(trakt_show_id);
      if (details.ids.tmdb) {
        posterUrl = await fetchTmdbPoster(details.ids.tmdb, c.env.TMDB_API_KEY);
      }
    } catch {
      // Poster is optional — continue without it
    }
  }

  // Get current season count so we don't immediately alert
  let lastKnownSeason = 0;
  try {
    const trakt = new TraktClient({
      clientId: c.env.TRAKT_CLIENT_ID,
      clientSecret: c.env.TRAKT_CLIENT_SECRET,
      redirectUri: c.env.TRAKT_REDIRECT_URI,
      accessToken: user.access_token,
      refreshToken: user.refresh_token,
      tokenExpiresAt: user.token_expires_at,
      userId,
      db: c.env.DB,
    });
    const seasons = await trakt.getShowSeasons(trakt_show_id);
    lastKnownSeason = TraktClient.countRegularSeasons(seasons);
  } catch {
    // Proceed with 0 if we can't fetch seasons
  }

  const row = await upsertNotification(c.env.DB, {
    user_id: userId,
    trakt_show_id,
    show_title,
    show_slug,
    show_poster_url: posterUrl,
    last_known_season: lastKnownSeason,
  });

  return c.json(toRow(row), 201);
});

// ── PATCH /api/notifications/:trakt_show_id ───────────────────────────────────

notifications.patch('/:trakt_show_id', requireAuth, async (c) => {
  const traktShowId = Number(c.req.param('trakt_show_id'));
  if (isNaN(traktShowId)) return c.json({ error: 'Invalid show ID' }, 400);

  let body: { notifications_enabled?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (typeof body.notifications_enabled !== 'boolean') {
    return c.json({ error: 'notifications_enabled must be a boolean' }, 400);
  }

  const userId = c.get('userId');
  const row = await updateNotificationEnabled(
    c.env.DB,
    userId,
    traktShowId,
    body.notifications_enabled,
  );

  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(toRow(row));
});

// ── DELETE /api/notifications/:trakt_show_id ──────────────────────────────────

notifications.delete('/:trakt_show_id', requireAuth, async (c) => {
  const traktShowId = Number(c.req.param('trakt_show_id'));
  if (isNaN(traktShowId)) return c.json({ error: 'Invalid show ID' }, 400);

  const userId = c.get('userId');
  const existing = await getNotification(c.env.DB, userId, traktShowId);
  if (!existing) return c.json({ error: 'Not found' }, 404);

  await deleteNotification(c.env.DB, userId, traktShowId);
  return new Response(null, { status: 204 });
});

export { notifications as notificationRoutes };
