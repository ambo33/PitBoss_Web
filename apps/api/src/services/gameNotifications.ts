type GameCreatedArgs = {
  gameId: string;
  groupId: string;
  gameTitle: string;
  gameType: 'tournament' | 'cash';
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

async function sendGameCreatedEmail(args: GameCreatedArgs): Promise<void> {
  // Hook point for the existing email pipeline. This is intentionally non-blocking
  // so game creation never fails because alerts are temporarily unavailable.
  console.info('Game created email stub', {
    gameId: args.gameId,
    groupId: args.groupId,
    gameType: args.gameType,
    recipients: args.recipientUserIds.length,
  });
}

async function sendGameCreatedPush(args: GameCreatedArgs): Promise<void> {
  // Hook point for the existing push notification service.
  console.info('Game created push stub', {
    gameId: args.gameId,
    groupId: args.groupId,
    gameType: args.gameType,
    recipients: args.recipientUserIds.length,
  });
}
