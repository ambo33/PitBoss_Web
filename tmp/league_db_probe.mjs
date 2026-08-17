import fs from 'node:fs';
import pg from 'pg';

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

const env = { ...loadEnv('.env'), ...loadEnv('apps/api/.env'), ...process.env };
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

try {
  const leagues = await pool.query(
    `SELECT leagueid, name, invitecode, expectedplayercount, leaguefee, pereventfee, showupbonuspoints, bestfinishcount
     FROM leagues
     WHERE lower(name) LIKE lower($1) AND COALESCE(active, TRUE) = TRUE
     ORDER BY createdat DESC`,
    ['%Season Championship League%']
  );
  console.log(JSON.stringify({ leagues: leagues.rows }, null, 2));
  for (const league of leagues.rows) {
    const seasons = await pool.query(
      `SELECT seasonid, name, begindate, enddate, pereventfee
       FROM leagueseasons
       WHERE leagueid = $1 AND COALESCE(active, TRUE) = TRUE
       ORDER BY begindate DESC, createdat DESC`,
      [league.leagueid]
    );
    const members = await pool.query(
      `SELECT lm.userid, lm.admin, lm.approved, COALESCE(NULLIF(trim(m.nickname), ''), NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
       FROM leaguemembers lm
       JOIN users u ON u.guid = lm.userid
       LEFT JOIN usermetadata m ON m.userid = u.guid
       WHERE lm.leagueid = $1 AND lm.approved = TRUE
       ORDER BY lower(COALESCE(NULLIF(trim(m.nickname), ''), NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress))`,
      [league.leagueid]
    );
    const events = await pool.query(
      `SELECT eventid, seasonid, name, eventnumber, eventdate, eventtime, active
       FROM leagueevents
       WHERE leagueid = $1 AND active = TRUE
       ORDER BY eventnumber ASC NULLS LAST, eventdate ASC NULLS LAST, createdat ASC`,
      [league.leagueid]
    );
    const resultCounts = await pool.query(
      `SELECT e.name, count(r.resultid)::INT AS results
       FROM leagueevents e
       LEFT JOIN leagueresults r ON r.eventid = e.eventid
       WHERE e.leagueid = $1 AND e.active = TRUE
       GROUP BY e.eventid, e.name, e.eventnumber
       ORDER BY e.eventnumber ASC NULLS LAST, e.name`,
      [league.leagueid]
    );
    console.log(JSON.stringify({ league: league.name, seasons: seasons.rows, members: members.rows, events: events.rows, resultCounts: resultCounts.rows }, null, 2));
  }
} finally {
  await pool.end();
}
