import assert from 'node:assert/strict';
import test from 'node:test';
import { loadReminderJob } from './helpers/event-reminder-job-harness';
import { loadKnockoutDetails } from './helpers/knockout-notification-harness';

test('8am Eastern sends day-of and two-calendar-day RSVP reminders for both event types once', async () => {
  const job = loadReminderJob();
  const first = await job.run();
  assert.equal(first.status, 200);
  assert.equal(job.emails.length, 6);
  assert.equal(job.emails.filter(email => email.mode === 'rsvp').length, 4);
  assert.equal(job.emails.filter(email => email.mode === 'today').length, 2);
  assert.equal(job.emails.filter(email => String(email.details.when).startsWith('2026-10-23')).length, 2);
  for (const kind of ['tournament', 'league']) {
    assert.equal(job.emails.filter(email => email.details.kind === kind).length, 3);
  }
  await job.run();
  assert.equal(job.emails.length, 6, 'Five-minute polling must not resend reminder emails');
  assert.equal([...job.deliveries.values()].filter(delivery => delivery.status === 'sent').length, 6);
  const tournamentQuery = job.reads.find(read => read.sql.includes('WHERE t.date = $1'));
  assert(tournamentQuery);
  assert.match(tournamentQuery.sql, /COALESCE\(gm.approved, TRUE\) = TRUE/);
  assert.match(tournamentQuery.sql, /COALESCE\(um.emailalertsenabled, TRUE\) = TRUE/);
  assert.match(tournamentQuery.sql, /td.userid IS NULL/);
  const leagueQuery = job.reads.find(read => read.sql.includes('WHERE e.eventdate = $1'));
  assert(leagueQuery);
  assert.match(leagueQuery.sql, /COALESCE\(lsp.participating, TRUE\) = TRUE/);
  assert.match(leagueQuery.sql, /COALESCE\(lm.emailalertsenabled, TRUE\) = TRUE/);
});

test('8am reminders stay inside the existing Eastern dispatch window', async () => {
  for (const now of ['2026-10-21T11:59:00Z', '2026-10-21T12:15:00Z']) {
    const job = loadReminderJob({ now });
    await job.run();
    assert.equal(job.emails.length, 0);
  }
});

test('one-hour reminders cover the 45–75 minute window and remain deduplicated', async () => {
  for (const [now, expected] of [
    ['2026-10-21T21:44:00Z', 0], ['2026-10-21T21:45:00Z', 2],
    ['2026-10-21T22:00:00Z', 2], ['2026-10-21T22:15:00Z', 2], ['2026-10-21T22:16:00Z', 0],
  ] as const) {
    const job = loadReminderJob({ now });
    await job.run();
    await job.run();
    assert.equal(job.emails.length, expected, now);
    assert(job.emails.every(email => email.mode === 'one_hour'));
  }
});

test('an unauthorized request does not query recipients or send reminders', async () => {
  const job = loadReminderJob();
  assert.equal((await job.run('wrong-secret')).status, 401);
  assert.equal(job.reads.length, 0);
  assert.equal(job.emails.length, 0);
});

test('the combined job still processes authorized existing results recaps with reminder sends', async () => {
  const job = loadReminderJob({ recaps: true });
  await job.run();
  assert.equal(job.emails.filter(email => email.mode === 'recap').length, 2);
  await job.run();
  assert.equal(job.emails.filter(email => email.mode === 'recap').length, 2);
});

test('real-schema regression: every scheduled job SELECT plans in a read-only transaction', {
  skip: process.env.REMINDER_SCHEMA_CHECK !== '1',
}, async () => {
  const { pool } = await import('../src/db');
  const client = await pool.connect();
  const validated = new Set<string>();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    let planning = Promise.resolve();
    const validateSelect = (sql: string, params: unknown[]) => {
      // No ANALYZE: only query planning. Email transports and delivery writes
      // remain isolated in memory; no user data is returned or changed.
      planning = planning.then(async () => {
        if (validated.has(sql)) return;
        await client.query(`EXPLAIN ${sql}`, params);
        validated.add(sql);
      });
      return planning;
    };
    const job = loadReminderJob({ recaps: true, validateSelect });
    await job.run();
    const knockout = loadKnockoutDetails(async (sql, params) => { await validateSelect(sql, params); return null; });
    await knockout.knockoutNotificationDetails({ playerName: 'Fixture player', placed: 4,
      tournamentId: '00000000-0000-4000-8000-000000000001' });
    assert.equal(knockout.errors.length, 0);
    assert(validated.size >= 13);
    console.log(`Validated ${validated.size} scheduled-job SELECTs against the configured schema; no sends or database writes.`);
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
