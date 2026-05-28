import { query } from '../db';
import { sendNotificationToUsers } from '../lib/server/notifications/notificationService';
import { publicEmail } from '../privacy';
import {
  sendGameCancelledEmail as sendGameCancelledEmailMessage,
  sendGameCreatedEmail as sendGameCreatedEmailMessage,
} from './email';

type GameCreatedArgs = {
  gameId: string;
  groupId: string;
  gameTitle: string;
  gameType: 'tournament' | 'cash';
  groupName?: string | null;
  startsAt?: string | null;
  stakesLabel?: string | null;
  recipientUserIds: string[];
  channels: Array<'email' | 'push'>;
};

type GameCancelledArgs = {
  gameId: string;
  groupId: string;
  gameTitle: string;
  groupName?: string | null;
  startsAt?: string | null;
  recipientUserIds: string[];
  channels: Array<'email' | 'push'>;
};

export async function notifyGameCreated(args: GameCreatedArgs): Promise<void> {
  const jobs: Promise<void>[] = [];
  if (args.channels.includes('email')) jobs.push(sendGameCreatedEmail(args));
  if (args.channels.includes('push')) jobs.push(sendGameCreatedPush(args));
  const results = await Promise.allSettled(jobs);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Game notification failed', result.reason);
    }
  }
}

export async function notifyGameCancelled(args: GameCancelledArgs): Promise<void> {
  const jobs: Promise<void>[] = [];
  if (args.channels.includes('email')) jobs.push(sendGameCancelledEmail(args));
  if (args.channels.includes('push')) jobs.push(sendGameCancelledPush(args));
  const results = await Promise.allSettled(jobs);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Game cancellation notification failed', result.reason);
    }
  }
}

async function sendGameCreatedEmail(args: GameCreatedArgs): Promise<void> {
  if (args.recipientUserIds.length === 0) return;
  const rows = await query<{ emailaddress: string | null; emailencrypted: string | null }>(
    `SELECT u.emailaddress, u.emailencrypted
     FROM users u
     JOIN groupmembers gm ON gm.userid = u.guid AND gm.groupid = $2
     WHERE u.guid = ANY($1::UUID[])
       AND COALESCE(gm.emailalertsenabled, TRUE) = TRUE`,
    [args.recipientUserIds, args.groupId]
  );
  await Promise.all(rows
    .map((row) => publicEmail(row.emailencrypted, row.emailaddress))
    .filter((email): email is string => Boolean(email))
    .map((email) => sendGameCreatedEmailMessage(
      email,
      args.gameId,
      args.gameTitle,
      args.groupName ?? null,
      args.gameType,
      args.startsAt ?? null,
      args.stakesLabel ?? null
    )));
}

async function sendGameCreatedPush(args: GameCreatedArgs): Promise<void> {
  if (args.recipientUserIds.length === 0) return;
  const rows = await query<{ userid: string }>(
    `SELECT userid
     FROM groupmembers
     WHERE groupid = $2
       AND userid = ANY($1::UUID[])
       AND COALESCE(pushalertsenabled, TRUE) = TRUE`,
    [args.recipientUserIds, args.groupId]
  );
  await sendNotificationToUsers(rows.map((row) => row.userid), 'new_tournament_created', {
    title: args.gameType === 'cash' ? 'New cash game posted' : 'New game posted',
    body: `${args.gameTitle} is now open.`,
    url: args.gameType === 'cash' ? `/cash-games/${args.gameId}/admin` : '/',
    tag: `game-${args.gameId}-created`,
    groupId: args.groupId,
    entityId: args.gameId,
    tournamentName: args.gameTitle,
  }, {
    entityType: 'game',
    entityId: args.gameId,
    skipPreferences: true,
  });
}

async function sendGameCancelledEmail(args: GameCancelledArgs): Promise<void> {
  if (args.recipientUserIds.length === 0) return;
  const rows = await query<{ emailaddress: string | null; emailencrypted: string | null }>(
    `SELECT u.emailaddress, u.emailencrypted
     FROM users u
     JOIN groupmembers gm ON gm.userid = u.guid AND gm.groupid = $2
     WHERE u.guid = ANY($1::UUID[])
       AND COALESCE(gm.emailalertsenabled, TRUE) = TRUE`,
    [args.recipientUserIds, args.groupId]
  );
  await Promise.all(rows
    .map((row) => publicEmail(row.emailencrypted, row.emailaddress))
    .filter((email): email is string => Boolean(email))
    .map((email) => sendGameCancelledEmailMessage(
      email,
      args.gameTitle,
      args.groupName ?? null,
      args.startsAt ?? null
    )));
}

async function sendGameCancelledPush(args: GameCancelledArgs): Promise<void> {
  if (args.recipientUserIds.length === 0) return;
  const rows = await query<{ userid: string }>(
    `SELECT userid
     FROM groupmembers
     WHERE groupid = $2
       AND userid = ANY($1::UUID[])
       AND COALESCE(pushalertsenabled, TRUE) = TRUE`,
    [args.recipientUserIds, args.groupId]
  );
  await sendNotificationToUsers(rows.map((row) => row.userid), 'tournament_cancelled', {
    title: 'Cash game cancelled',
    body: `${args.gameTitle} has been cancelled.`,
    url: '/',
    tag: `game-${args.gameId}-cancelled`,
    groupId: args.groupId,
    entityId: args.gameId,
    tournamentName: args.gameTitle,
  }, {
    entityType: 'game',
    entityId: args.gameId,
    skipPreferences: true,
  });
}
