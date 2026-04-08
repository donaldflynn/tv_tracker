export interface EpisodeTrigger {
  showTitle: string;
  showSlug: string;
  reason: 'season_premiere' | 'after_break';
  episode: {
    season: number;
    number: number;
    title: string;
    overview?: string;
    first_aired?: string | null;
  };
  daysSince?: number;
}

export interface UpcomingEntry {
  showTitle: string;
  showSlug: string;
  episode: {
    season: number;
    number: number;
    title: string;
    first_aired: string;
  };
}

interface SendDigestParams {
  resendApiKey: string;
  from: string;
  to: string;
  triggers: EpisodeTrigger[];
  upcoming: UpcomingEntry[];
  isTest?: boolean;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(iso));
}

function episodeCode(season: number, ep: number): string {
  return `S${String(season).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;
}

function daysUntil(iso: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const t = new Date(iso); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / 86400000);
}

function buildSubject(triggers: EpisodeTrigger[], isTest: boolean): string {
  const prefix = isTest ? '[TEST] ' : '';
  if (triggers.length === 1) {
    const t = triggers[0];
    const label = t.reason === 'season_premiere'
      ? `Season ${t.episode.season} premiere`
      : 'Returns after a break';
    return `${prefix}${t.showTitle} — ${label} · ShowTracker`;
  }
  return `${prefix}${triggers.length} shows with new episodes · ShowTracker`;
}

function triggerCard(t: EpisodeTrigger): string {
  const badge = t.reason === 'season_premiere'
    ? `<span style="background:#7c3aed22;color:#a78bfa;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.5px">SEASON PREMIERE</span>`
    : `<span style="background:#f59e0b22;color:#fbbf24;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.5px">RETURNED${t.daysSince ? ` AFTER ${Math.round(t.daysSince / 30)} MONTHS` : ''}</span>`;

  const airDate = t.episode.first_aired ? `<p style="margin:4px 0 0;font-size:12px;color:#71717a">${formatDate(t.episode.first_aired)}</p>` : '';
  const overview = t.episode.overview
    ? `<p style="margin:10px 0 0;font-size:13px;color:#a3a3a3;line-height:1.5">${t.episode.overview}</p>`
    : '';

  return `
    <div style="border:1px solid #2a2a2a;border-radius:12px;padding:18px;margin-bottom:12px">
      <div style="margin-bottom:8px">${badge}</div>
      <p style="margin:0;font-size:16px;font-weight:700;color:#f5f5f5">${t.showTitle}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#a3a3a3">
        ${episodeCode(t.episode.season, t.episode.number)}
        ${t.episode.title ? `&mdash; ${t.episode.title}` : ''}
      </p>
      ${airDate}
      ${overview}
      <p style="margin:12px 0 0">
        <a href="https://trakt.tv/shows/${t.showSlug}/seasons/${t.episode.season}/episodes/${t.episode.number}"
           style="color:#7c3aed;font-size:13px;text-decoration:none">View on Trakt →</a>
      </p>
    </div>`;
}

function upcomingRow(u: UpcomingEntry): string {
  const d = daysUntil(u.episode.first_aired);
  const when = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `in ${d} days`;
  return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #1f1f1f">
        <span style="color:#e5e5e5;font-size:13px;font-weight:600">${u.showTitle}</span>
        <span style="color:#71717a;font-size:12px;margin-left:8px">
          ${episodeCode(u.episode.season, u.episode.number)}
          ${u.episode.title ? `— ${u.episode.title}` : ''}
        </span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #1f1f1f;text-align:right;white-space:nowrap">
        <span style="color:#a78bfa;font-size:12px">${when}</span>
        <span style="color:#52525b;font-size:11px;margin-left:6px">${formatDate(u.episode.first_aired)}</span>
      </td>
    </tr>`;
}

function buildHtml(params: SendDigestParams): string {
  const { triggers, upcoming, isTest } = params;
  const testBanner = isTest
    ? `<div style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:8px;padding:10px 14px;margin-bottom:20px;color:#fbbf24;font-size:13px">
         This is a test email — notifications will look like this.
       </div>`
    : '';

  const upcomingSection = upcoming.length > 0 ? `
    <div style="margin-top:32px">
      <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#52525b;text-transform:uppercase;margin:0 0 12px">Also coming up</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${upcoming.map(upcomingRow).join('')}
      </table>
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="100%" style="max-width:560px" cellpadding="0" cellspacing="0">
        <!-- Logo -->
        <tr><td style="padding-bottom:24px">
          <span style="color:#7c3aed;font-weight:800;font-size:16px;letter-spacing:-0.5px">ShowTracker</span>
        </td></tr>

        ${testBanner ? `<tr><td>${testBanner}</td></tr>` : ''}

        <!-- Section header -->
        <tr><td style="padding-bottom:16px">
          <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#52525b;text-transform:uppercase;margin:0">New episodes</p>
        </td></tr>

        <!-- Trigger cards -->
        <tr><td>
          ${triggers.map(triggerCard).join('')}
        </td></tr>

        <!-- Upcoming -->
        <tr><td>${upcomingSection}</td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:32px;border-top:1px solid #1a1a1a;margin-top:32px">
          <p style="font-size:11px;color:#52525b;margin:0;line-height:1.6">
            You're receiving this from ShowTracker because you have notifications enabled for these shows.<br>
            To manage notifications, visit your dashboard.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendEpisodeDigest(params: SendDigestParams): Promise<void> {
  const { resendApiKey, from, to, triggers, isTest } = params;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: buildSubject(triggers, isTest ?? false),
      html: buildHtml(params),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}
