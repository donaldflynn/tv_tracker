// ── Database row types ────────────────────────────────────────────────────────

export interface DbUser {
  id: number;
  trakt_slug: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  created_at: number;
}

export interface DbShowNotification {
  id: number;
  user_id: number;
  trakt_show_id: number;
  show_title: string;
  show_slug: string;
  show_poster_url: string | null;
  notifications_enabled: number; // 0 | 1
  last_known_season: number;
  needs_season_init: number; // 0 | 1 — if 1, cron sets season count without notifying
  last_checked_at: number | null;
  created_at: number;
}

// ── Trakt API types ───────────────────────────────────────────────────────────

export interface TraktIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
}

export interface TraktShow {
  title: string;
  year: number;
  ids: TraktIds;
}

export interface TraktShowFull extends TraktShow {
  overview?: string;
  status?: string;
  network?: string;
  runtime?: number;
  genres?: string[];
  rating?: number;
  votes?: number;
  trailer?: string;
}

export interface TraktWatchedShow {
  plays: number;
  last_watched_at: string;
  show: TraktShow;
}

export interface TraktSeason {
  number: number;
  episode_count?: number;
  title?: string;
  overview?: string;
  first_aired?: string | null;
  aired_episodes?: number;
}

export interface TraktSearchResult {
  type: 'show';
  score: number;
  show: TraktShowFull;
}

export interface TraktTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface TraktMe {
  username: string;
  name?: string;
  private?: boolean;
}

// ── API response shapes (used by frontend) ───────────────────────────────────

export interface WatchedShow {
  trakt_id: number;
  title: string;
  year: number;
  slug: string;
  last_watched_at: string;
  plays: number;
  in_tracker: boolean;
  notifications_enabled: boolean;
  show_poster_url: string | null;
}

export interface ShowSearchResult {
  trakt_id: number;
  title: string;
  year: number;
  slug: string;
  overview?: string;
  network?: string;
  status?: string;
  in_tracker: boolean;
}

export interface ShowDetail {
  trakt_id: number;
  title: string;
  year: number;
  slug: string;
  overview?: string;
  status?: string;
  network?: string;
  runtime?: number;
  genres?: string[];
  rating?: number;
  season_count: number;
  seasons: TraktSeason[];
  in_tracker: boolean;
  notifications_enabled: boolean;
  show_poster_url: string | null;
}

export interface NotificationRow {
  id: number;
  trakt_show_id: number;
  show_title: string;
  show_slug: string;
  show_poster_url: string | null;
  notifications_enabled: boolean;
  last_known_season: number;
  last_checked_at: number | null;
  created_at: number;
}

export interface AuthMe {
  trakt_slug: string;
  email: string;
}

// ── Pending auth cookie payload ───────────────────────────────────────────────

export interface PendingAuth {
  trakt_slug: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}
