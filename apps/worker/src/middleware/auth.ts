import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { verifySessionToken } from '../lib/jwt';
import { getUserById } from '../lib/db';
import type { AppEnv } from '../types';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, 'session');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifySessionToken(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const userId = Number(payload.sub);
  const user = await getUserById(c.env.DB, userId);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('userId', userId);
  c.set('user', user);
  await next();
});
