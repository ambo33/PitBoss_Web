import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import pg from 'pg';

const PYTHON = 'C:\\Users\\EricA\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const LEAGUE_NAME = 'Season Championship League';

function loadEnv(path) {
  const env = {};
  if (!fs.existsSync(path)) return env;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const parsed = JSON.parse(execFileSync(PYTHON, ['tmp\\inspect_wsop.py', 'parse-results'], { encoding: 'utf8' }));
const env = { ...loadEnv('.env'), ...loadEnv('apps/api/.env'), ...process.env };
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

try {
  const league = (await pool.query(
    `SELECT leagueid, name, expectedplayercount, leaguefee, pereventfee, showupbonuspoints, bestfinishcount
     FROM leagues
     WHERE name = $1 AND COALESCE(active, TRUE) = TRUE
     ORDER BY createdat DESC
     LIMIT 1`,
    [LEAGUE_NAME]
  )).rows[0];
  if (!league) throw new Error(`League not found: ${LEAGUE_NAME}`);

  const season = (await pool.query(
    `SELECT seasonid, name, pereventfee
     FROM leagueseasons
     WHERE leagueid = $1 AND COALESCE(active, TRUE) = TRUE
     ORDER BY begindate DESC, createdat DESC
     LIMIT 1`,
    [league.leagueid]
  )).rows[0];
  if (!season) throw new Error(`Season not found for ${LEAGUE_NAME}`);

  const counts = (await pool.query(
    `SELECT
       (SELECT count(*)::INT FROM leagueresults r JOIN leagueevents e ON e.eventid = r.eventid WHERE r.leagueid = $1 AND e.seasonid = $2) AS results,
       (SELECT count(*)::INT FROM leaguepayments WHERE leagueid = $1 AND seasonid = $2 AND paymenttype = 'league') AS leaguepayments,
       (SELECT count(*)::INT FROM leaguepayments WHERE leagueid = $1 AND seasonid = $2 AND paymenttype = 'event') AS eventpayments,
       (SELECT count(*)::INT FROM leagueseasonparticipants WHERE leagueid = $1 AND seasonid = $2 AND participating = TRUE) AS participants,
       (SELECT count(*)::INT FROM leagueauditlogs WHERE leagueid = $1 AND seasonid = $2 AND action = 'spreadsheet_results_imported') AS importauditlogs`,
    [league.leagueid, season.seasonid]
  )).rows[0];

  const eventCounts = (await pool.query(
    `SELECT e.name, count(r.resultid)::INT AS results
     FROM leagueevents e
     LEFT JOIN leagueresults r ON r.eventid = e.eventid
     WHERE e.leagueid = $1 AND e.seasonid = $2 AND e.active = TRUE
     GROUP BY e.eventid, e.name, e.eventnumber
     ORDER BY e.eventnumber ASC`,
    [league.leagueid, season.seasonid]
  )).rows;

  const resultRows = (await pool.query(
    `SELECT
       COALESCE(NULLIF(trim(m.nickname), ''), NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
       r.points,
       r.showupbonuspoints,
       r.dnf
     FROM leagueresults r
     JOIN users u ON u.guid = r.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     JOIN leagueevents e ON e.eventid = r.eventid
     WHERE r.leagueid = $1 AND e.seasonid = $2`,
    [league.leagueid, season.seasonid]
  )).rows;

  const actualByName = new Map();
  for (const row of resultRows) {
    const key = normalizeName(row.displayname);
    const entry = actualByName.get(key) ?? { points: [], showup: 0 };
    if (!row.dnf) entry.points.push(Number(row.points || 0));
    entry.showup += Number(row.showupbonuspoints || 0);
    actualByName.set(key, entry);
  }

  const mismatches = [];
  for (const player of parsed.players) {
    const expectedResults = parsed.events.map((event) => event.results.find((result) => result.name === player.name)).filter(Boolean);
    const expectedPoints = expectedResults.filter((result) => !result.dnf).map((result) => Number(result.points || 0)).sort((a, b) => b - a).slice(0, 7);
    const expectedScored = expectedPoints.reduce((sum, points) => sum + points, 0);
    const expectedShowup = expectedResults.filter((result) => !result.dnf).length * 300;
    const actual = actualByName.get(normalizeName(player.name)) ?? { points: [], showup: 0 };
    const actualScored = actual.points.sort((a, b) => b - a).slice(0, 7).reduce((sum, points) => sum + points, 0);
    if (actualScored !== expectedScored || actual.showup !== expectedShowup) {
      mismatches.push({
        player: player.name,
        expectedScored,
        actualScored,
        expectedShowup,
        actualShowup: actual.showup,
      });
    }
  }

  const standingsPreview = [...parsed.players].map((player) => {
    const actual = actualByName.get(normalizeName(player.name)) ?? { points: [], showup: 0 };
    const scored = actual.points.sort((a, b) => b - a).slice(0, 7).reduce((sum, points) => sum + points, 0);
    return { name: player.name, scored, showup: actual.showup, total: scored + actual.showup };
  }).sort((a, b) => b.total - a.total).slice(0, 10);

  console.log(JSON.stringify({
    league,
    season,
    counts,
    eventCounts,
    mismatches,
    standingsPreview,
  }, null, 2));
} finally {
  await pool.end();
}
