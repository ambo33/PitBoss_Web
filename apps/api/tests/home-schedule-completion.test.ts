import assert from 'node:assert/strict';
import { pool } from '../src/db';
import { tournamentsRouter } from '../src/routes/tournaments';
import { leaguesRouter } from '../src/routes/leagues';
import { gamesRouter } from '../src/routes/games';
import { allLeaguePlayersFinishedSql, allTournamentPlayersFinishedSql } from '../src/homeScheduleCompletion';

// Default checks invoke real read handlers with an isolated adapter. The
// optional --read-only-sql check validates SQL on literal CTE fixtures only;
// it runs in a read-only transaction and never reads or changes real records.
async function checkHandlers() {
  const originalQuery = pool.query;
  const queries: string[] = [];
  (pool as unknown as { query: (sql: string) => Promise<unknown> }).query = async (sql: string) => {
    queries.push(sql);
    return { rows: sql.includes('AS allplayersfinished') ? [{ allplayersfinished: true }] : [{}], rowCount: 1 };
  };
  try {
    for (const [router, path, expression] of [
      [tournamentsRouter, '/', allTournamentPlayersFinishedSql('t.tournamentid')],
      [tournamentsRouter, '/registered', allTournamentPlayersFinishedSql('t.tournamentid')],
      [gamesRouter, '/', allTournamentPlayersFinishedSql('g.tournamentid')],
      [gamesRouter, '/group/:groupId', allTournamentPlayersFinishedSql('g.tournamentid')],
      [leaguesRouter, '/schedule', allLeaguePlayersFinishedSql('e')],
    ] as const) {
      const route = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack
        .find(layer => layer.route?.path === path && layer.route.methods.get)?.route;
      assert(route, path);
      const req = { userId: 'fixture-user', params: { groupId: 'fixture-group' }, query: {} };
      let body: Array<{ allplayersfinished?: boolean }> = [];
      await route.stack.at(-1)!.handle(req, { json(value: typeof body) { body = value; } });
      assert.equal(body[0]?.allplayersfinished, true, `${path}: completion flag must reach the response`);
      assert(queries.some(sql => sql.includes(expression)), `${path}: full-field predicate must be selected`);
    }
    console.log('PASS all-player completion reaches tournament, registered, generic-game, group-game and league schedule responses. Database adapter isolated.');
  } finally { pool.query = originalQuery; }
}

async function checkReadOnlySql() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const tournamentRows = await client.query(`WITH tournamentplayers(tournamentid, checkedin, placed) AS (
      VALUES ('finished', TRUE, 1), ('finished', TRUE, 2), ('finished', FALSE, NULL),
             ('winner-only', TRUE, 1), ('winner-only', TRUE, NULL),
             ('unchecked', FALSE, NULL), ('knocked-out', FALSE, 3), ('knocked-out', TRUE, NULL)
    ) SELECT id, ${allTournamentPlayersFinishedSql('e.id')} AS finished
      FROM (VALUES ('finished'), ('winner-only'), ('unchecked'), ('knocked-out'), ('empty')) e(id)`);
    assert.deepEqual(Object.fromEntries(tournamentRows.rows.map(row => [row.id, row.finished])), {
      finished: true, 'winner-only': false, unchecked: false, 'knocked-out': false, empty: false,
    });
    const leagueRows = await client.query(`WITH
      leagueeventrsvps(leagueid, eventid, userid, status) AS (
        VALUES ('l', 'finished', 'a', 'going'), ('l', 'finished', 'b', 'going'), ('l', 'finished', 'c', 'not_going'),
               ('l', 'partial', 'a', 'going'), ('l', 'partial', 'b', 'going'),
               ('l', 'missing', 'a', 'going'), ('l', 'missing', 'b', 'going'),
               ('l', 'finished', 'inactive', 'going'), ('l', 'finished', 'unapproved', 'going')
      ), leagueseasonparticipants(leagueid, seasonid, userid, participating) AS (
        VALUES ('l', 's', 'a', TRUE), ('l', 's', 'b', TRUE), ('l', 's', 'c', TRUE),
               ('l', 's', 'inactive', FALSE), ('l', 's', 'unapproved', TRUE)
      ), leaguemembers(leagueid, userid, approved) AS (
        VALUES ('l', 'a', TRUE), ('l', 'b', TRUE), ('l', 'c', TRUE), ('l', 'inactive', TRUE), ('l', 'unapproved', FALSE)
      ), leagueresults(leagueid, eventid, userid, placed, dnf) AS (
        VALUES ('l', 'finished', 'a', 1, FALSE), ('l', 'finished', 'b', NULL, TRUE),
               ('l', 'partial', 'a', 1, FALSE), ('l', 'partial', 'b', NULL, FALSE),
               ('l', 'missing', 'a', 1, FALSE)
      ) SELECT eventid, ${allLeaguePlayersFinishedSql('e')} AS finished
        FROM (VALUES ('l', 's', 'finished'), ('l', 's', 'partial'), ('l', 's', 'missing'), ('l', 's', 'empty')) e(leagueid, seasonid, eventid)`);
    assert.deepEqual(Object.fromEntries(leagueRows.rows.map(row => [row.eventid, row.finished])), {
      finished: true, partial: false, missing: false, empty: false,
    });
    console.log('PASS read-only SQL fixture checks: empty fields, incomplete/winner-only fields, unchecked registrants, DNF, invalid/missing placements and eligible league membership. No real table records accessed.');
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
}

checkHandlers().then(() => process.argv.includes('--read-only-sql') ? checkReadOnlySql() : undefined)
  .catch(error => { console.error(error); process.exitCode = 1; });
