import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import pg from 'pg';

const PYTHON = 'C:\\Users\\EricA\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const LEAGUE_NAME = 'Season Championship League';
const APPLY = process.argv.includes('--apply');

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

function moneyValue(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

function dbDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function buildAuditDetails(parsed, anomalies) {
  return {
    source: 'season spreadsheet import',
    playersImported: parsed.players.length,
    eventsImported: parsed.events.length,
    resultsImported: parsed.events.reduce((sum, event) => sum + event.results.length, 0),
    anomalies,
  };
}

const parsed = JSON.parse(execFileSync(PYTHON, ['tmp\\inspect_wsop.py', 'parse-results'], { encoding: 'utf8' }));
const env = { ...loadEnv('.env'), ...loadEnv('apps/api/.env'), ...process.env };
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

const anomalies = [];
for (const event of parsed.events) {
  const places = event.results.filter((result) => !result.dnf && result.place).map((result) => result.place);
  const dupes = [...new Set(places.filter((place, index) => places.indexOf(place) !== index))];
  const missing = [];
  for (let place = 1; place <= places.length; place += 1) {
    if (!places.includes(place)) missing.push(place);
  }
  if (dupes.length || missing.length) anomalies.push({ event: event.name, duplicatePlaces: dupes, missingPlaces: missing });
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const leagueResult = await client.query(
    `SELECT leagueid, userid AS ownerid, name, expectedplayercount, leaguefee, pereventfee, showupbonuspoints, bestfinishcount
     FROM leagues
     WHERE name = $1 AND COALESCE(active, TRUE) = TRUE
     ORDER BY createdat DESC
     LIMIT 1`,
    [LEAGUE_NAME]
  );
  const league = leagueResult.rows[0];
  if (!league) throw new Error(`League not found: ${LEAGUE_NAME}`);

  const seasonResult = await client.query(
    `SELECT seasonid, name, begindate, enddate, pereventfee
     FROM leagueseasons
     WHERE leagueid = $1 AND COALESCE(active, TRUE) = TRUE
     ORDER BY begindate DESC, createdat DESC
     LIMIT 1`,
    [league.leagueid]
  );
  const season = seasonResult.rows[0];
  if (!season) throw new Error(`Active season not found for ${LEAGUE_NAME}`);

  const membersResult = await client.query(
    `SELECT lm.userid, lm.admin, COALESCE(NULLIF(trim(m.nickname), ''), NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
     FROM leaguemembers lm
     JOIN users u ON u.guid = lm.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE lm.leagueid = $1 AND lm.approved = TRUE`,
    [league.leagueid]
  );
  const membersByName = new Map();
  for (const member of membersResult.rows) {
    const key = normalizeName(member.displayname);
    if (!membersByName.has(key)) membersByName.set(key, member);
  }
  const importMembers = parsed.players.map((player) => {
    const member = membersByName.get(normalizeName(player.name));
    if (!member) throw new Error(`No approved league member matched spreadsheet player: ${player.name}`);
    return { ...player, userid: member.userid };
  });
  const importUserIds = new Set(importMembers.map((member) => member.userid));
  const playerByName = new Map(importMembers.map((member) => [normalizeName(member.name), member]));

  const eventsResult = await client.query(
    `SELECT eventid, seasonid, name, eventnumber
     FROM leagueevents
     WHERE leagueid = $1 AND seasonid = $2 AND active = TRUE`,
    [league.leagueid, season.seasonid]
  );
  const eventsByName = new Map(eventsResult.rows.map((event) => [normalizeName(event.name), event]));
  for (const event of parsed.events) {
    if (!eventsByName.has(normalizeName(event.name))) throw new Error(`No league event matched spreadsheet row: ${event.name}`);
  }

  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    league: league.name,
    leagueid: league.leagueid,
    season: season.name,
    seasonid: season.seasonid,
    spreadsheetPlayers: parsed.players.length,
    matchedPlayers: importMembers.length,
    spreadsheetEvents: parsed.events.length,
    matchedEvents: parsed.events.length,
    resultsToImport: parsed.events.reduce((sum, event) => sum + event.results.length, 0),
    leagueFeePaymentsToImport: importMembers.length,
    eventPaymentsToImport: parsed.events.reduce((sum, event) => sum + event.results.filter((result) => moneyValue(result.paid) > 0).length, 0),
    inactiveSeasonParticipants: membersResult.rows.filter((member) => !importUserIds.has(member.userid)).map((member) => member.displayname),
    anomalies,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!APPLY) {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
    process.exit(0);
  }

  await client.query(
    `UPDATE leagues
     SET expectedplayercount = 36,
         leaguefee = 1000,
         pereventfee = 50,
         showupbonuspoints = 300,
         bestfinishcount = 7,
         pointslookup = $2
     WHERE leagueid = $1`,
    [league.leagueid, JSON.stringify(parsed.pointsLookup)]
  );
  await client.query(
    `UPDATE leagueseasons SET pereventfee = 50 WHERE leagueid = $1 AND seasonid = $2`,
    [league.leagueid, season.seasonid]
  );
  await client.query(
    `UPDATE leagueevents SET eventfee = 50 WHERE leagueid = $1 AND seasonid = $2`,
    [league.leagueid, season.seasonid]
  );
  await client.query(
    `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
     SELECT $2, $1, lm.userid, FALSE
     FROM leaguemembers lm
     WHERE lm.leagueid = $1 AND lm.approved = TRUE
     ON CONFLICT (seasonid, userid) DO UPDATE SET participating = FALSE`,
    [league.leagueid, season.seasonid]
  );
  for (const member of importMembers) {
    await client.query(
      `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (seasonid, userid) DO UPDATE SET participating = TRUE`,
      [season.seasonid, league.leagueid, member.userid]
    );
  }
  await client.query(
    `DELETE FROM leagueresults
     WHERE leagueid = $1
       AND eventid IN (SELECT eventid FROM leagueevents WHERE leagueid = $1 AND seasonid = $2)`,
    [league.leagueid, season.seasonid]
  );
  await client.query(
    `DELETE FROM leaguepayments
     WHERE leagueid = $1
       AND (seasonid = $2 OR eventid IN (SELECT eventid FROM leagueevents WHERE leagueid = $1 AND seasonid = $2))`,
    [league.leagueid, season.seasonid]
  );

  const actorId = membersResult.rows.find((member) => member.admin)?.userid ?? league.ownerid;
  const paidAt = dbDate(season.begindate) ?? new Date().toISOString().slice(0, 10);
  for (const member of importMembers) {
    const amount = moneyValue(parsed.leagueFees[member.name]);
    if (!amount) continue;
    await client.query(
      `INSERT INTO leaguepayments (leagueid, seasonid, userid, eventid, paymenttype, amount, paidat, note, recordedby)
       VALUES ($1, $2, $3, NULL, 'league', $4, $5, $6, $7)`,
      [league.leagueid, season.seasonid, member.userid, amount, paidAt, 'Imported from spreadsheet league fee.', actorId]
    );
  }

  for (const parsedEvent of parsed.events) {
    const dbEvent = eventsByName.get(normalizeName(parsedEvent.name));
    for (const result of parsedEvent.results) {
      const member = playerByName.get(normalizeName(result.name));
      const showupBonus = result.dnf ? 0 : 300;
      await client.query(
        `INSERT INTO leagueresults (eventid, leagueid, userid, placed, dnf, points, showupbonuspoints, loggedby)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (eventid, userid) DO UPDATE
         SET placed = $4,
             dnf = $5,
             points = $6,
             showupbonuspoints = $7,
             loggedby = $8,
             updatedat = now()`,
        [dbEvent.eventid, league.leagueid, member.userid, result.place, result.dnf, result.points, showupBonus, actorId]
      );
      const eventFeePaid = moneyValue(result.paid);
      if (eventFeePaid) {
        await client.query(
          `INSERT INTO leaguepayments (leagueid, seasonid, userid, eventid, paymenttype, amount, paidat, note, recordedby)
           VALUES ($1, $2, $3, $4, 'event', $5, $6, $7, $8)`,
          [league.leagueid, season.seasonid, member.userid, dbEvent.eventid, eventFeePaid, paidAt, `Imported from spreadsheet ${parsedEvent.name}.`, actorId]
        );
      }
    }
  }

  await client.query(
    `INSERT INTO leagueauditlogs (leagueid, seasonid, actorid, action, summary, details)
     VALUES ($1, $2, $3, 'spreadsheet_results_imported', 'Spreadsheet event results were imported.', $4::JSONB)`,
    [league.leagueid, season.seasonid, actorId, JSON.stringify(buildAuditDetails(parsed, anomalies))]
  );
  await client.query('COMMIT');
  console.log(JSON.stringify({ imported: true, ...summary }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
