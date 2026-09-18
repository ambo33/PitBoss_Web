import assert from 'node:assert/strict';
import { generateBlindStructure, type BlindCalculatorInput } from './blindCalculator';

const defaults: BlindCalculatorInput = {
  players: 8,
  startingStack: 10000,
  targetHours: 3,
  levelMinutes: 15,
  startingBigBlind: 50,
  chipDenominations: '100,250,1000',
  finishBigBlinds: 20,
  breakCount: 2,
  breakMinutes: 10,
  anteStartLevel: 1,
  colorUps: '',
};

// Independent coin-sum check: divisibility alone does not establish payability.
function payableAmounts(chips: number[], maximum: number): Uint8Array {
  const payable = new Uint8Array(maximum + 1);
  payable[0] = 1;
  for (let amount = 1; amount <= maximum; amount += 1) {
    payable[amount] = Number(chips.some((chip) => chip <= amount && payable[amount - chip]));
  }
  return payable;
}

const cases: Array<{ name: string; settings: Partial<BlindCalculatorInput> }> = [
  { name: 'unavailable GCD chip', settings: {} },
  { name: 'coprime chips', settings: { chipDenominations: '7,11', startingBigBlind: 2 } },
  { name: 'rounding and increasing levels', settings: { startingBigBlind: 301, startingStack: 100 } },
  { name: 'explicit chip-ups', settings: { chipDenominations: '25,100,250,1000', colorUps: '25@2,100@4' } },
  { name: 'automatic chip-ups', settings: { chipDenominations: '25,100,250,1000', colorUps: '25,100' } },
  { name: 'all chips selected for chip-up', settings: { chipDenominations: '100,250', colorUps: '100@2,250@3' } },
  { name: 'single chip stays available', settings: { chipDenominations: '250', colorUps: '250' } },
  { name: 'standard chips', settings: { chipDenominations: '25,50,100,500,1000,5000', colorUps: '25,50' } },
];

for (const { name, settings } of cases) {
  const input = { ...defaults, ...settings };
  const levels = generateBlindStructure(input);
  let activeChips = input.chipDenominations.split(',').map(Number);
  const maximum = Math.max(...levels.map((level) => level.bigblind));
  let payable = payableAmounts(activeChips, maximum);
  let previousBigBlind = 0;
  for (const level of levels) {
    if (level.label.startsWith('Chip up ')) {
      const removed = level.label.slice('Chip up '.length).split(', ').map((chip) => Number(chip.replace(/[,s]/g, '')));
      activeChips = activeChips.filter((chip) => !removed.includes(chip));
      assert.ok(activeChips.length > 0, `${name}: must retain a chip denomination`);
      payable = payableAmounts(activeChips, maximum);
    }
    for (const amount of [level.smallblind, level.bigblind, level.ante]) {
      assert.equal(payable[amount], 1, `${name}: ${level.label} amount ${amount} cannot be paid with ${activeChips}`);
    }
    if (level.bigblind === 0) continue;
    assert.equal(level.bigblind, level.smallblind * 2);
    assert.ok(level.bigblind > previousBigBlind, `${name}: blinds must increase`);
    assert.equal(level.ante, level.bigblind);
    previousBigBlind = level.bigblind;
  }
  assert.ok(previousBigBlind > 0);
  console.log(`PASS ${name}`);
}

const opening = generateBlindStructure(defaults)[0];
assert.equal(opening.smallblind, 100);
assert.equal(opening.bigblind, 200);
console.log('Blind calculator regression checks passed.');
