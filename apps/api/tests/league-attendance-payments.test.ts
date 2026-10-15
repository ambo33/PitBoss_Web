import assert from 'node:assert/strict';
import { pool } from '../src/db';
import { leaguesRouter } from '../src/routes/leagues';

// Invoke the real RSVP handler with an isolated adapter. Never open a database
// connection or mutate real attendance/payment data.
type Payment = { paymentid: string; leagueid: string; eventid: string; userid: string; paymenttype: string; amount: number };
type Result = { resultid: string; eventid: string; leagueid: string; userid: string; placed: number | null; dnf: boolean; points: number; showupbonuspoints: number };
const fixturePayments: Payment[] = [
  { paymentid: 'event-part-1', leagueid: 'league', eventid: 'event', userid: 'player', paymenttype: 'event', amount: 20.1 },
  { paymentid: 'event-part-2', leagueid: 'league', eventid: 'event', userid: 'player', paymenttype: 'event', amount: 30.15 },
  { paymentid: 'league-fee', leagueid: 'league', eventid: 'event', userid: 'player', paymenttype: 'league', amount: 10 },
  { paymentid: 'other-player', leagueid: 'league', eventid: 'event', userid: 'another-player', paymenttype: 'event', amount: 50.25 },
  { paymentid: 'other-event', leagueid: 'league', eventid: 'another-event', userid: 'player', paymenttype: 'event', amount: 50.25 },
];
let payments: Payment[];
let result: Result | null;
let audits: Array<{ action: string; details: Record<string, unknown> }>;
let queries: string[];
let tournamentPaid: boolean;
const reply = (rows: unknown[] = []) => ({ rows: structuredClone(rows), rowCount: rows.length });
function reset() {
  payments = structuredClone(fixturePayments);
  result = null;
  audits = [];
  queries = [];
  tournamentPaid = true;
}
async function query(sqlText: string, args: unknown[] = []) {
  const sql = sqlText.replace(/\s+/g, ' ').trim();
  queries.push(sql);
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return reply();
  if (sql.startsWith('SELECT eventid, leagueid, seasonid, tournamentid FROM leagueevents')) return reply([{ eventid: 'event', leagueid: 'league', seasonid: 'season', tournamentid: 'tournament' }]);
  if (sql.startsWith('SELECT 1 FROM leaguemembers WHERE')) return reply(args[1] === 'admin' ? [{}] : []);
  if (sql.startsWith('SELECT 1 FROM leaguemembers lm')) return reply([{}]);
  if (sql.startsWith('INSERT INTO leagueeventrsvps')) return reply([{ eventid: args[0], leagueid: args[1], userid: args[2], status: args[3] }]);
  if (sql.startsWith('SELECT resultid,')) return reply(result ? [result] : []);
  if (sql.startsWith('INSERT INTO leagueresults')) {
    result = { resultid: 'result', eventid: String(args[0]), leagueid: String(args[1]), userid: String(args[2]), placed: null, dnf: true, points: 0, showupbonuspoints: 0 };
    return reply();
  }
  if (sql.startsWith('DELETE FROM leagueresults')) { result = null; return reply(); }
  if (sql.startsWith('DELETE FROM leaguepayments')) {
    assert.match(sql, /paymenttype = 'event' RETURNING paymentid, amount$/);
    const deleted = payments.filter(p => p.leagueid === args[0] && p.eventid === args[1] && p.userid === args[2] && p.paymenttype === 'event');
    payments = payments.filter(p => !deleted.includes(p));
    return reply(deleted);
  }
  if (sql.startsWith('UPDATE tournamentplayers tp SET paid')) {
    assert.deepEqual(args, ['event', result?.userid ?? 'player']);
    tournamentPaid = payments.filter(p => p.eventid === args[0] && p.userid === args[1] && p.paymenttype === 'event').reduce((sum, p) => sum + p.amount, 0) >= 50.25;
    return reply();
  }
  if (sql.startsWith('INSERT INTO leagueauditlogs')) {
    audits.push({ action: String(args[5]), details: JSON.parse(String(args[7])) });
    return reply();
  }
  throw new Error(`Unexpected isolated attendance query: ${sql}`);
}
const originalQuery = pool.query;
const originalConnect = pool.connect;
(pool as unknown as { query: typeof query }).query = query;
(pool as unknown as { connect: () => Promise<unknown> }).connect = async () => ({ query, release() {} });

async function call(body: Record<string, unknown>, actor = 'admin') {
  const route = (leaguesRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack
    .find(layer => layer.route?.path === '/:id/events/:eventId/rsvp' && layer.route.methods.put)?.route;
  assert(route);
  const req = { userId: actor, params: { id: 'league', eventId: 'event' }, body };
  const res = { statusCode: 200, body: {} as Record<string, unknown>, status(code: number) { this.statusCode = code; return this; }, json(value: Record<string, unknown>) { this.body = value; return this; } };
  await route.stack.at(-1)!.handle(req, res);
  return res;
}
async function main() {
  for (const choice of [undefined, false]) {
    reset();
    assert.equal((await call({ status: 'not_going', userId: 'player', removeEventFeePayment: choice })).statusCode, 200);
    assert.deepEqual(payments, fixturePayments, 'No choice or Keep must preserve all payment records');
    assert.equal(result?.dnf, true);
    assert.equal(tournamentPaid, true);
    assert.equal(audits.at(-1)?.details.eventFeePaymentAction, 'kept');
    assert.equal(queries.some(sql => sql.startsWith('DELETE FROM leaguepayments')), false);
  }

  reset();
  assert.equal((await call({ status: 'not_going', userId: 'player', removeEventFeePayment: true })).statusCode, 200);
  assert.deepEqual(payments, fixturePayments.slice(2), 'Remove must not affect league fees, other players or other events');
  assert.equal(tournamentPaid, false, 'The linked runner must not recreate the removed payment');
  assert.deepEqual(audits.at(-1)?.details, { status: 'not_going', eventFeePaymentAction: 'removed', removedEventFeePayments: 2, removedEventFeeAmount: 50.25 });
  assert.equal(queries.at(-1), 'COMMIT');

  reset();
  await call({ status: 'not_going', userId: 'player' });
  const repeated = await call({ status: 'not_going', userId: 'player', removeEventFeePayment: true });
  assert.equal(repeated.body.resultChanged, false, 'Already-DNF players still support an explicit payment choice');
  assert.deepEqual(payments, fixturePayments.slice(2));

  for (const body of [
    { status: 'not_going', userId: 'another-player', removeEventFeePayment: false },
    { status: 'not_going', removeEventFeePayment: true },
  ]) {
    reset();
    assert.equal((await call(body, 'player')).statusCode, 403);
    assert.deepEqual(payments, fixturePayments);
    assert(!queries.includes('BEGIN'), 'Unauthorized requests must not start a write transaction');
  }

  reset();
  assert.equal((await call({ status: 'not_going' }, 'player')).statusCode, 200);
  assert.deepEqual(payments, fixturePayments, 'Self-service attendance preserves payments');

  reset();
  await call({ status: 'not_going', userId: 'player' });
  await call({ status: 'going', userId: 'player', removeEventFeePayment: true });
  assert.deepEqual(payments, fixturePayments, 'Going must never delete a payment');
  assert.equal(result, null);

  reset();
  payments = payments.filter(p => p.paymentid !== 'event-part-1' && p.paymentid !== 'event-part-2');
  assert.equal((await call({ status: 'not_going', userId: 'player', removeEventFeePayment: true })).statusCode, 200);
  assert.equal(audits.at(-1)?.details.removedEventFeePayments, 0);
  console.log('PASS RSVP/payment handler: keep by default, explicit keep/remove, partial payments, audit totals, linked-runner sync, existing DNF, authorization, self-service, Going and no-payment cases. Isolated adapter; no database connection.');
}
main().finally(() => { pool.query = originalQuery; pool.connect = originalConnect; }).catch(error => { console.error(error); process.exitCode = 1; });
