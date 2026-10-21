import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loadKnockoutDetails } from './helpers/knockout-notification-harness';
import { getConfiguredBountyPool } from '../../web/src/utils/bountyMath';

const snapshot = {
  payoutstructure: JSON.stringify({ mode: 'count', value: 3 }),
  buyin: 50, rebuyprice: 50, addonprice: 20, genericrebuys: 0, genericaddons: 0,
  rake: 0, bountyenabled: false, bountymode: 'manual', bountyprizepool: 0,
  bountypooltype: 'amount', bountyroundingdenomination: 5, bountystartplace: null,
  registeredcount: 10, enteredcount: 10, activecount: 3, winnercount: 0, totalrebuys: 0, totaladdons: 0,
};
const options = { playerName: 'Alex', placed: 4, tournamentId: 't-1' };

test('knockout and credited-player messages include ordinal placement and the next actual cash payout', async () => {
  const calls: string[] = [];
  const service = loadKnockoutDetails(async (sql, params) => {
    calls.push(sql);
    assert.deepEqual([...params], ['t-1']);
    assert.match(sql, /checkedin = TRUE AND placed IS NULL/);
    assert.match(sql, /FROM tournaments t/);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\b/);
    return snapshot;
  });
  const result = await service.knockoutNotificationDetails(options);
  assert.equal(result.body, 'Alex was knocked out in 4th place. Next knockout payout: $100.');
  assert.equal(result.creditBody, 'You knocked out Alex in 4th place. Next knockout payout: $100.');
  assert.equal(result.placed, 4);
  assert.equal(result.nextPaidPlace, 3);
  assert.equal(result.nextPayout, 100);
  assert.equal(calls.length, 1);
});

test('a league-only finish includes placement and never invents a tournament cash prize', async () => {
  const service = loadKnockoutDetails(async () => { throw new Error('Must not query tournament payouts'); });
  const result = await service.knockoutNotificationDetails({ playerName: 'Alex', placed: 12, eventName: 'Event #2' });
  assert.equal(result.body, 'Alex was knocked out of Event #2 in 12th place.');
  assert.equal(result.nextPaidPlace, undefined);
  assert.equal(service.errors.length, 0);
});

test('unpaid next places, finished tournaments and empty prize pools do not claim money', async () => {
  for (const patch of [
    { activecount: 4 }, { activecount: 1 }, { activecount: 0 }, { winnercount: 1 },
    { buyin: 0 }, { rake: 500 }, { bountyenabled: true, bountyprizepool: 100 },
    { payoutstructure: JSON.stringify({ mode: 'count', value: 3, roundingdenomination: 25 }), buyin: 1 },
  ]) {
    const service = loadKnockoutDetails(async () => ({ ...snapshot, ...patch }));
    const result = await service.knockoutNotificationDetails(options);
    assert.equal(result.body, 'Alex was knocked out in 4th place.', JSON.stringify(patch));
    assert.equal(result.nextPayout, undefined);
  }
});

test('next place is taken from the current active field, not assumed to be placement minus one', async () => {
  const service = loadKnockoutDetails(async () => ({ ...snapshot, activecount: 2 }));
  const result = await service.knockoutNotificationDetails({ ...options, placed: 7 });
  assert.equal(result.nextPaidPlace, 2);
  assert.equal(result.nextPayout, 150);
});

test('percent payouts use the entered field rather than unchecked registrations', async () => {
  const service = loadKnockoutDetails(async () => ({
    ...snapshot, registeredcount: 100, payoutstructure: JSON.stringify({ mode: 'percent', value: 25 }),
  }));
  const result = await service.knockoutNotificationDetails(options);
  assert.equal(result.nextPayout, 100);
});

test('default payout settings and database numeric strings retain the live runner amounts', async () => {
  const service = loadKnockoutDetails(async () => ({
    ...snapshot, payoutstructure: null, buyin: '50.00', enteredcount: '10', activecount: '3',
  }));
  assert.equal((await service.knockoutNotificationDetails(options)).nextPayout, 100);
});

test('lookup failures and malformed payout settings preserve the knockout announcement', async () => {
  for (const config of ['{bad', 'null', '[]', '{"mode":"other","value":3}', '{"mode":"count","value":"bad"}']) {
    const service = loadKnockoutDetails(async () => ({ ...snapshot, payoutstructure: config }));
    assert.equal((await service.knockoutNotificationDetails(options)).body, 'Alex was knocked out in 4th place.');
  }
  const failed = loadKnockoutDetails(async () => { throw new Error('Synthetic read failure'); });
  assert.equal((await failed.knockoutNotificationDetails(options)).body, 'Alex was knocked out in 4th place.');
  assert.equal(failed.errors.length, 1);
  const missing = loadKnockoutDetails(async () => null);
  assert.equal((await missing.knockoutNotificationDetails(options)).nextPaidPlace, undefined);
});

test('ordinal labels handle teens and larger fields', () => {
  const service = loadKnockoutDetails(async () => null);
  for (const [place, label] of [[2, '2nd'], [3, '3rd'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [23, '23rd'], [111, '111th']] as const) {
    assert.equal(service.ordinalPlace(place), label);
  }
});

test('notification amounts match the existing live runner across payout modes, rounding, rebuys and bounties', () => {
  // Extract only pure payout functions; never mount the runner or its API/socket hooks.
  const source = readFileSync(path.join(__dirname, '../../web/src/pages/PreTournament/RunTournament.tsx'), 'utf8');
  const ast = ts.createSourceFile('RunTournament.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(['parsePayoutStructure', 'sanitizePayoutValue', 'sanitizePayoutRounding', 'resolvePaidPlaces', 'clamp', 'buildRoundedPayouts', 'roundCurrency', 'buildDefaultSplits', 'roundToTenth']);
  const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? '')
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'DEFAULT_SPLITS'));
  assert.equal(nodes.length, names.size + 1);
  const exports = {} as { payouts: (pot: number, config: string | null, field: number) => number[] };
  const pureSource = nodes.map(node => node.getText(ast)).join('\n')
    + '\nexports.payouts = (pot, config, field) => { const c = parsePayoutStructure(config); return buildRoundedPayouts(pot, buildDefaultSplits(resolvePaidPlaces(c, field)), c.roundingdenomination); };';
  vm.runInNewContext(ts.transpileModule(pureSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
  const service = loadKnockoutDetails(async () => null);
  const players = Array.from({ length: 12 }, (_, index) => ({
    checkedin: index < 10, placed: index >= 3 && index < 10 ? index + 1 : null,
    bountyamount: 0, bountyclaimedat: null,
  }));
  let comparisons = 0;
  for (const mode of ['count', 'percent']) for (const value of mode === 'count' ? [3, 7] : [25, 60]) {
    for (const roundingdenomination of [0, 1, 5, 10, 25]) for (const bounty of [
      { bountyenabled: false },
      { bountyenabled: true, bountymode: 'manual', bountyprizepool: 10 },
      { bountyenabled: true, bountymode: 'manual', bountyprizepool: 10, bountystartplace: 5 },
      { bountyenabled: true, bountymode: 'mystery', bountypooltype: 'percent', bountyprizepool: 25 },
      { bountyenabled: true, bountymode: 'mystery', bountypooltype: 'amount', bountyprizepool: 77 },
    ]) {
      const current = { ...snapshot, ...bounty, registeredcount: 12, totalrebuys: 2, genericrebuys: 1,
        totaladdons: 1, genericaddons: 1, rake: 30, payoutstructure: JSON.stringify({ mode, value, roundingdenomination }) };
      const gross = 50 * 10 + 50 * 3 + 20 * 2;
      const pool = getConfiguredBountyPool(current, gross, players);
      const expected = exports.payouts(Math.max(0, gross - 30 - pool), current.payoutstructure, 10)[2];
      assert.equal(service.nextPaidFinish(current)?.amount ?? 0, expected, JSON.stringify(current));
      comparisons++;
    }
  }
  assert.equal(comparisons, 100);
});
