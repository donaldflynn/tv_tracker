import { Hono } from 'hono';
import { TraktClient, fetchTmdbPoster, fetchSeasonStills } from '../lib/trakt';
import { getNotificationsByUser, bulkInsertUntracked } from '../lib/db';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import type { WatchedShow, ShowSearchResult, ShowDetail, EpisodeDetail, ShowEpisodeEntry, ShowSchedule } from '@showtracker/types';

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

  let notifications = await getNotificationsByUser(c.env.DB, user.id);
  const notifMap = new Map(notifications.map((n) => [n.trakt_show_id, n]));

  // Auto-sync: insert any watched shows not yet in the tracker
  const untracked = watchedShows.filter((w) => !notifMap.has(w.show.ids.trakt));
  if (untracked.length > 0) {
    await bulkInsertUntracked(
      c.env.DB,
      user.id,
      untracked.map((w) => ({
        trakt_show_id: w.show.ids.trakt,
        show_title: w.show.title,
        show_slug: w.show.ids.slug,
      })),
    );
    notifications = await getNotificationsByUser(c.env.DB, user.id);
    notifications.forEach((n) => notifMap.set(n.trakt_show_id, n));
  }

  // Fetch missing poster URLs from TMDB (TMDB ID comes free with the Trakt response)
  if (c.env.TMDB_API_KEY) {
    const needsPoster = watchedShows
      .filter((w) => w.show.ids.tmdb && !notifMap.get(w.show.ids.trakt)?.show_poster_url)
      .slice(0, 40); // cap at 40 to stay within CF Workers subrequest limits on free plan

    if (needsPoster.length > 0) {
      const fetched = await Promise.allSettled(
        needsPoster.map(async (w) => ({
          trakt_id: w.show.ids.trakt,
          poster_url: await fetchTmdbPoster(w.show.ids.tmdb!, c.env.TMDB_API_KEY),
        })),
      );

      const updates: Array<{ trakt_id: number; poster_url: string }> = [];
      for (const r of fetched) {
        if (r.status === 'fulfilled' && r.value.poster_url) {
          const notif = notifMap.get(r.value.trakt_id);
          if (notif) {
            notif.show_poster_url = r.value.poster_url; // update in-memory for this response
            updates.push(r.value as { trakt_id: number; poster_url: string });
          }
        }
      }

      if (updates.length > 0) {
        await c.env.DB.batch(
          updates.map(({ trakt_id, poster_url }) =>
            c.env.DB.prepare(
              'UPDATE show_notifications SET show_poster_url = ? WHERE user_id = ? AND trakt_show_id = ?',
            ).bind(poster_url, user.id, trakt_id),
          ),
        );
      }
    }
  }

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

// ── GET /api/shows/upcoming ───────────────────────────────────────────────────

shows.get('/upcoming', requireAuth, async (c) => {
  const userId = c.get('userId');
  const cacheKey = `schedule:${userId}`;
  const cached = getCache<ShowSchedule>(cacheKey);
  if (cached) return c.json(cached);

  const trakt = makeClient(c);
  const notifications = await getNotificationsByUser(c.env.DB, userId);

  if (notifications.length === 0) return c.json({ upcoming: [], recent: [] });

  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

  function toEntry(
    n: (typeof notifications)[number],
    ep: import('@showtracker/types').TraktEpisode,
  ): ShowEpisodeEntry {
    return {
      trakt_id: n.trakt_show_id,
      title: n.show_title,
      slug: n.show_slug,
      show_poster_url: n.show_poster_url,
      notifications_enabled: n.notifications_enabled === 1,
      episode: {
        season: ep.season,
        number: ep.number,
        title: ep.title,
        first_aired: ep.first_aired!,
        overview: ep.overview,
      },
    };
  }

  // Fetch next + last episode for every tracked show in parallel
  const settled = await Promise.allSettled(
    notifications.map(async (n) => {
      const [next, last] = await Promise.all([
        trakt.getNextEpisode(n.trakt_show_id),
        trakt.getLastEpisode(n.trakt_show_id),
      ]);
      return { n, next, last };
    }),
  );

  const upcoming: ShowEpisodeEntry[] = [];
  const recent: ShowEpisodeEntry[] = [];

  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    const { n, next, last } = r.value;

    if (next?.first_aired && new Date(next.first_aired) > now) {
      upcoming.push(toEntry(n, next));
    }
    if (last?.first_aired) {
      const aired = new Date(last.first_aired);
      if (aired <= now && aired >= cutoff) {
        recent.push(toEntry(n, last));
      }
    }
  }

  upcoming.sort((a, b) => new Date(a.episode.first_aired).getTime() - new Date(b.episode.first_aired).getTime());
  recent.sort((a, b) => new Date(b.episode.first_aired).getTime() - new Date(a.episode.first_aired).getTime());

  const result: ShowSchedule = { upcoming, recent };
  setCache(cacheKey, result);
  return c.json(result);
});

// ── GET /api/shows/:id ────────────────────────────────────────────────────────

shows.get('/:id', requireAuth, async (c) => {
  const idParam = c.req.param('id');
  const user = c.get('user');
  const trakt = makeClient(c);

  let details, seasons, progress;
  try {
    [details, seasons, progress] = await Promise.all([
      trakt.getShowDetails(idParam),
      trakt.getShowSeasons(idParam),
      trakt.getShowWatchedProgress(idParam).catch(() => null),
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

  const watchedBySeason = new Map(
    (progress?.seasons ?? []).map((s) => [s.number, s.completed]),
  );

  const result: ShowDetail = {
    trakt_id: details.ids.trakt,
    tmdb_id: details.ids.tmdb,
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
    seasons: seasons
      .filter((s) => s.number > 0)
      .map((s) => ({ ...s, watched_count: watchedBySeason.get(s.number) ?? 0 })),
    in_tracker: !!notif,
    notifications_enabled: notif ? notif.notifications_enabled === 1 : false,
    show_poster_url: posterUrl,
  };

  return c.json(result);
});

// ── GET /api/shows/:id/seasons/:season/episodes ───────────────────────────────

shows.get('/:id/seasons/:season/episodes', requireAuth, async (c) => {
  const idParam = c.req.param('id');
  const seasonNum = Number(c.req.param('season'));
  if (isNaN(seasonNum)) return c.json({ error: 'Invalid season number' }, 400);

  const tmdbId = c.req.query('tmdb_id') ? Number(c.req.query('tmdb_id')) : null;
  const trakt = makeClient(c);

  let episodes, progress;
  try {
    [episodes, progress] = await Promise.all([
      trakt.getSeasonEpisodes(idParam, seasonNum),
      trakt.getShowWatchedProgress(idParam).catch(() => null),
    ]);
  } catch (e) {
    console.error('Failed to fetch episodes:', e);
    return c.json({ error: 'Failed to fetch episodes' }, 502);
  }

  // Fetch TMDB episode stills for the season (one call gives all stills)
  let stills = new Map<number, string>();
  if (tmdbId && c.env.TMDB_API_KEY) {
    stills = await fetchSeasonStills(tmdbId, seasonNum, c.env.TMDB_API_KEY);
  }

  const progressSeason = (progress?.seasons ?? []).find((s) => s.number === seasonNum);
  const progressByEp = new Map(
    (progressSeason?.episodes ?? []).map((e) => [e.number, e]),
  );

  const result: EpisodeDetail[] = episodes.map((ep) => {
    const prog = progressByEp.get(ep.number);
    return {
      season: ep.season,
      number: ep.number,
      title: ep.title,
      overview: ep.overview,
      first_aired: ep.first_aired,
      runtime: ep.runtime,
      trakt_id: ep.ids.trakt,
      still_url: stills.get(ep.number) ?? null,
      watched: prog?.completed ?? false,
      watched_at: prog?.last_watched_at ?? null,
    };
  });

  return c.json(result);
});

// ── POST /api/shows/:id/watch ─────────────────────────────────────────────────

shows.post('/:id/watch', requireAuth, async (c) => {
  let body: {
    trakt_show_id?: number;
    season?: number;
    episode?: { number: number; trakt_id: number; first_aired?: string | null };
    watched?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { trakt_show_id, season, episode, watched } = body;
  if (!trakt_show_id || typeof watched !== 'boolean') {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const userId = c.get('userId');
  const trakt = makeClient(c);

  try {
    if (episode && typeof season === 'number') {
      // Single episode — use air date as watched_at if it's already in the past
      const airDate = episode.first_aired ? new Date(episode.first_aired) : null;
      const watchedAt =
        airDate && airDate < new Date() ? episode.first_aired! : new Date().toISOString();
      if (watched) {
        await trakt.watchEpisode(episode.trakt_id, watchedAt);
      } else {
        await trakt.unwatchEpisode(episode.trakt_id);
      }
    } else if (typeof season === 'number') {
      // Whole season
      if (watched) {
        await trakt.watchSeason(trakt_show_id, season, new Date().toISOString());
      } else {
        await trakt.unwatchSeason(trakt_show_id, season);
      }
    } else {
      // Whole show
      if (watched) {
        await trakt.watchShow(trakt_show_id, new Date().toISOString());
      } else {
        await trakt.unwatchShow(trakt_show_id);
      }
    }
  } catch (e) {
    console.error('Watch action failed:', e);
    return c.json({ error: 'Failed to update watch status on Trakt' }, 502);
  }

  // Bust the watched-shows cache so the dashboard reflects the change
  cache.delete(`watched:${userId}`);

  return c.json({ ok: true });
});

export { shows as showRoutes };
