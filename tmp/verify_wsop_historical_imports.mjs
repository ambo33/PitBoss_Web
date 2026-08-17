import fs from 'node:fs';
import pg from 'pg';

const LEAGUE_NAME = 'Nocatee WSOP';
const SEASONS = ['2025', '2024'];

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

function sqlNameExpression(metaAlias = 'm', userAlias = 'u') {
  const fullName = `NULLIF(trim(coalesce(${metaAlias}.fullname, '')), '')`;
  const nickname = `NULLIF(trim(coalesce(${metaAlias}.nickname, '')), '')`;
  const legacyName = `NULLIF(trim(concat(coalesce(${metaAlias}.firstname, ''), ' ', coalesce(${metaAlias}.lastname, ''))), '')`;
  return `COALESCE(${fullName}, ${nickname}, ${legacyName}, ${userAlias}.emailaddress)`;
}

const env = { ...loadEnv('.env'), ...loadEnv('apps/api/.env'), ...process.env };
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

try {
  const league = await pool.query(
    `SELECT leagueid, name FROM leagues WHERE lower(name) = lower($1) AND COALESCE(active, TRUE) = TRUE LIMIT 1`,
    [LEAGUE_NAME]
  );
  const leagueRow = league.rows[0];
  if (!leagueRow) throw new Error(`League not found: ${LEAGUE_NAME}`);

  const output = [];
  for (const seasonName of SEASONS) {
    const seasonResult = await pool.query(
      `SELECT seasonid, name, expectedplayercount, leaguefee, pereventfee, showupbonuspoints, bestfinishcount
       FROM leagueseasons
       WHERE leagueid = $1 AND lower(name) = lower($2) AND COALESCE(active, TRUE) = TRUE
       LIMIT 1`,
      [leagueRow.leagueid, seasonName]
    );
    const season = seasonResult.rows[0];
    if (!season) {
      output.push({ season: seasonName, missing: true });
      continue;
    }

    const counts = await pool.query(
      `SELECT
         (SELECT count(*)::INT FROM leagueseasonparticipants WHERE seasonid = $1 AND participating = TRUE) AS participants,
         (SELECT count(*)::INT FROM leagueevents WHERE seasonid = $1 AND COALESCE(active, TRUE) = TRUE) AS events,
         (SELECT count(*)::INT
          FROM leagueresults r
          JOIN leagueevents e ON e.eventid = r.eventid
          WHERE e.seasonid = $1 AND COALESCE(e.active, TRUE) = TRUE) AS results,
         (SELECT count(*)::INT FROM leaguepayments WHERE seasonid = $1 AND paymenttype = 'league') AS leaguepayments,
         (SELECT count(*)::INT FROM leaguepayments WHERE seasonid = $1 AND paymenttype = 'event') AS eventpayments`,
      [season.seasonid]
    );

    const standings = await pool.query(
      `WITH event_results AS (
         SELECT
           r.userid,
           COALESCE(r.points, 0)::INT AS points,
           COALESCE(r.showupbonuspoints, 0)::INT AS showup,
           COALESCE(r.dnf, FALSE) AS dnf,
           ROW_NUMBER() OVER (PARTITION BY r.userid ORDER BY COALESCE(r.points, 0) DESC, COALESCE(r.placed, 999) ASC) AS score_rank
         FROM leagueresults r
         JOIN leagueevents e ON e.eventid = r.eventid
         WHERE e.seasonid = $1 AND COALESCE(e.active, TRUE) = TRUE
       ),
       totals AS (
         SELECT
           userid,
           SUM(CASE WHEN score_rank <= $2 THEN points ELSE 0 END)::INT AS scored_points,
           SUM(showup)::INT AS showup_points,
           COUNT(*) FILTER (WHERE dnf = FALSE)::INT AS played
         FROM event_results
         GROUP BY userid
       )
       SELECT ${sqlNameExpression('m', 'u')} AS player, scored_points, showup_points, played
       FROM totals t
       JOIN users u ON u.guid = t.userid
       LEFT JOIN usermetadata m ON m.userid = u.guid
       ORDER BY scored_points DESC, played DESC, player ASC
       LIMIT 5`,
      [season.seasonid, Number(season.bestfinishcount ?? 7)]
    );

    output.push({
      season: season.name,
      seasonid: season.seasonid,
      settings: {
        expectedPlayerCount: Number(season.expectedplayercount),
        leagueFee: Number(season.leaguefee),
        perEventFee: Number(season.pereventfee),
        showupBonusPoints: Number(season.showupbonuspoints),
        bestFinishCount: Number(season.bestfinishcount),
      },
      counts: counts.rows[0],
      topStandings: standings.rows,
    });
  }

  console.log(JSON.stringify({ league: leagueRow.name, seasons: output }, null, 2));
} finally {
  await pool.end();
}
