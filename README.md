# ShowTracker

A personal web application for tracking TV shows and receiving email notifications when a new season is released. Show and episode data is fetched from the Trakt.tv API at runtime. The only data stored locally is user identity, session state, notification preferences, and the last-known season count per show.

## Stack

| Concern | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS v4 |
| Backend | Cloudflare Workers, Hono |
| Scheduled job | Cloudflare Cron Trigger (daily, 8am UTC) |
| Database | Cloudflare D1 (SQLite) |
| Session | Signed JWT in an HttpOnly cookie |
| Email | Resend |
| Monorepo | pnpm workspaces |

## Repository structure

```
apps/
  web/        React frontend + thin proxy worker (showtracker-web)
  worker/     API worker + cron handler (showtracker-worker)
packages/
  types/      Shared TypeScript types
```

## Prerequisites

- Node.js 22+
- pnpm 9+
- A Cloudflare account with Workers and D1 access
- A Trakt.tv account with an OAuth application registered at https://trakt.tv/oauth/applications
- A Resend account and API key (free tier: 3,000 emails/month)

## Local development

```sh
pnpm install

# Run the Vite dev server (proxies /api/* to localhost:8787)
pnpm dev:web

# Run the API worker locally
pnpm dev:worker
```

The Vite proxy is configured in `apps/web/vite.config.ts` and forwards all `/api/*` requests to the wrangler dev server on port 8787. The two processes can be run in separate terminals.

## One-time Cloudflare setup

### 1. Create the D1 database

```sh
wrangler d1 create showtracker
```

Copy the returned `database_id` into `apps/worker/wrangler.toml`.

### 2. Apply the database migration

```sh
pnpm --filter worker db:migrate
```

This runs the SQL in `apps/worker/migrations/0001_initial.sql` against the remote database, creating the `users` and `show_notifications` tables.

### 3. Set secrets on the API worker

```sh
wrangler secret put JWT_SECRET           --name showtracker-worker
wrangler secret put TRAKT_CLIENT_ID      --name showtracker-worker
wrangler secret put TRAKT_CLIENT_SECRET  --name showtracker-worker
wrangler secret put RESEND_API_KEY       --name showtracker-worker
wrangler secret put TMDB_API_KEY         --name showtracker-worker  # optional, enables poster images
```

`JWT_SECRET` should be a random string of 32 or more characters. Generate one with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The Trakt client ID and secret come from your OAuth application at https://trakt.tv/oauth/applications. The Resend API key is created in the Resend dashboard. The TMDB API key is optional and available at https://www.themoviedb.org/settings/api.

### 4. Update the Trakt redirect URI

In `apps/worker/wrangler.toml`, set `TRAKT_REDIRECT_URI` to your worker's URL:

```toml
TRAKT_REDIRECT_URI = "https://showtracker-web.YOUR-SUBDOMAIN.workers.dev/api/auth/callback"
```

Set the same URL in your Trakt OAuth application settings.

## Deployment

The project deploys as two Cloudflare Workers. The API worker must be deployed before the web worker, because the web worker references it via a service binding.

### Deploy the API worker

```sh
pnpm --filter worker deploy
```

### Deploy the web worker

```sh
pnpm build:web
cd apps/web && wrangler deploy
```

Or from the root:

```sh
pnpm deploy
```

The root `deploy` script builds the frontend and deploys the web worker in one step.

## CI/CD

The repository includes a GitHub Actions workflow at `.github/workflows/deploy.yml` that builds and deploys both workers on every push to `main`.

Add the following secrets to the GitHub repository (Settings → Secrets and variables → Actions):

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Create via Cloudflare dashboard using the "Edit Cloudflare Workers" token template |
| `CLOUDFLARE_ACCOUNT_ID` | Found in the Cloudflare dashboard sidebar under any Workers or Pages project |

Alternatively, connect each worker to the repository through the Cloudflare dashboard (Workers & Pages → worker → Settings → Build & Deployments) with these settings:

**showtracker-worker**
- Root directory: `apps/worker`
- Build command: `cd ../.. && pnpm install`

**showtracker-web**
- Root directory: `apps/web`
- Build command: `cd ../.. && pnpm install && pnpm --filter web build`

Deploy `showtracker-worker` first when connecting for the first time.

## Architecture

```
Browser → showtracker-web (CF Worker)
              |-- /api/*  → showtracker-worker (service binding, internal)
              \-- /*      → static assets (React SPA, index.html fallback)
```

The web worker contains a minimal `src/worker.ts` that routes requests: `/api/*` is forwarded to the API worker via a Cloudflare service binding, all other requests are served from the static asset bundle. The two workers communicate internally within Cloudflare's network; the API worker does not need to be publicly accessible.

## Environment variables

All secrets and configuration live on `showtracker-worker`. The web worker has no secrets.

| Variable | Type | Description |
|---|---|---|
| `TRAKT_CLIENT_ID` | Secret | Trakt OAuth application client ID |
| `TRAKT_CLIENT_SECRET` | Secret | Trakt OAuth application client secret |
| `TRAKT_REDIRECT_URI` | Var | Full URL to `/api/auth/callback` on the web worker |
| `JWT_SECRET` | Secret | Secret used to sign session and pending-auth JWTs |
| `RESEND_API_KEY` | Secret | Resend API key for sending notification emails |
| `EMAIL_FROM` | Var | From address for notification emails |
| `TMDB_API_KEY` | Secret | Optional. Enables show poster images via TMDB |

## Database schema

Two tables are managed by `apps/worker/migrations/0001_initial.sql`.

**users** — one row per registered user. Stores Trakt OAuth tokens and the email address collected at first login (Trakt does not expose user email addresses via its API).

**show_notifications** — one row per tracked show per user. Stores the show identity, notification preference, and `last_known_season` which the cron job uses to detect when a new season has been added.

## Cron job

The cron trigger runs daily at 8am UTC. For each user with at least one enabled notification, it fetches the current season list from Trakt for each tracked show, compares the count against `last_known_season`, and sends an email via Resend if the count has increased. It then updates `last_known_season` and `last_checked_at` in D1.

Trakt's free API tier allows 1,000 requests per day per application. The cron handler adds a 100ms delay between show checks to avoid burst usage.
