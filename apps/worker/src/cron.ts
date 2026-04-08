import type { Bindings } from './types';
import {
  getUserById,
  getEnabledNotificationsForCron,
  getEnabledShowsForUser,
  initializeShowData,
  updateShowEpisodeTracking,
  touchLastChecked,
} from './lib/db';
import { TraktClient } from './lib/trakt';
import { sendEpisodeDigest, type EpisodeTrigger, type UpcomingEntry } from './lib/email';

const DELAY_MS = 100;
const BREAK_THRESHOLD_DAYS = 90;
const UPCOMING_WINDOW_DAYS = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function daysBetween(isoA: string, isoB: string): number {
  return Math.round((new Date(isoB).getTime() - new Date(isoA).getTime()) / 86_400_000);
}

export async function scheduledHandler(
  _event: ScheduledEvent,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  ctx.waitUntil(runCheck(env));
}

async function runCheck(env: Bindings): Promise<void> {
  console.log('[cron] Starting episode check');

  const userRows = await getEnabledNotificationsForCron(env.DB);
  console.log(`[cron] Checking ${userRows.length} users`);

  for (const { user_id } of userRows) {
    try {
      await checkUserShows(env, user_id);
    } catch (e) {
      console.error(`[cron] Error for user ${user_id}:`, e);
    }
  }

  console.log('[cron] Episode check complete');
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

  const triggers: EpisodeTrigger[] = [];
  const triggeredShowIds = new Set<number>();

  // ── Phase 1: check each show for new episodes ─────────────────────────────

  for (const show of shows) {
    try {
      const lastEp = await trakt.getLastEpisode(show.show_slug);

      if (show.needs_season_init) {
        // Newly auto-synced show — record current state without notifying
        await initializeShowData(
          env.DB,
          show.id,
          lastEp?.season ?? 0,
          lastEp?.first_aired ?? null,
        );
        console.log(`[cron] Initialized ${show.show_title}: season ${lastEp?.season ?? 0}`);
      } else if (lastEp?.first_aired) {
        const isNewSeason = lastEp.season > show.last_known_season;

        const daysSince =
          !isNewSeason && show.last_episode_aired_at
            ? daysBetween(show.last_episode_aired_at, lastEp.first_aired)
            : 0;

        const isAfterBreak = !isNewSeason && daysSince >= BREAK_THRESHOLD_DAYS;

        if (isNewSeason || isAfterBreak) {
          triggers.push({
            showTitle: show.show_title,
            showSlug: show.show_slug,
            reason: isNewSeason ? 'season_premiere' : 'after_break',
            episode: {
              season: lastEp.season,
              number: lastEp.number,
              title: lastEp.title,
              overview: lastEp.overview,
              first_aired: lastEp.first_aired,
            },
            daysSince: isAfterBreak ? daysSince : undefined,
          });
          triggeredShowIds.add(show.trakt_show_id);

          await updateShowEpisodeTracking(env.DB, show.id, lastEp.season, lastEp.first_aired);

          console.log(
            `[cron] Trigger for ${show.show_title}: ` +
              (isNewSeason ? 'season_premiere' : `after_break (${daysSince}d)`),
          );
        } else {
          // No trigger — silently update tracking if episode date changed
          if (lastEp.first_aired !== show.last_episode_aired_at) {
            await updateShowEpisodeTracking(env.DB, show.id, lastEp.season, lastEp.first_aired);
          } else {
            await touchLastChecked(env.DB, show.id);
          }
        }
      } else {
        await touchLastChecked(env.DB, show.id);
      }
    } catch (e) {
      console.error(`[cron] Failed to check ${show.show_title}:`, e);
    }

    await sleep(DELAY_MS);
  }

  // Only send an email if there are notifications to deliver
  if (triggers.length === 0) return;

  // ── Phase 2: collect upcoming episodes for the email summary ─────────────

  const upcomingEntries: UpcomingEntry[] = [];
  const now = new Date().toISOString();

  const notificationShows = shows.filter(
    (s) => s.notifications_enabled === 1 && !triggeredShowIds.has(s.trakt_show_id),
  );

  for (const show of notificationShows) {
    try {
      const nextEp = await trakt.getNextEpisode(show.show_slug);
      if (nextEp?.first_aired) {
        const daysAway = daysBetween(now, nextEp.first_aired);
        if (daysAway >= 0 && daysAway <= UPCOMING_WINDOW_DAYS) {
          upcomingEntries.push({
            showTitle: show.show_title,
            showSlug: show.show_slug,
            episode: {
              season: nextEp.season,
              number: nextEp.number,
              title: nextEp.title,
              first_aired: nextEp.first_aired,
            },
          });
        }
      }
    } catch {
      // Upcoming is best-effort — don't let it block the email
    }

    await sleep(DELAY_MS);
  }

  upcomingEntries.sort((a, b) =>
    a.episode.first_aired.localeCompare(b.episode.first_aired),
  );

  // ── Phase 3: send consolidated digest ────────────────────────────────────

  console.log(
    `[cron] Sending digest to ${user.email}: ` +
      `${triggers.length} trigger(s), ${upcomingEntries.length} upcoming`,
  );

  try {
    await sendEpisodeDigest({
      resendApiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      to: user.email,
      triggers,
      upcoming: upcomingEntries,
    });
    console.log(`[cron] Digest sent to ${user.email}`);
  } catch (e) {
    console.error(`[cron] Failed to send digest to ${user.email}:`, e);
  }
}
