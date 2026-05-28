import nodemailer from 'nodemailer';
import https from 'https';
import { getAppUrl } from '../config';

const resendApiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? 'ThePokerPlanner <noreply@thepokerplanner.com>';
const appUrl = getAppUrl();
const appBaseUrl = appUrl.replace(/\/$/, '');
const emailHeaderUrl = `${appBaseUrl}/email-header.jpg`;

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
                  <td style="border-bottom:1px solid #2a2c35;background:#050708;">
                    <img src="${emailHeaderUrl}" alt="ThePokerPlanner.com - Run Better Poker Nights" width="620" style="display:block;width:100%;max-width:620px;height:auto;border:0;line-height:100%;outline:none;text-decoration:none;">
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
                    You are receiving this because you use ThePokerPlanner. Replies may not be monitored.
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
  const verifyLink = `${appUrl}/login?verifyEmail=${encodeURIComponent(email)}&code=${encodeURIComponent(pin)}`;
  await sendMail({
    to: email,
    subject: 'Verify your ThePokerPlanner account',
    html: emailLayout({
      eyebrow: 'Account Verification',
      title: 'Verify your account',
      intro: 'Use this PIN or click the button to finish setting up your ThePokerPlanner account.',
      body: `
        <div style="display:inline-block;border-radius:12px;border:1px solid #2a2c35;background:#101116;padding:14px 18px;font-size:28px;font-weight:800;letter-spacing:0.18em;color:#ffffff;">${escapeHtml(pin)}</div>
        <p style="margin:16px 0 0;">This code is only for verifying your account.</p>
      `,
      ctaHref: verifyLink,
      ctaLabel: 'Verify Email',
    }),
  });
}

export async function sendWelcomeEmail(email: string): Promise<void> {
  await sendMail({
    to: email,
    subject: 'Welcome to ThePokerPlanner',
    html: emailLayout({
      eyebrow: 'Welcome',
      title: 'Your poker night hub is ready',
      intro: 'Create your first group, invite your players, and start coordinating better poker nights.',
      body: `
        <p style="margin:0 0 12px;">Groups keep your players, tournament history, announcements, and invites organized in one place.</p>
        <p style="margin:0;">Start with a group, then schedule your first tournament when you are ready.</p>
      `,
      ctaHref: appUrl,
      ctaLabel: 'Create a Group',
    }),
  });
}

export async function sendPasswordResetEmail(email: string, resetGuid: string): Promise<void> {
  const link = `${appUrl}/reset-password?token=${resetGuid}`;
  await sendMail({
    to: email,
    subject: 'Reset your ThePokerPlanner password',
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

export async function sendPublicBlindTimerCodeEmail(email: string, code: string, timerName: string, unsubscribeToken?: string | null): Promise<void> {
  const link = `${appUrl}/blind-timer/${encodeURIComponent(code)}`;
  const unsubscribeLink = unsubscribeToken ? `${appUrl}/unsubscribe/${encodeURIComponent(unsubscribeToken)}` : '';
  await sendMail({
    to: email,
    subject: `Your ThePokerPlanner blind timer code: ${code}`,
    html: emailLayout({
      eyebrow: 'Blind Timer Code',
      title: timerName || 'Your blind timer is ready',
      intro: 'Use this code any time to reopen your free ThePokerPlanner blind timer.',
      body: `
        <p style="margin:0 0 12px;">Timer code: <strong style="color:#ffffff;font-size:22px;letter-spacing:0.16em;">${escapeHtml(code)}</strong></p>
        <p style="margin:0;">You can run the timer in your browser, tweak the blind structure, and keep the same code for later.</p>
        ${unsubscribeLink ? `<p style="margin:18px 0 0;font-size:12px;color:#8d93a5;">You also opted in to occasional ThePokerPlanner updates. <a href="${unsubscribeLink}" style="color:#13adad;">Unsubscribe here</a>.</p>` : ''}
      `,
      ctaHref: link,
      ctaLabel: 'Open Blind Timer',
    }),
  });
}

export async function sendGroupInviteEmail(
  email: string,
  groupName: string,
  inviteCode: string,
  note?: string,
  hasAccount = true
): Promise<void> {
  const joinLink = `${appUrl}/join/${encodeURIComponent(inviteCode)}`;
  const createAccountLink = `${appUrl}/login?mode=register&invite=${encodeURIComponent(inviteCode)}`;
  await sendMail({
    to: email,
    subject: `You're invited to join ${groupName} on ThePokerPlanner`,
    html: emailLayout({
      eyebrow: 'Group Invite',
      title: `Join ${groupName}`,
      intro: hasAccount
        ? 'You were invited to join a ThePokerPlanner group.'
        : 'You were invited to join a ThePokerPlanner group. Create your account first and the invite will continue automatically.',
      body: `
        <p style="margin:0 0 12px;">Join code: <strong style="color:#ffffff;letter-spacing:0.12em;">${escapeHtml(inviteCode)}</strong></p>
        ${note ? `<p style="margin:0 0 12px;border-left:3px solid #13adad;padding-left:12px;">${escapeHtml(note)}</p>` : ''}
        <p style="margin:0;">${hasAccount ? 'Sign in and we will add the group to your account.' : 'After email verification, we will bring you back to accept this group invite.'}</p>
      `,
      ctaHref: hasAccount ? joinLink : createAccountLink,
      ctaLabel: hasAccount ? 'Join Group' : 'Create Account & Join',
    }),
  });
}

export async function sendLeagueGuestClaimEmail(
  email: string,
  leagueName: string,
  guestName: string,
  claimToken: string,
  hasAccount = true
): Promise<void> {
  const claimLink = `${appUrl}/league-guest-claim?token=${encodeURIComponent(claimToken)}`;
  const authLink = `${appUrl}/login?${new URLSearchParams({
    ...(hasAccount ? {} : { mode: 'register' }),
    next: `/league-guest-claim?token=${claimToken}`,
  }).toString()}`;
  await sendMail({
    to: email,
    subject: `Claim your ${leagueName} league spot`,
    html: emailLayout({
      eyebrow: 'League Profile',
      title: `Claim ${guestName}`,
      intro: hasAccount
        ? 'A league admin invited you to connect this league player spot to your ThePokerPlanner account.'
        : 'A league admin invited you to create an account and connect this league player spot to it.',
      body: `
        <p style="margin:0 0 12px;">Once claimed, this spot's league finishes, payments, and season history will belong to your account.</p>
        <p style="margin:0;">${hasAccount ? 'Sign in with this email address to claim the spot.' : 'Create your account with this email address, verify it, and we will bring you back to claim the spot.'}</p>
      `,
      ctaHref: hasAccount ? claimLink : authLink,
      ctaLabel: hasAccount ? 'Claim League Spot' : 'Create Account & Claim',
    }),
  });
}

export async function sendGroupPostApprovalEmail(
  email: string,
  groupName: string,
  authorName: string,
  message: string
): Promise<void> {
  const preview = message.length > 220 ? `${message.slice(0, 220)}...` : message;
  await sendMail({
    to: email,
    subject: `New ${groupName} post needs approval`,
    html: emailLayout({
      eyebrow: 'Post Approval',
      title: `${groupName} has a post waiting`,
      intro: `${authorName} submitted a post for group admin review.`,
      body: `
        <p style="margin:0 0 12px;border-left:3px solid #13adad;padding-left:12px;">${escapeHtml(preview)}</p>
        <p style="margin:0;">Open the group Posts tab to approve or reject it.</p>
      `,
      ctaHref: appUrl,
      ctaLabel: 'Open ThePokerPlanner',
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
  const link = `${appUrl}/lobby/${encodeURIComponent(tournamentId)}`;
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

export async function sendGameCreatedEmail(
  email: string,
  gameId: string,
  gameTitle: string,
  groupName: string | null,
  gameType: 'tournament' | 'cash',
  startsAt?: string | null,
  stakesLabel?: string | null
): Promise<void> {
  const link = gameType === 'cash'
    ? `${appUrl}/cash-games/${encodeURIComponent(gameId)}/admin`
    : appUrl;
  const startsAtText = startsAt ? formatTournamentWhen(startsAt.slice(0, 10), startsAt.slice(11, 16)) : 'Date and time TBD';
  const typeLabel = gameType === 'cash' ? 'Cash Game' : 'Game';
  await sendMail({
    to: email,
    subject: `${gameTitle} is open`,
    html: emailLayout({
      eyebrow: `New ${typeLabel}`,
      title: gameTitle,
      intro: groupName ? `${groupName} posted a new ${typeLabel.toLowerCase()}.` : `A new ${typeLabel.toLowerCase()} was posted.`,
      body: `
        <p style="margin:0 0 12px;"><strong style="color:#ffffff;">When:</strong> ${escapeHtml(startsAtText)}</p>
        ${stakesLabel ? `<p style="margin:0 0 12px;"><strong style="color:#ffffff;">Stakes:</strong> ${escapeHtml(stakesLabel)}</p>` : ''}
        <p style="margin:0;">Open ThePokerPlanner to view the game details.</p>
      `,
      ctaHref: link,
      ctaLabel: gameType === 'cash' ? 'Open Cash Game' : 'Open Game',
    }),
  });
}

export async function sendGameCancelledEmail(
  email: string,
  gameTitle: string,
  groupName: string | null,
  startsAt?: string | null
): Promise<void> {
  const startsAtText = startsAt ? formatTournamentWhen(startsAt.slice(0, 10), startsAt.slice(11, 16)) : null;
  await sendMail({
    to: email,
    subject: `${gameTitle} has been cancelled`,
    html: emailLayout({
      eyebrow: 'Game Cancelled',
      title: `${gameTitle} has been cancelled`,
      intro: groupName ? `${groupName} cancelled this game.` : 'This game has been cancelled.',
      body: `
        ${startsAtText ? `<p style="margin:0 0 12px;"><strong style="color:#ffffff;">Original time:</strong> ${escapeHtml(startsAtText)}</p>` : ''}
        <p style="margin:0;">No action is needed. You will not receive more reminders for this game.</p>
      `,
      ctaHref: appUrl,
      ctaLabel: 'Open ThePokerPlanner',
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
  const link = `${appUrl}/lobby/${encodeURIComponent(tournamentId)}`;
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

export async function sendLeagueEventReminderEmail(
  email: string,
  leagueId: string,
  leagueName: string,
  eventName: string,
  eventDate?: string | null
): Promise<void> {
  const eventDateText = eventDate ? eventDate.slice(0, 10) : 'today';
  await sendMail({
    to: email,
    subject: `Reminder: ${eventName} is today`,
    html: emailLayout({
      eyebrow: 'League Event Reminder',
      title: eventName,
      intro: `${leagueName} has a league event scheduled for ${eventDateText}.`,
      body: '<p style="margin:0;">Open ThePokerPlanner to check standings and event details.</p>',
      ctaHref: `${appUrl}/?tab=leagues&league=${encodeURIComponent(leagueId)}`,
      ctaLabel: 'Open League',
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
      body: '<p style="margin:0;">Please check ThePokerPlanner for updated tournament plans.</p>',
      ctaHref: appUrl,
      ctaLabel: 'Open ThePokerPlanner',
    }),
  });
}
