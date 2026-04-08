import { Hono } from 'hono';
import { TraktClient, fetchTmdbPoster } from '../lib/trakt';
import { getNotificationsByUser } from '../lib/db';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import type { WatchedShow, ShowSearchResult, ShowDetail } from '@showtracker/types';

const shows = new Hono<AppEnv>();

// Simple in-memory cache (lives for the lifetime of a worker instance)
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

function makeClient(c: Parameters<Parameters<typeof shows.get>[1]>[0]) {
  const user = c.get('user');
  return new TraktClient({
    clientId: c.env.TRAKT_CLIENT_ID,
    clientSecret: c.env.TRAKT_CLIENT_SECRET,
    redirectUri: c.env.TRAKT_REDIRECT_URI,
    accessToken: user.access_token,
    refreshToken: user.refresh_token,
    tokenExpiresAt: user.token_expires_at,
    userId: user.id,
    db: c.env.DB,
  });
}

// ── GET /api/shows/watched ────────────────────────────────────────────────────

shows.get('/watched', requireAuth, async (c) => {
  const user = c.get('user');
  const cacheKey = `watched:${user.id}`;
  const cached = getCache<WatchedShow[]>(cacheKey);
  if (cached) return c.json(cached);

  const trakt = makeClient(c);

  let watchedShows;
  try {
    watchedShows = await trakt.getWatchedShows(user.trakt_slug);
  } catch (e) {
    console.error('Failed to fetch watched shows:', e);
    return c.json({ error: 'Failed to fetch shows from Trakt' }, 502);
  }

  const notifications = await getNotificationsByUser(c.env.DB, user.id);
  const notifMap = new Map(notifications.map((n) => [n.trakt_show_id, n]));

  const result: WatchedShow[] = watchedShows.map((w) => {
    const notif = notifMap.get(w.show.ids.trakt);
    return {
      trakt_id: w.show.ids.trakt,
      title: w.show.title,
      year: w.show.year,
      slug: w.show.ids.slug,
      last_watched_at: w.last_watched_at,
      plays: w.plays,
      in_tracker: !!notif,
      notifications_enabled: notif ? notif.notifications_enabled === 1 : false,
      show_poster_url: notif?.show_poster_url ?? null,
    };
  });

  setCache(cacheKey, result);
  return c.json(result);
});

// ── GET /api/shows/search ─────────────────────────────────────────────────────

shows.get('/search', requireAuth, async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q || q.length < 2) {
    return c.json({ error: 'Query too short' }, 400);
  }

  const user = c.get('user');
  const trakt = makeClient(c);

  let results;
  try {
    results = await trakt.searchShows(q);
  } catch (e) {
    console.error('Search failed:', e);
    return c.json({ error: 'Search failed' }, 502);
  }

  const notifications = await getNotificationsByUser(c.env.DB, user.id);
  const trackedIds = new Set(notifications.map((n) => n.trakt_show_id));

  const cleaned: ShowSearchResult[] = results
    .filter((r) => r.show?.ids?.trakt)
    .map((r) => ({
      trakt_id: r.show.ids.trakt,
      title: r.show.title,
      year: r.show.year,
      slug: r.show.ids.slug,
      overview: r.show.overview,
      network: r.show.network,
      status: r.show.status,
      in_tracker: trackedIds.has(r.show.ids.trakt),
    }));

  return c.json(cleaned);
});

// ── GET /api/shows/:id ────────────────────────────────────────────────────────

shows.get('/:id', requireAuth, async (c) => {
  const idParam = c.req.param('id');
  const user = c.get('user');
  const trakt = makeClient(c);

  let details, seasons;
  try {
    [details, seasons] = await Promise.all([
      trakt.getShowDetails(idParam),
      trakt.getShowSeasons(idParam),
    ]);
  } catch (e) {
    console.error('Failed to fetch show:', e);
    return c.json({ error: 'Failed to fetch show details' }, 502);
  }

  const notifications = await getNotificationsByUser(c.env.DB, user.id);
  const notif = notifications.find((n) => n.trakt_show_id === details.ids.trakt);
  const seasonCount = TraktClient.countRegularSeasons(seasons);

  let posterUrl: string | null = notif?.show_poster_url ?? null;
  if (!posterUrl && details.ids.tmdb && c.env.TMDB_API_KEY) {
    posterUrl = await fetchTmdbPoster(details.ids.tmdb, c.env.TMDB_API_KEY);
  }

  const result: ShowDetail = {
    trakt_id: details.ids.trakt,
    title: details.title,
    year: details.year,
    slug: details.ids.slug,
    overview: details.overview,
    status: details.status,
    network: details.network,
    runtime: details.runtime,
    genres: details.genres,
    rating: details.rating,
    season_count: seasonCount,
    seasons: seasons.filter((s) => s.number > 0),
    in_tracker: !!notif,
    notifications_enabled: notif ? notif.notifications_enabled === 1 : false,
    show_poster_url: posterUrl,
  };

  return c.json(result);
});

export { shows as showRoutes };
