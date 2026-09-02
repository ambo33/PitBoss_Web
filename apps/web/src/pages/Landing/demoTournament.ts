export const CINEMATIC_DEMO_DURATION_MS = 24_000;

export const CINEMATIC_DEMO_POSTER_TIME_MS = 17_200;

export type CinematicDemoSceneId = 'build' | 'run' | 'manage' | 'music' | 'win' | 'finale';

export interface CinematicDemoScene {
  id: CinematicDemoSceneId;
  label: string;
  startMs: number;
  endMs: number;
}

export const CINEMATIC_DEMO_SCENES: readonly CinematicDemoScene[] = [
  { id: 'build', label: 'Build', startMs: 0, endMs: 4_000 },
  { id: 'run', label: 'Run', startMs: 4_000, endMs: 10_000 },
  { id: 'manage', label: 'Manage', startMs: 10_000, endMs: 14_000 },
  { id: 'music', label: 'Music', startMs: 14_000, endMs: 19_000 },
  { id: 'win', label: 'Win', startMs: 19_000, endMs: 22_000 },
  { id: 'finale', label: 'Finale', startMs: 22_000, endMs: CINEMATIC_DEMO_DURATION_MS },
];

export const cinematicDemoTournament = {
  name: 'Saturday Championship',
  playerCount: 54,
  playersRemaining: 34,
  startingStack: 20_000,
  blindStructure: 'Standard',
  prizePool: 2_750,
  firstPrize: 1_250,
  earlyLevel: {
    number: 1,
    time: '20:00',
    smallBlind: 100,
    bigBlind: 200,
  },
  liveLevel: {
    number: 4,
    time: '18:42',
    smallBlind: 300,
    bigBlind: 600,
  },
  blindLevels: [
    { level: 2, blinds: '150 / 300' },
    { level: 3, blinds: '200 / 400' },
    { level: 4, blinds: '300 / 600' },
    { level: 5, blinds: '400 / 800' },
    { level: 6, blinds: '500 / 1,000' },
  ],
  payouts: [
    { place: '1st', amount: '$1,250' },
    { place: '2nd', amount: '$750' },
    { place: '3rd', amount: '$450' },
  ],
  activity: [
    { kind: 'buy-in', player: 'Alex', detail: 'bought in' },
    { kind: 'rebuy', player: 'Chris', detail: 'rebuy +1' },
    { kind: 'elimination', player: 'Jordan', detail: 'eliminated — 8th' },
  ],
  players: [
    { name: 'Alex', stack: '62.4K', status: 'Chip leader' },
    { name: 'Sam', stack: '41.8K', status: 'Table 2' },
    { name: 'Chris', stack: '30.1K', status: 'Rebuy +1' },
    { name: 'Jordan', stack: '—', status: 'Finished 8th' },
  ],
  requestedTrack: {
    title: 'Mr. Brightside',
    artist: 'The Killers',
    requestedBy: 'Alex',
  },
  currentTrack: {
    title: 'Mr. Brightside',
    artist: 'The Killers',
  },
  winner: {
    name: 'Alex',
    prize: '$1,250',
  },
} as const;

export function getCinematicDemoScene(elapsedMs: number): CinematicDemoScene {
  const boundedElapsed = Math.max(0, Math.min(elapsedMs, CINEMATIC_DEMO_DURATION_MS));
  return CINEMATIC_DEMO_SCENES.find((scene) => boundedElapsed < scene.endMs)
    ?? CINEMATIC_DEMO_SCENES[CINEMATIC_DEMO_SCENES.length - 1];
}
