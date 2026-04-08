import type { DbUser } from '@showtracker/types';

export interface Bindings {
  DB: D1Database;
  TRAKT_CLIENT_ID: string;
  TRAKT_CLIENT_SECRET: string;
  TRAKT_REDIRECT_URI: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  TMDB_API_KEY?: string;
}

export interface Variables {
  userId: number;
  user: DbUser;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
