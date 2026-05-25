import { NotificationType } from './types';

export type NotificationTemplateData = Record<string, unknown>;

export type BuiltNotificationPayload = {
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  tag: string;
  icon: string;
  badge: string;
  data: Record<string, unknown>;
};

type NotificationTemplate = {
  title: string;
  body: string;
};

export const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  tournament_starting_soon: {
    title: '{tournamentName} starts soon',
    body: 'Cards fly in {minutesUntilStart} minutes.',
  },
  tournament_registration_closing: {
    title: 'Registration closing soon',
    body: 'Late registration for {tournamentName} closes in {minutesRemaining} minutes.',
  },
  tournament_schedule_changed: {
    title: 'Tournament time changed',
    body: '{tournamentName} now starts at {newStartTime}.',
  },
  tournament_location_changed: {
    title: 'Location changed',
    body: '{tournamentName} moved to {locationName}.',
  },
  tournament_cancelled: {
    title: 'Tournament cancelled',
    body: '{tournamentName} has been cancelled.',
  },
  host_announcement_posted: {
    title: 'Host announcement',
    body: '{announcementPreview}',
  },
  blinds_level_up: {
    title: 'Blinds are going up',
    body: 'Level {levelNumber}: {smallBlind} / {bigBlind}{anteText}',
  },
  break_started: {
    title: 'Break started',
    body: '{breakMinutes}-minute break. Next level starts soon.',
  },
  break_ending_soon: {
    title: 'Break ending soon',
    body: 'Play resumes in {minutesRemaining} minutes.',
  },
  rebuy_period_ending: {
    title: 'Rebuy period ending',
    body: 'Last chance for rebuys in {minutesRemaining} minutes.',
  },
  addon_window_open: {
    title: 'Add-on window open',
    body: 'Add-ons are available now.',
  },
  table_assignment: {
    title: 'Table assignment',
    body: 'You are assigned to Table {tableNumber}.',
  },
  seat_assignment: {
    title: 'Seat assignment',
    body: 'You are assigned to Table {tableNumber}, Seat {seatNumber}.',
  },
  table_redraw: {
    title: 'Table redraw complete',
    body: 'Check your new table and seat.',
  },
  final_table_reached: {
    title: 'Final table reached',
    body: 'You made the final table. Check your seat.',
  },
  player_check_in_requested: {
    title: 'Confirm you are playing',
    body: 'Tap to check in for {tournamentName}.',
  },
  player_check_in_confirmed: {
    title: 'You are checked in',
    body: 'You are confirmed for {tournamentName}.',
  },
  player_waitlist_spot_open: {
    title: 'Seat available',
    body: 'A spot opened for {tournamentName}.',
  },
  rebuy_request_sent: {
    title: 'Rebuy request sent',
    body: 'Your rebuy request was sent to the host.',
  },
  addon_request_sent: {
    title: 'Add-on request sent',
    body: 'Your add-on request was sent to the host.',
  },
  knockout_recorded: {
    title: 'Knockout recorded',
    body: 'You knocked out {playerName}.',
  },
  bounty_earned: {
    title: 'Bounty earned',
    body: 'You earned a bounty.',
  },
  mystery_bounty_unlocked: {
    title: 'Mystery bounty unlocked',
    body: 'Your mystery bounty has been revealed.',
  },
  achievement_earned: {
    title: '{achievementName} earned',
    body: '{achievementDescription}',
  },
  tournament_finalized: {
    title: 'Results posted',
    body: '{tournamentName} results are final.',
  },
  league_standings_updated: {
    title: 'Standings updated',
    body: '{leagueName} standings have been updated.',
  },
  league_rank_changed: {
    title: 'Your rank changed',
    body: 'You are now #{rank} in {leagueName}.',
  },
  season_milestone: {
    title: 'Season update',
    body: '{message}',
  },
  new_tournament_created: {
    title: 'New tournament posted',
    body: '{tournamentName} is now open.',
  },
  seats_almost_full: {
    title: 'Almost full',
    body: 'Only {seatsRemaining} seats left for {tournamentName}.',
  },
  test_notification: {
    title: 'ThePokerPlanner alerts enabled',
    body: "You'll get tournament updates here.",
  },
};

function stringValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : '';
  return String(value);
}

function fillTemplate(template: string, data: NotificationTemplateData): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => stringValue(data[key]));
}

function entityUrl(type: NotificationType, data: NotificationTemplateData): string {
  if (typeof data.url === 'string' && data.url.trim()) return data.url.trim();
  const tournamentId = stringValue(data.tournamentId);
  const leagueId = stringValue(data.leagueId);
  const groupId = stringValue(data.groupId ?? data.clubId);
  if (tournamentId) {
    if (type === 'seat_assignment' || type === 'table_assignment' || type === 'player_check_in_requested') {
      return `/lobby/${tournamentId}`;
    }
    return `/tournaments/${tournamentId}`;
  }
  if (leagueId) return `/leagues/${leagueId}`;
  if (groupId) return `/groups/${groupId}`;
  return '/';
}

function entityTag(type: NotificationType, data: NotificationTemplateData): string {
  if (typeof data.tag === 'string' && data.tag.trim()) return data.tag.trim();
  const tournamentId = stringValue(data.tournamentId);
  const leagueId = stringValue(data.leagueId);
  const groupId = stringValue(data.groupId ?? data.clubId);
  const userId = stringValue(data.userId);
  const entityId = stringValue(data.entityId);
  const levelNumber = stringValue(data.levelNumber);
  const minutesRemaining = stringValue(data.minutesRemaining);
  if (type === 'blinds_level_up' && tournamentId && levelNumber) return `tournament-${tournamentId}-level-${levelNumber}`;
  if (type === 'break_started' && tournamentId && levelNumber) return `tournament-${tournamentId}-break-${levelNumber}`;
  if (type === 'break_ending_soon' && tournamentId) return `tournament-${tournamentId}-break-ending-${minutesRemaining || 'soon'}`;
  if (type === 'rebuy_period_ending' && tournamentId) return `tournament-${tournamentId}-rebuy-ending-${minutesRemaining || 'soon'}`;
  if ((type === 'seat_assignment' || type === 'table_assignment') && tournamentId && userId) return `tournament-${tournamentId}-${type}-${userId}`;
  if (tournamentId) return `tournament-${tournamentId}-${type}${entityId ? `-${entityId}` : ''}`;
  if (leagueId) return `league-${leagueId}-${type}${entityId ? `-${entityId}` : ''}`;
  if (groupId) return `group-${groupId}-${type}${entityId ? `-${entityId}` : ''}`;
  return type;
}

export function buildNotificationPayload(
  type: NotificationType,
  rawData: NotificationTemplateData = {}
): BuiltNotificationPayload {
  const data = {
    tournamentName: 'Tournament',
    leagueName: 'League',
    minutesUntilStart: '10',
    minutesRemaining: '10',
    newStartTime: 'the updated time',
    locationName: 'the new location',
    announcementPreview: 'A new announcement was posted.',
    levelNumber: '',
    smallBlind: '',
    bigBlind: '',
    anteText: rawData.ante ? `, ante ${stringValue(rawData.ante)}` : '',
    breakMinutes: '5',
    tableNumber: '',
    seatNumber: '',
    playerName: 'a player',
    achievementName: 'Achievement',
    achievementDescription: 'Nice work.',
    rank: '',
    message: 'The season has been updated.',
    seatsRemaining: '',
    ...rawData,
  };
  const template = NOTIFICATION_TEMPLATES[type];
  const customTitle = typeof rawData.title === 'string' && rawData.title.trim() ? rawData.title.trim() : null;
  const customBody = typeof rawData.body === 'string' && rawData.body.trim() ? rawData.body.trim() : null;
  return {
    type,
    title: (customTitle ?? fillTemplate(template.title, data)).replace(/\s+/g, ' ').trim(),
    body: (customBody ?? fillTemplate(template.body, data)).replace(/\s+/g, ' ').trim(),
    url: entityUrl(type, data),
    tag: entityTag(type, data),
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { ...data, type },
  };
}
