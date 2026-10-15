import assert from 'node:assert/strict';
import { pool } from '../src/db';
import { leaguesRouter } from '../src/routes/leagues';

// Exercise the actual handlers with an isolated query adapter. No connection to
// the configured database or HTTP server is opened by this test.
const season = { seasonid: 'season', leagueid: 'league', name: 'Season', leaguefee: 100, pereventfee: 50, expectedplayercount: 2, showupbonuspoints: 0, bestfinishcount: 1, pointslookup: [], eventsasgames: false, active: true };
const league = { ...season, ownerid: 'admin', isadmin: true, approved: true, finalenabled: false, finalmultiplierlookup: [], createdat: '2026-01-01' };
let events = Array.from({ length: 10 }, (_, index) => ({ eventid: `event-${index}`, leagueid: 'league', seasonid: 'season', name: `Event ${index}`, eventnumber: index + 1, active: true }));
let payments: Array<{ paymentid: string; leagueid: string; seasonid: string; eventid: string | null; userid: string; paymenttype: string; amount: number }> = [];
const audits: Array<{ action: string; details: Record<string, unknown> }> = [];
let admin = true;
let participant = true;
let tournamentPaid = false;
const reply = (rows: unknown[] = []) => ({ rows: structuredClone(rows), rowCount: rows.length });

async function query(sqlText: string, args: unknown[] = []): Promise<ReturnType<typeof reply>> {
  const sql = sqlText.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql)) return reply();
  if (sql.startsWith('SELECT 1 FROM leaguemembers WHERE')) return reply(admin ? [{}] : []);
  if (sql.startsWith('SELECT 1 FROM leaguemembers lm')) return reply(participant ? [{}] : []);
  if (sql.startsWith('SELECT lm.userid,')) return reply([{ userid: 'player', displayname: 'Fixture player' }]);
  if (sql.startsWith('WITH selected_season')) return reply([league]);
  if (sql.includes('FROM leagueseasons') && !sql.startsWith('UPDATE')) return reply([season]);
  if (sql.startsWith('SELECT COUNT(*) AS count FROM leagueevents')) return reply([{ count: String(events.length) }]);
  if (sql.startsWith('SELECT eventid FROM leagueevents')) return reply(events.map(({ eventid }) => ({ eventid })));
  if (sql.includes('FROM leagueevents') && sql.startsWith('SELECT eventid,')) return reply(events.filter(e => e.eventid === args[1]));
  if (sql.startsWith('SELECT paymentid, amount FROM leaguepayments')) return reply(payments.filter(p => p.eventid === args[2] && p.userid === args[3]));
  if (sql.startsWith('SELECT eventid, amount FROM leaguepayments')) return reply(payments.filter(p => p.userid === args[2] && p.paymenttype === 'league'));
  if (sql.startsWith('SELECT paymentid FROM leaguepayments')) return reply(payments.filter(p => p.paymenttype === 'league' && p.amount > 0).slice(0, 1));
  if (sql.startsWith('SELECT paymentid, leagueid,')) return reply(payments.filter(p => p.paymentid === args[1]));
  if (sql.startsWith('SELECT COALESCE(SUM(amount)')) return reply([{ amount: payments.filter(p => p.eventid === args[2] && p.userid === args[3] && p.paymenttype === 'event').reduce((sum, p) => sum + p.amount, 0) }]);
  if (sql.startsWith('INSERT INTO leaguepayments')) {
    const payment = { paymentid: `payment-${payments.length}`, leagueid: String(args[0]), seasonid: String(args[1]), userid: String(args[2]), eventid: String(args[3]), paymenttype: sql.includes("'event'") ? 'event' : 'league', amount: Number(args[4]) };
    payments.push(payment); return reply([payment]);
  }
  if (sql.startsWith('UPDATE leaguepayments SET amount = amount +')) {
    const payment = payments.find(p => p.paymentid === args[0])!;
    payment.amount += Number(args[1]); return reply([payment]);
  }
  if (sql.startsWith('DELETE FROM leaguepayments')) { payments = payments.filter(p => p.paymentid !== args[1]); return reply(); }
  if (sql.startsWith('UPDATE tournamentplayers tp SET paid')) {
    tournamentPaid = payments.filter(p => p.eventid === args[0] && p.userid === args[1] && p.paymenttype === 'event').reduce((sum, p) => sum + p.amount, 0) >= season.pereventfee;
    return reply();
  }
  if (sql.startsWith('INSERT INTO leagueeventrsvps')) return reply();
  if (sql.startsWith('INSERT INTO leagueauditlogs')) {
    audits.push({ action: String(args[5]), details: JSON.parse(String(args[7])) }); return reply();
  }
  if (sql.startsWith('UPDATE leagueseasons')) {
    season.leaguefee = Number(args[9]); return reply([season]);
  }
  if (sql.startsWith('UPDATE leagueevents SET active = FALSE')) { const removed = events.filter(e => e.eventid === args[1]); events = events.filter(e => e.eventid !== args[1]); return reply(removed); }
  throw new Error(`Unexpected query in isolated fee route test: ${sql}`);
}

const originalQuery = pool.query;
const originalConnect = pool.connect;
// pg overloads are deliberately replaced only within this isolated process.
(pool as unknown as { query: typeof query }).query = query;
(pool as unknown as { connect: () => Promise<unknown> }).connect = async () => ({ query, release() {} });

async function call(method: string, path: string, body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const layer = (leaguesRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack
    .find(item => item.route?.path === path && item.route.methods[method]);
  assert(layer?.route, `Handler missing: ${method} ${path}`);
  const req = { userId: 'admin', params: { id: 'league', eventId: 'event-0', seasonId: 'season', paymentId: payments[0]?.paymentid }, body, query: {}, ...extra };
  const res = { statusCode: 200, body: {} as Record<string, unknown>, status(code: number) { this.statusCode = code; return this; }, json(value: Record<string, unknown>) { this.body = value; return this; } };
  await layer.route.stack.at(-1)!.handle(req, res);
  return res;
}

async function main() {
  const installment = '/:id/events/:eventId/payments/mark-league-fee-paid';
  admin = false;
  assert.equal((await call('post', installment, { userId: 'player' })).statusCode, 403);
  admin = true; participant = false;
  assert.equal((await call('post', installment, { userId: 'player' })).statusCode, 400);
  participant = true;
  assert.equal((await call('post', installment, { userId: 'player' })).statusCode, 201);
  assert.equal(payments[0].amount, 10);
  assert.equal((await call('post', installment, { userId: 'player' })).statusCode, 409);
  assert.equal(payments.length, 1);
  assert.equal((await call('patch', '/:id/seasons/:seasonId', { leaguefee: 200 })).statusCode, 409);
  assert.equal(season.leaguefee, 100);
  assert.equal((await call('patch', '/:id/seasons/:seasonId', { leaguefee: 200, confirmLeagueFeeRecalculation: true })).statusCode, 200);
  assert.equal(payments[0].amount, 10, 'Fee changes must preserve historical money');
  assert.equal((await call('post', installment, { userId: 'player' })).statusCode, 201);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 20);
  assert.deepEqual(audits.at(-1)?.details, { eventName: 'Event 0', amount: 10, leagueFee: 200, previousAmount: 10, currentAmount: 20, expectedInstallment: 20, eventCount: 10 });
  assert.equal(audits.at(-1)?.action, 'league_fee_installment_adjusted');
  assert.equal((await call('post', '/:id/events', { name: 'Added event', seasonid: 'season' })).statusCode, 409);
  assert.equal((await call('delete', '/:id/events/:eventId')).statusCode, 409);
  assert.equal(events.length, 10);
  assert.equal((await call('delete', '/:id/events/:eventId', {}, { query: { confirmLeagueFeeRecalculation: 'true' } })).statusCode, 200);
  assert.equal(events.length, 9);
  assert.equal(payments[0].amount, 20, 'Removing an event must retain payment history');
  assert.equal((await call('delete', '/:id/payments/:paymentId')).statusCode, 200);
  assert.equal(payments.length, 0);
  assert.equal(audits.at(-1)?.action, 'payment_deleted');
  assert.equal((await call('post', '/:id/events/:eventId/payments/mark-paid', { userId: 'player' }, { params: { id: 'league', eventId: 'event-1' } })).statusCode, 201);
  assert.equal(tournamentPaid, true, 'Event payment must update the linked runner');
  assert.equal((await call('delete', '/:id/payments/:paymentId')).statusCode, 200);
  assert.equal(tournamentPaid, false, 'Runner must not recreate a reversed event payment');
  console.log('PASS actual league fee handlers: admin/participant guards, duplicate prevention, fee-change acknowledgement, historical payment retention, top-up audit, event-count acknowledgement, reversal audit. All queries isolated; no database connection.');
}

main().finally(() => { pool.query = originalQuery; pool.connect = originalConnect; }).catch(error => { console.error(error); process.exitCode = 1; });
