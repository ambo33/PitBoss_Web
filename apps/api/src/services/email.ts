import nodemailer from 'nodemailer';
import { getClientUrl } from '../config';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 587),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const from = process.env.EMAIL_FROM ?? 'PokerPlanner.bet <noreply@pokerplanner.bet>';
const clientUrl = getClientUrl();

export async function sendVerificationEmail(email: string, pin: string): Promise<void> {
  await transporter.sendMail({
    from,
    to: email,
    subject: 'Verify your PokerPlanner.bet account',
    html: `<p>Your verification PIN is: <strong>${pin}</strong></p>`,
  });
}

export async function sendPasswordResetEmail(email: string, resetGuid: string): Promise<void> {
  const link = `${clientUrl}/reset-password?token=${resetGuid}`;
  await transporter.sendMail({
    from,
    to: email,
    subject: 'Reset your PokerPlanner.bet password',
    html: `<p>Click <a href="${link}">here</a> to reset your password. This link expires in 1 hour.</p>`,
  });
}

export async function sendGroupInviteEmail(
  email: string,
  groupName: string,
  inviteCode: string,
  note?: string
): Promise<void> {
  const joinLink = `${clientUrl}/join/${encodeURIComponent(inviteCode)}`;
  await transporter.sendMail({
    from,
    to: email,
    subject: `You're invited to join ${groupName} on PokerPlanner.bet`,
    html: `
      <p>You were invited to join <strong>${groupName}</strong> on PokerPlanner.bet.</p>
      <p>Use this group join code: <strong>${inviteCode}</strong></p>
      <p><a href="${joinLink}">Click here to join the group</a></p>
      ${note ? `<p>Note from the organizer: ${note}</p>` : ''}
      <p>If you need an account, create one first and the group join will continue automatically.</p>
    `,
  });
}

export async function sendTournamentCancelledEmail(
  email: string,
  tournamentName: string,
  tournamentDate?: string | null,
  tournamentTime?: string | null
): Promise<void> {
  const when = [tournamentDate, tournamentTime].filter(Boolean).join(' at ');
  await transporter.sendMail({
    from,
    to: email,
    subject: `${tournamentName} has been cancelled`,
    html: `
      <p>The tournament <strong>${tournamentName}</strong> has been cancelled.</p>
      ${when ? `<p>Scheduled time: ${when}</p>` : ''}
      <p>Please check PokerPlanner.bet for updated tournament plans.</p>
    `,
  });
}
