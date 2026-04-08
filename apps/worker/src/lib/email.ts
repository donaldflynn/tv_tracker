interface SendNewSeasonEmailParams {
  resendApiKey: string;
  from: string;
  to: string;
  showTitle: string;
  showSlug: string;
  newSeasonCount: number;
}

export async function sendNewSeasonEmail(params: SendNewSeasonEmailParams): Promise<void> {
  const { resendApiKey, from, to, showTitle, showSlug, newSeasonCount } = params;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New season of ${showTitle} is out`,
      html: `
        <p>Hi,</p>
        <p><strong>${showTitle}</strong> has a new season &mdash;
           season ${newSeasonCount} is now available on Trakt.</p>
        <p><a href="https://trakt.tv/shows/${showSlug}">View on Trakt</a></p>
        <hr/>
        <p style="font-size:12px;color:#888">
          You're receiving this because you enabled notifications for this show on ShowTracker.
        </p>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}
