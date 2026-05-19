export interface DefaultCoinPreset {
  key: string;
  name: string;
  description: string;
  imageurl: string;
}

export const DEFAULT_COIN_PRESETS: DefaultCoinPreset[] = [
  { key: 'river-rat', name: 'River Rat', description: 'Won it or ruined it on the river.', imageurl: '/challenge-coins/defaults/river-rat.svg' },
  { key: 'bully', name: 'Bully', description: 'Applied pressure and made the table feel it.', imageurl: '/challenge-coins/defaults/bully.svg' },
  { key: 'card-chaser', name: 'Card Chaser', description: 'Kept chasing and found the magic card.', imageurl: '/challenge-coins/defaults/card-chaser.svg' },
  { key: 'royal-highness', name: 'Royal Highness', description: 'Royal-flush energy for the table legend.', imageurl: '/challenge-coins/defaults/royal-highness.svg' },
  { key: 'straight-flusher', name: 'Straight Flusher', description: 'For the monster straight flush moment.', imageurl: '/challenge-coins/defaults/straight-flusher.svg' },
  { key: 'blast-off', name: 'Blast Off', description: 'First to bust, gone with style.', imageurl: '/challenge-coins/defaults/blast-off.svg' },
  { key: 'the-magician', name: 'The Magician', description: 'Pulled it out when nobody believed.', imageurl: '/challenge-coins/defaults/the-magician.svg' },
  { key: 'big-stack', name: 'Big Stack', description: 'Chip leader vibes.', imageurl: '/challenge-coins/defaults/big-stack.svg' },
  { key: 'lockdown', name: 'Lockdown', description: 'Tight, patient, and hard to crack.', imageurl: '/challenge-coins/defaults/lockdown.svg' },
  { key: 'hot-streak', name: 'Hot Streak', description: 'On fire for the night.', imageurl: '/challenge-coins/defaults/hot-streak.svg' },
  { key: 'bounty-hunter', name: 'Bounty Hunter', description: 'Knockout king.', imageurl: '/challenge-coins/defaults/bounty-hunter.svg' },
  { key: 'lucky-dog', name: 'Lucky Dog', description: 'Running good and knows it.', imageurl: '/challenge-coins/defaults/lucky-dog.svg' },
  { key: 'pocket-rockets', name: 'Pocket Rockets', description: 'Aces cracked or aces celebrated.', imageurl: '/challenge-coins/defaults/pocket-rockets.svg' },
  { key: 'table-talker', name: 'Table Talker', description: 'Loudest mouth at the table.', imageurl: '/challenge-coins/defaults/table-talker.svg' },
  { key: 'last-man-standing', name: 'Last Man Standing', description: 'Tournament champion.', imageurl: '/challenge-coins/defaults/last-man-standing.svg' },
];
