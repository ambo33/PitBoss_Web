import nodemailer from 'nodemailer';
import https from 'https';
import { getClientUrl } from '../config';

const resendApiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? 'PokerPlanner.bet <noreply@pokerplanner.bet>';
const clientUrl = getClientUrl();

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 587),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

function postResendEmail(payload: EmailPayload): Promise<void> {
  if (!resendApiKey) return Promise.resolve();

  const body = JSON.stringify({
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          const status = res.statusCode ?? 500;
          if (status >= 200 && status < 300) {
            resolve();
            return;
          }
          reject(new Error(`Resend email failed with ${status}: ${responseBody}`));
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendMail(payload: EmailPayload): Promise<void> {
  if (resendApiKey) {
    await postResendEmail(payload);
    return;
  }

  await smtpTransporter.sendMail({
    from,
    ...payload,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTournamentWhen(tournamentDate?: string | null, tournamentTime?: string | null): string {
  const date = tournamentDate ? tournamentDate.slice(0, 10) : '';
  const rawTime = tournamentTime ? tournamentTime.slice(0, 5) : '';
  if (!date && !rawTime) return 'Date and time TBD';
  const formattedDate = date
    ? new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${date}T12:00:00Z`))
    : 'Date TBD';
  if (!rawTime) return formattedDate;
  const [hourValue, minuteValue] = rawTime.split(':').map(Number);
  const suffix = hourValue >= 12 ? 'PM' : 'AM';
  const hour = hourValue % 12 || 12;
  return `${formattedDate} at ${hour}:${String(minuteValue ?? 0).padStart(2, '0')} ${suffix}`;
}

function emailLayout({
  eyebrow,
  title,
  intro,
  body,
  ctaHref,
  ctaLabel,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#0f1014;color:#f7f7fb;font-family:Inter,Segoe UI,Arial,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1014;padding:28px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #2a2c35;border-radius:18px;background:#17181f;overflow:hidden;">
                <tr>
                  <td style="padding:26px 28px 18px;border-bottom:1px solid #2a2c35;">
                    <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">PokerPlanner.bet</div>
                    <div style="margin-top:4px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#8d93a5;">Run Better Poker Nights</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#16b8b8;">${escapeHtml(eyebrow)}</div>
                    <h1 style="margin:10px 0 12px;font-size:28px;line-height:1.12;color:#ffffff;">${escapeHtml(title)}</h1>
                    ${intro ? `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#d7dae5;">${escapeHtml(intro)}</p>` : ''}
                    <div style="font-size:15px;line-height:1.7;color:#c5c9d6;">${body}</div>
                    ${ctaHref && ctaLabel ? `
                      <div style="margin-top:26px;">
                        <a href="${ctaHref}" style="display:inline-block;border-radius:10px;background:#13adad;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 18px;">${escapeHtml(ctaLabel)}</a>
                      </div>
                    ` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 28px;border-top:1px solid #2a2c35;color:#8d93a5;font-size:12px;line-height:1.5;">
                    You are receiving this because you use PokerPlanner.bet. Replies may not be monitored.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export async function sendVerificationEmail(email: string, pin: string): Promise<void> {
  await sendMail({
    to: email,
    subject: 'Verify your PokerPlanner.bet account',
    html: emailLayout({
      eyebrow: 'Account Verification',
      title: 'Verify your account',
      intro: 'Use this PIN to finish setting up your PokerPlanner.bet account.',
      body: `<div style="display:inline-block;border-radius:12px;border:1px solid #2a2c35;background:#101116;padding:14px 18px;font-size:28px;font-weight:800;letter-spacing:0.18em;color:#ffffff;">${escapeHtml(pin)}</div>`,
    }),
  });
}

export async function sendPasswordResetEmail(email: string, resetGuid: string): Promise<void> {
  const link = `${clientUrl}/reset-password?token=${resetGuid}`;
  await sendMail({
    to: email,
    subject: 'Reset your PokerPlanner.bet password',
    html: emailLayout({
      eyebrow: 'Password Reset',
      title: 'Reset your password',
      intro: 'This secure link expires in 1 hour.',
      body: '<p style="margin:0;">If you did not request a password reset, you can ignore this email.</p>',
      ctaHref: link,
      ctaLabel: 'Reset Password',
    }),
  });
}

export async function sendGroupInviteEmail(
  email: string,
  groupName: string,
  inviteCode: string,
  note?: string
): Promise<void> {
  const joinLink = `${clientUrl}/join/${encodeURIComponent(inviteCode)}`;
  await sendMail({
    to: email,
    subject: `You're invited to join ${groupName} on PokerPlanner.bet`,
    html: emailLayout({
      eyebrow: 'Group Invite',
      title: `Join ${groupName}`,
      intro: 'You were invited to join a PokerPlanner.bet group.',
      body: `
        <p style="margin:0 0 12px;">Join code: <strong style="color:#ffffff;letter-spacing:0.12em;">${escapeHtml(inviteCode)}</strong></p>
        ${note ? `<p style="margin:0 0 12px;border-left:3px solid #13adad;padding-left:12px;">${escapeHtml(note)}</p>` : ''}
        <p style="margin:0;">If you need an account, create one first and the group join will continue automatically.</p>
      `,
      ctaHref: joinLink,
      ctaLabel: 'Join Group',
    }),
  });
}

export async function sendTournamentPostedEmail(
  email: string,
  tournamentId: string,
  tournamentName: string,
  groupName: string | null,
  tournamentDate?: string | null,
  tournamentTime?: string | null
): Promise<void> {
  const link = `${clientUrl}/lobby/${encodeURIComponent(tournamentId)}`;
  const when = formatTournamentWhen(tournamentDate, tournamentTime);
  await sendMail({
    to: email,
    subject: `${tournamentName} is open for registration`,
    html: emailLayout({
      eyebrow: 'New Tournament',
      title: tournamentName,
      intro: groupName ? `${groupName} posted a new poker night.` : 'A new poker night was posted.',
      body: `
        <p style="margin:0 0 12px;"><strong style="color:#ffffff;">When:</strong> ${escapeHtml(when)}</p>
        <p style="margin:0;">Open the tournament lobby to register and see details.</p>
      `,
      ctaHref: link,
      ctaLabel: 'Open Tournament',
    }),
  });
}

export async function sendTournamentReminderEmail(
  email: string,
  tournamentId: string,
  tournamentName: string,
  tournamentDate?: string | null,
  tournamentTime?: string | null
): Promise<void> {
  const link = `${clientUrl}/lobby/${encodeURIComponent(tournamentId)}`;
  const when = formatTournamentWhen(tournamentDate, tournamentTime);
  await sendMail({
    to: email,
    subject: `Reminder: ${tournamentName} is coming up`,
    html: emailLayout({
      eyebrow: 'Tournament Reminder',
      title: tournamentName,
      intro: `You're registered for this tournament.`,
      body: `<p style="margin:0;"><strong style="color:#ffffff;">When:</strong> ${escapeHtml(when)}</p>`,
      ctaHref: link,
      ctaLabel: 'Open Player Lobby',
    }),
  });
}

export async function sendTournamentCancelledEmail(
  email: string,
  tournamentName: string,
  tournamentDate?: string | null,
  tournamentTime?: string | null
): Promise<void> {
  const when = [tournamentDate, tournamentTime].filter(Boolean).join(' at ');
  await sendMail({
    to: email,
    subject: `${tournamentName} has been cancelled`,
    html: emailLayout({
      eyebrow: 'Tournament Cancelled',
      title: `${tournamentName} has been cancelled`,
      intro: when ? `Scheduled time: ${when}` : undefined,
      body: '<p style="margin:0;">Please check PokerPlanner.bet for updated tournament plans.</p>',
      ctaHref: clientUrl,
      ctaLabel: 'Open PokerPlanner.bet',
    }),
  });
}
