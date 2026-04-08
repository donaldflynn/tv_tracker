import type {
  TraktWatchedShow,
  TraktSearchResult,
  TraktShowFull,
  TraktSeason,
  TraktEpisode,
  TraktWatchProgress,
  TraktTokenResponse,
  TraktMe,
} from '@showtracker/types';
import { updateUserTokens } from './db';

const API_BASE = 'https://api.trakt.tv';
const OAUTH_BASE = 'https://api.trakt.tv'; // token exchange on api subdomain avoids WAF on trakt.tv

const SERVER_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'ShowTracker/1.0 (https://github.com/showtracker)',
};

interface TraktClientOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  userId: number;
  db: D1Database;
}

export class TraktClient {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private accessToken: string;
  private refreshToken: string;
  private tokenExpiresAt: number;
  private userId: number;
  private db: D1Database;

  constructor(opts: TraktClientOptions) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.redirectUri = opts.redirectUri;
    this.accessToken = opts.accessToken;
    this.refreshToken = opts.refreshToken;
    this.tokenExpiresAt = opts.tokenExpiresAt;
    this.userId = opts.userId;
    this.db = opts.db;
  }

  private headers(): HeadersInit {
    return {
      ...SERVER_HEADERS,
      'trakt-api-version': '2',
      'trakt-api-key': this.clientId,
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  private async doFetch(path: string): Promise<Response> {
    return fetch(`${API_BASE}${path}`, { headers: this.headers() });
  }

  private async refreshTokens(): Promise<void> {
    const res = await fetch(`${OAUTH_BASE}/oauth/token`, {
      method: 'POST',
      headers: SERVER_HEADERS,
      body: JSON.stringify({
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) throw new Error('Token refresh failed');

    const data = (await res.json()) as TraktTokenResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

    await updateUserTokens(this.db, this.userId, {
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      token_expires_at: this.tokenExpiresAt,
    });
  }

  private async get<T>(path: string): Promise<T> {
    let res = await this.doFetch(path);

    if (res.status === 401) {
      await this.refreshTokens();
      res = await this.doFetch(path);
    }

    if (!res.ok) {
      throw new Error(`Trakt API ${res.status}: ${path}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Public methods ───────────────────────────────────────────────────────

  getMe(): Promise<TraktMe> {
    return this.get<TraktMe>('/users/me');
  }

  getWatchedShows(slug: string): Promise<TraktWatchedShow[]> {
    return this.get<TraktWatchedShow[]>(`/users/${slug}/watched/shows`);
  }

  searchShows(query: string, limit = 10): Promise<TraktSearchResult[]> {
    return this.get<TraktSearchResult[]>(
      `/search/show?query=${encodeURIComponent(query)}&limit=${limit}`,
    );
  }

  getShowDetails(idOrSlug: string | number): Promise<TraktShowFull> {
    return this.get<TraktShowFull>(`/shows/${idOrSlug}?extended=full`);
  }

  getShowSeasons(idOrSlug: string | number): Promise<TraktSeason[]> {
    return this.get<TraktSeason[]>(`/shows/${idOrSlug}/seasons?extended=full`);
  }

  getSeasonEpisodes(idOrSlug: string | number, season: number): Promise<TraktEpisode[]> {
    return this.get<TraktEpisode[]>(`/shows/${idOrSlug}/seasons/${season}?extended=full`);
  }

  getShowWatchedProgress(idOrSlug: string | number): Promise<TraktWatchProgress> {
    return this.get<TraktWatchProgress>(`/shows/${idOrSlug}/progress/watched`);
  }

  async watchEpisode(episodeTraktId: number, watchedAt: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sync/history`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        episodes: [{ watched_at: watchedAt, ids: { trakt: episodeTraktId } }],
      }),
    });
    if (!res.ok) throw new Error(`watchEpisode failed (${res.status})`);
  }

  async unwatchEpisode(episodeTraktId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/sync/history/remove`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        episodes: [{ ids: { trakt: episodeTraktId } }],
      }),
    });
    if (!res.ok) throw new Error(`unwatchEpisode failed (${res.status})`);
  }

  async watchSeason(showTraktId: number, season: number, watchedAt: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sync/history`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        shows: [{ ids: { trakt: showTraktId }, seasons: [{ number: season, watched_at: watchedAt }] }],
      }),
    });
    if (!res.ok) throw new Error(`watchSeason failed (${res.status})`);
  }

  async unwatchSeason(showTraktId: number, season: number): Promise<void> {
    const res = await fetch(`${API_BASE}/sync/history/remove`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        shows: [{ ids: { trakt: showTraktId }, seasons: [{ number: season }] }],
      }),
    });
    if (!res.ok) throw new Error(`unwatchSeason failed (${res.status})`);
  }

  async watchShow(showTraktId: number, watchedAt: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sync/history`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        shows: [{ watched_at: watchedAt, ids: { trakt: showTraktId } }],
      }),
    });
    if (!res.ok) throw new Error(`watchShow failed (${res.status})`);
  }

  async unwatchShow(showTraktId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/sync/history/remove`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        shows: [{ ids: { trakt: showTraktId } }],
      }),
    });
    if (!res.ok) throw new Error(`unwatchShow failed (${res.status})`);
  }

  // Returns the next episode to air, or null if show has ended / is on break
  async getNextEpisode(idOrSlug: string | number): Promise<TraktEpisode | null> {
    let res = await this.doFetch(`/shows/${idOrSlug}/next_episode?extended=full`);
    if (res.status === 401) {
      await this.refreshTokens();
      res = await this.doFetch(`/shows/${idOrSlug}/next_episode?extended=full`);
    }
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) return null;
    return res.json() as Promise<TraktEpisode>;
  }

  // ── Static helpers ───────────────────────────────────────────────────────

  static countRegularSeasons(seasons: TraktSeason[]): number {
    return seasons.filter((s) => s.number > 0).length;
  }

  static async exchangeCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<TraktTokenResponse> {
    const res = await fetch(`${OAUTH_BASE}/oauth/token`, {
      method: 'POST',
      headers: SERVER_HEADERS,
      body: JSON.stringify({
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Code exchange failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<TraktTokenResponse>;
  }

  static async getAnonymousMe(
    accessToken: string,
    clientId: string,
  ): Promise<TraktMe> {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: {
        ...SERVER_HEADERS,
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to fetch user profile (${res.status}): ${body}`);
    }
    return res.json() as Promise<TraktMe>;
  }
}

// ── TMDB poster helper ────────────────────────────────────────────────────────

export async function fetchTmdbPoster(
  tmdbId: number,
  apiKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { poster_path?: string | null };
    return data.poster_path
      ? `https://image.tmdb.org/t/p/w300${data.poster_path}`
      : null;
  } catch {
    return null;
  }
}

// Returns a map of episode_number → still URL for all episodes in a season
export async function fetchSeasonStills(
  tmdbShowId: number,
  season: number,
  apiKey: string,
): Promise<Map<number, string>> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${tmdbShowId}/season/${season}?api_key=${apiKey}`,
    );
    if (!res.ok) return new Map();
    const data = (await res.json()) as {
      episodes?: Array<{ episode_number: number; still_path?: string | null }>;
    };
    const map = new Map<number, string>();
    for (const ep of data.episodes ?? []) {
      if (ep.still_path) {
        map.set(ep.episode_number, `https://image.tmdb.org/t/p/w300${ep.still_path}`);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}
