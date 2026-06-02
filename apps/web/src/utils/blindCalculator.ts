export interface GeneratedBlindLevel {
  level: number;
  label: string;
  smallblind: number;
  bigblind: number;
  ante: number;
  minutes: number;
  islastlevel: boolean;
}

export interface BlindCalculatorInput {
  players: number;
  startingStack: number;
  targetHours: number;
  levelMinutes: number;
  startingBigBlind: number;
  chipDenominations: string;
  finishBigBlinds: number;
  breakCount: number;
  breakMinutes: number;
  anteStartLevel: number;
  expectedRebuys?: number;
  expectedAddons?: number;
  rebuyChips?: number;
  addonChips?: number;
  colorUps?: string;
}

interface ColorUpRule {
  denomination: number;
  level: number;
}

export const DEFAULT_CHIP_DENOMINATIONS = '25,50,100,500,1000,5000';
export const DEFAULT_COLOR_UPS = defaultChipUpDenominations(DEFAULT_CHIP_DENOMINATIONS);

export function calculateTotalChips(settings: Pick<BlindCalculatorInput, 'players' | 'startingStack' | 'expectedRebuys' | 'expectedAddons' | 'rebuyChips' | 'addonChips'>) {
  return (
    Math.max(settings.players || 0, 2) * Math.max(settings.startingStack || 0, 100)
    + Math.max(settings.expectedRebuys || 0, 0) * Math.max(settings.rebuyChips || 0, 0)
    + Math.max(settings.expectedAddons || 0, 0) * Math.max(settings.addonChips || 0, 0)
  );
}

export function parseChipDenominations(value: string): number[] {
  const parsed = value
    .split(/[,;\s]+/)
    .map((piece) => Math.round(Number(piece.trim())))
    .filter((denomination) => Number.isFinite(denomination) && denomination > 0);
  const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
  return unique.length > 0 ? unique : [25, 50, 100, 500, 1000];
}

export function generateBlindStructure(settings: BlindCalculatorInput): GeneratedBlindLevel[] {
  const safePlayers = Math.max(settings.players || 0, 2);
  const safeStack = Math.max(settings.startingStack || 0, 100);
  const safeMinutes = Math.max(settings.levelMinutes || 0, 1);
  const safeHours = Math.max(settings.targetHours || 0, 0.5);
  const safeBreakCount = clamp(Math.floor(settings.breakCount || 0), 0, 10);
  const safeBreakMinutes = Math.max(settings.breakMinutes || 0, 1);
  const denominations = parseChipDenominations(settings.chipDenominations);
  const baseIncrement = chipIncrementForLevel(1, denominations, []);
  const playMinutes = Math.max((safeHours * 60) - (safeBreakCount * safeBreakMinutes), safeMinutes * 4);
  const levelCount = clamp(Math.round(playMinutes / safeMinutes), 4, 30);
  const colorUps = parseColorUps(settings.colorUps ?? '', denominations, levelCount);
  const startBigBlind = normalizeBlindPair(Math.max(settings.startingBigBlind || 0, baseIncrement * 2), baseIncrement).bigblind;
  const totalChips = calculateTotalChips({
    players: safePlayers,
    startingStack: safeStack,
    expectedRebuys: settings.expectedRebuys,
    expectedAddons: settings.expectedAddons,
    rebuyChips: settings.rebuyChips,
    addonChips: settings.addonChips,
  });
  const endingBigBlind = totalChips / Math.max(settings.finishBigBlinds || 0, 4);
  const targetIncrement = chipIncrementForLevel(levelCount, denominations, colorUps);
  const targetBigBlind = Math.max(startBigBlind, normalizeBlindPair(endingBigBlind, targetIncrement).bigblind);
  const growthFactor = levelCount <= 1 ? 1 : Math.pow(targetBigBlind / startBigBlind, 1 / (levelCount - 1));

  let previousBigBlind = 0;
  const blindLevels = Array.from({ length: levelCount }, (_unused, index) => {
    const level = index + 1;
    const increment = chipIncrementForLevel(level, denominations, colorUps);
    const rawBigBlind = startBigBlind * Math.pow(growthFactor, index);
    let { smallblind, bigblind } = normalizeBlindPair(rawBigBlind, increment);
    while (bigblind <= previousBigBlind) {
      smallblind += increment;
      bigblind = smallblind * 2;
    }
    previousBigBlind = bigblind;

    return {
      level,
      label: `Level ${level}`,
      smallblind,
      bigblind,
      ante: settings.anteStartLevel > 0 && level >= settings.anteStartLevel ? bigblind : 0,
      minutes: safeMinutes,
      islastlevel: level === levelCount,
    };
  });

  const levelsWithBreaks: GeneratedBlindLevel[] = [];
  const spacing = Math.max(1, Math.floor(levelCount / (safeBreakCount + 1)));
  let breaksAdded = 0;
  blindLevels.forEach((blind, index) => {
    levelsWithBreaks.push(blind);
    if (index >= blindLevels.length - 1) return;

    const nextBlindLevel = index + 2;
    const shouldAddBreak = breaksAdded < safeBreakCount
      && (index + 1) >= spacing * (breaksAdded + 1);
    const colorUpNote = colorUps
      .filter((rule) => rule.level === nextBlindLevel)
      .map((rule) => `${rule.denomination.toLocaleString()}s`)
      .join(', ');

    if (colorUpNote) {
      levelsWithBreaks.push({
        level: levelsWithBreaks.length + 1,
        label: `Chip up ${colorUpNote}`,
        smallblind: 0,
        bigblind: 0,
        ante: 0,
        minutes: 0,
        islastlevel: false,
      });
    }

    if (shouldAddBreak) {
      levelsWithBreaks.push({
        level: levelsWithBreaks.length + 1,
        label: `Break ${breaksAdded + 1}`,
        smallblind: 0,
        bigblind: 0,
        ante: 0,
        minutes: safeBreakMinutes,
        islastlevel: false,
      });
      breaksAdded += 1;
    }
  });

  return levelsWithBreaks.map((level, index) => ({
    ...level,
    level: index + 1,
    label: isBreakLevel(level) ? level.label : `Level ${index + 1}`,
    islastlevel: index === levelsWithBreaks.length - 1,
  }));
}

export function defaultChipUpDenominations(chipDenominations: string): string {
  const denominations = parseChipDenominations(chipDenominations);
  return denominations.slice(0, 2).join(',');
}

function parseColorUps(value: string, denominations: number[], levelCount: number): ColorUpRule[] {
  const selected = parseColorUpPieces(value, denominations);
  if (selected.length === 0) return [];
  const automaticLevels = buildAutomaticColorUpLevels(selected.length, levelCount);
  return selected
    .map((piece, index) => ({
      denomination: piece.denomination,
      level: piece.level ?? automaticLevels[index] ?? automaticLevels[automaticLevels.length - 1] ?? 2,
    }))
    .sort((a, b) => a.level - b.level || a.denomination - b.denomination);
}

function parseColorUpPieces(value: string, denominations: number[]): Array<{ denomination: number; level?: number }> {
  const allowed = new Set(denominations);
  const byDenomination = new Map<number, { denomination: number; level?: number }>();
  value
    .split(/[,;\n]+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .forEach((piece) => {
      const explicitLevelMatch = piece.match(/^(\d+(?:\.\d+)?)\s*(?:@|:|level|lvl|l)\s*(\d+)$/i);
      const denomination = Math.round(Number(explicitLevelMatch?.[1] ?? piece));
      const level = explicitLevelMatch ? Math.floor(Number(explicitLevelMatch[2])) : undefined;
      if (!allowed.has(denomination) || (level !== undefined && level < 2)) return;
      byDenomination.set(denomination, { denomination, level });
    });
  return [...byDenomination.values()].sort((a, b) => a.denomination - b.denomination);
}

function buildAutomaticColorUpLevels(count: number, levelCount: number): number[] {
  if (count <= 0 || levelCount < 4) return [];
  const firstLevel = clamp(Math.floor(levelCount * 0.3) + 1, 2, levelCount);
  const secondLevel = clamp(Math.floor(levelCount * 0.6) + 1, firstLevel + 1, levelCount);
  if (count === 1) return [firstLevel];
  return Array.from({ length: count }, (_unused, index) => {
    if (index === 0) return firstLevel;
    if (index === 1) return secondLevel;
    return clamp(secondLevel + index - 1, firstLevel + 1, levelCount);
  });
}

function chipIncrementForLevel(level: number, denominations: number[], colorUps: ColorUpRule[]) {
  const active = denominations.filter((denomination) => !colorUps.some((rule) => rule.denomination === denomination && level >= rule.level));
  const candidates = active.length > 0 ? active : denominations.slice(-1);
  return Math.max(1, candidates.reduce((currentGcd, denomination) => gcd(currentGcd, denomination), candidates[0] ?? 1));
}

function normalizeBlindPair(rawBigBlind: number, increment: number) {
  const safeIncrement = Math.max(1, increment);
  const smallblind = Math.max(safeIncrement, Math.round((rawBigBlind / 2) / safeIncrement) * safeIncrement);
  return {
    smallblind,
    bigblind: smallblind * 2,
  };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isBreakLevel(level: Pick<GeneratedBlindLevel, 'label' | 'smallblind' | 'bigblind'>): boolean {
  return /^break\b/i.test(String(level.label ?? '')) || (Number(level.smallblind) === 0 && Number(level.bigblind) === 0);
}
