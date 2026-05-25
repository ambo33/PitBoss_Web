export const NOTIFICATION_TYPES = [
  'tournament_starting_soon',
  'tournament_registration_closing',
  'tournament_schedule_changed',
  'tournament_location_changed',
  'tournament_cancelled',
  'host_announcement_posted',
  'blinds_level_up',
  'break_started',
  'break_ending_soon',
  'rebuy_period_ending',
  'addon_window_open',
  'table_assignment',
  'seat_assignment',
  'table_redraw',
  'final_table_reached',
  'player_check_in_requested',
  'player_check_in_confirmed',
  'player_waitlist_spot_open',
  'rebuy_request_sent',
  'addon_request_sent',
  'knockout_recorded',
  'bounty_earned',
  'mystery_bounty_unlocked',
  'achievement_earned',
  'tournament_finalized',
  'league_standings_updated',
  'league_rank_changed',
  'season_milestone',
  'new_tournament_created',
  'seats_almost_full',
  'test_notification',
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

export const NOTIFICATION_CATEGORIES = [
  'essential',
  'tournament_play',
  'bounties_achievements',
  'league',
  'social',
] as const;

export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

export const NOTIFICATION_CATEGORY_META: Record<NotificationCategory, {
  label: string;
  description: string;
  example: string;
  defaultEnabled: boolean;
}> = {
  essential: {
    label: 'Essential Alerts',
    description: 'Schedule changes, cancellations, host announcements, and seat assignments.',
    example: 'Seat assignment: Table 2, Seat 4.',
    defaultEnabled: true,
  },
  tournament_play: {
    label: 'Tournament Play',
    description: 'Blind changes, breaks, check-ins, rebuys, add-ons, and tournament reminders.',
    example: 'Blinds are going up: Level 4 is 200 / 400.',
    defaultEnabled: true,
  },
  bounties_achievements: {
    label: 'Bounties & Achievements',
    description: 'Knockouts, bounties, mystery bounties, and badges.',
    example: 'Bounty earned: You claimed a bounty.',
    defaultEnabled: true,
  },
  league: {
    label: 'League Updates',
    description: 'Results, standings, rank changes, and season updates.',
    example: 'Standings updated for your league.',
    defaultEnabled: true,
  },
  social: {
    label: 'Social Nudges',
    description: 'New games, seats filling up, and club activity.',
    example: 'New tournament posted in your group.',
    defaultEnabled: false,
  },
};

export const NOTIFICATION_TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  tournament_schedule_changed: 'essential',
  tournament_location_changed: 'essential',
  tournament_cancelled: 'essential',
  host_announcement_posted: 'essential',
  table_assignment: 'essential',
  seat_assignment: 'essential',
  table_redraw: 'essential',
  final_table_reached: 'essential',

  tournament_starting_soon: 'tournament_play',
  tournament_registration_closing: 'tournament_play',
  blinds_level_up: 'tournament_play',
  break_started: 'tournament_play',
  break_ending_soon: 'tournament_play',
  rebuy_period_ending: 'tournament_play',
  addon_window_open: 'tournament_play',
  player_check_in_requested: 'tournament_play',
  player_check_in_confirmed: 'tournament_play',
  player_waitlist_spot_open: 'tournament_play',
  rebuy_request_sent: 'tournament_play',
  addon_request_sent: 'tournament_play',

  knockout_recorded: 'bounties_achievements',
  bounty_earned: 'bounties_achievements',
  mystery_bounty_unlocked: 'bounties_achievements',
  achievement_earned: 'bounties_achievements',

  tournament_finalized: 'league',
  league_standings_updated: 'league',
  league_rank_changed: 'league',
  season_milestone: 'league',

  new_tournament_created: 'social',
  seats_almost_full: 'social',

  test_notification: 'essential',
};

const notificationTypeSet = new Set<string>(NOTIFICATION_TYPES);
const notificationCategorySet = new Set<string>(NOTIFICATION_CATEGORIES);

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && notificationTypeSet.has(value);
}

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === 'string' && notificationCategorySet.has(value);
}
