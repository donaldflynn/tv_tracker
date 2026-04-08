import type { Bindings } from './types';
import { getUserById, getEnabledNotificationsForCron, getEnabledShowsForUser, updateLastKnownSeason, touchLastChecked, initializeShowSeason } from './lib/db';
import { TraktClient } from './lib/trakt';
import { sendNewSeasonEmail } from './lib/email';

const DELAY_MS = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function scheduledHandler(
  _event: ScheduledEvent,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  ctx.waitUntil(runCheck(env));
}

async function runCheck(env: Bindings): Promise<void> {
  console.log('[cron] Starting season check');

  const userRows = await getEnabledNotificationsForCron(env.DB);
  console.log(`[cron] Checking ${userRows.length} users`);

  for (const { user_id } of userRows) {
    try {
      await checkUserShows(env, user_id);
    } catch (e) {
      console.error(`[cron] Error for user ${user_id}:`, e);
    }
  }

  console.log('[cron] Season check complete');
}

async function checkUserShows(env: Bindings, userId: number): Promise<void> {
  const user = await getUserById(env.DB, userId);
  if (!user) return;

  const shows = await getEnabledShowsForUser(env.DB, userId);
  console.log(`[cron] User ${userId} (${user.trakt_slug}): ${shows.length} shows`);

  const trakt = new TraktClient({
    clientId: env.TRAKT_CLIENT_ID,
    clientSecret: env.TRAKT_CLIENT_SECRET,
    redirectUri: env.TRAKT_REDIRECT_URI,
    accessToken: user.access_token,
    refreshToken: user.refresh_token,
    tokenExpiresAt: user.token_expires_at,
    userId: user.id,
    db: env.DB,
  });

  for (const show of shows) {
    try {
      const seasons = await trakt.getShowSeasons(show.trakt_show_id);
      const currentSeasonCount = TraktClient.countRegularSeasons(seasons);

      if (show.needs_season_init) {
        // Newly auto-synced show — record current season count without notifying
        await initializeShowSeason(env.DB, show.id, currentSeasonCount);
        console.log(`[cron] Initialized ${show.show_title}: ${currentSeasonCount} seasons`);
      } else if (currentSeasonCount > show.last_known_season) {
        console.log(
          `[cron] New season detected: ${show.show_title} — ` +
            `${show.last_known_season} → ${currentSeasonCount}`,
        );

        try {
          await sendNewSeasonEmail({
            resendApiKey: env.RESEND_API_KEY,
            from: env.EMAIL_FROM,
            to: user.email,
            showTitle: show.show_title,
            showSlug: show.show_slug,
            newSeasonCount: currentSeasonCount,
          });
          console.log(`[cron] Email sent for ${show.show_title} to ${user.email}`);
        } catch (e) {
          console.error(`[cron] Failed to send email for ${show.show_title}:`, e);
        }

        await updateLastKnownSeason(env.DB, show.id, currentSeasonCount);
      } else {
        await touchLastChecked(env.DB, show.id);
      }
    } catch (e) {
      console.error(`[cron] Failed to check ${show.show_title}:`, e);
    }

    await sleep(DELAY_MS);
  }
}
