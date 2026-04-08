import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth';
import { showRoutes } from './routes/shows';
import { notificationRoutes } from './routes/notifications';
import { scheduledHandler } from './cron';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

// CORS — allows the Vite dev server; in production requests are same-origin via Pages proxy
app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

app.route('/api/auth', authRoutes);
app.route('/api/shows', showRoutes);
app.route('/api/notifications', notificationRoutes);

// Health check
app.get('/api/health', (c) => c.json({ ok: true }));

// 404 fallback for unmatched /api routes
app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
  scheduled: scheduledHandler,
};
