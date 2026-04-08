import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  createSessionToken,
  createPendingAuthToken,
  verifyPendingAuthToken,
  createSignedState,
  verifySignedState,
} from '../lib/jwt';
import { getUserBySlug, createUser, updateUserTokens } from '../lib/db';
import { TraktClient } from '../lib/trakt';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';

const auth = new Hono<AppEnv>();

// ── GET /api/auth/login ───────────────────────────────────────────────────────

auth.get('/login', async (c) => {
  // State is a signed nonce — no cookie needed. The HMAC signature lets us
  // verify on callback that we issued this state, preventing CSRF.
  const state = await createSignedState(c.env.JWT_SECRET);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: c.env.TRAKT_CLIENT_ID,
    redirect_uri: c.env.TRAKT_REDIRECT_URI,
    state,
  });

  return c.redirect(`https://trakt.tv/oauth/authorize?${params}`);
});

// ── GET /api/auth/callback ────────────────────────────────────────────────────

auth.get('/callback', async (c) => {
  const { code, state } = c.req.query();

  if (!code || !state || !(await verifySignedState(state, c.env.JWT_SECRET))) {
    return c.json({ error: 'Invalid OAuth state' }, 400);
  }

  let tokens;
  try {
    tokens = await TraktClient.exchangeCode({
      code,
      clientId: c.env.TRAKT_CLIENT_ID,
      clientSecret: c.env.TRAKT_CLIENT_SECRET,
      redirectUri: c.env.TRAKT_REDIRECT_URI,
    });
  } catch (e) {
    console.error('Code exchange failed:', e);
    return c.json({ error: 'Failed to exchange code' }, 500);
  }

  let me;
  try {
    me = await TraktClient.getAnonymousMe(tokens.access_token, c.env.TRAKT_CLIENT_ID);
  } catch (e) {
    console.error('Profile fetch failed:', e);
    return c.json({ error: 'Failed to fetch Trakt profile' }, 500);
  }

  const tokenExpiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
  const existingUser = await getUserBySlug(c.env.DB, me.username);

  if (existingUser) {
    await updateUserTokens(c.env.DB, existingUser.id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokenExpiresAt,
    });

    const sessionToken = await createSessionToken(existingUser.id, c.env.JWT_SECRET);
    setCookie(c, 'session', sessionToken, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: true,
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return c.redirect('/');
  }

  // New user — store pending auth in a signed cookie, redirect to setup
  const pendingToken = await createPendingAuthToken(
    {
      trakt_slug: me.username,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokenExpiresAt,
    },
    c.env.JWT_SECRET,
  );

  setCookie(c, 'pending_auth', pendingToken, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    maxAge: 900,
    path: '/',
  });

  return c.redirect('/setup');
});

// ── POST /api/auth/setup ──────────────────────────────────────────────────────

auth.post('/setup', async (c) => {
  const pendingToken = getCookie(c, 'pending_auth');
  if (!pendingToken) {
    return c.json({ error: 'No pending auth session' }, 400);
  }

  const pending = await verifyPendingAuthToken(pendingToken, c.env.JWT_SECRET);
  if (!pending) {
    return c.json({ error: 'Pending auth expired or invalid' }, 400);
  }

  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Valid email required' }, 400);
  }

  deleteCookie(c, 'pending_auth', { path: '/' });

  const userId = await createUser(c.env.DB, {
    trakt_slug: pending.trakt_slug,
    email,
    access_token: pending.access_token,
    refresh_token: pending.refresh_token,
    token_expires_at: pending.token_expires_at,
  });

  const sessionToken = await createSessionToken(userId, c.env.JWT_SECRET);
  setCookie(c, 'session', sessionToken, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });

  return c.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

auth.get('/me', requireAuth, (c) => {
  const user = c.get('user');
  return c.json({ trakt_slug: user.trakt_slug, email: user.email });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

auth.post('/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ ok: true });
});

export { auth as authRoutes };
