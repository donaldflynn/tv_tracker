import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { verifySessionToken } from '../lib/jwt';
import { getUserById } from '../lib/db';
import type { AppEnv } from '../types';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const cookieHeader = c.req.header('cookie') ?? '(none)';
  const token = getCookie(c, 'session');

  console.log('[auth] cookie header:', cookieHeader.substring(0, 120));
  console.log('[auth] session token present:', !!token);

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifySessionToken(token, c.env.JWT_SECRET);
  console.log('[auth] payload:', JSON.stringify(payload));

  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const userId = Number(payload.sub);
  const user = await getUserById(c.env.DB, userId);
  console.log('[auth] user found:', !!user);

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('userId', userId);
  c.set('user', user);
  await next();
});
