require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

const leagueId = 'dc6cc3af-dc67-4f67-8eeb-7c1d0f10a678';

async function main() {
  const season = await pool.query(
    `SELECT seasonid FROM leagueseasons WHERE leagueid = $1 AND name = '2027' AND COALESCE(active, TRUE) = TRUE LIMIT 1`,
    [leagueId],
  );
  const seasonId = season.rows[0]?.seasonid;
  if (!seasonId) throw new Error('2027 season not found');

  const summary = await pool.query(
    `SELECT
       count(*) FILTER (WHERE sp.participating = TRUE) AS season_participants,
       count(*) FILTER (WHERE sp.participating = TRUE AND lm.userid IS NOT NULL) AS linked_members,
       count(*) FILTER (WHERE sp.participating = TRUE AND lm.userid IS NULL) AS missing_members
     FROM leagueseasonparticipants sp
     LEFT JOIN leaguemembers lm ON lm.leagueid = sp.leagueid AND lm.userid = sp.userid
     WHERE sp.leagueid = $1 AND sp.seasonid = $2`,
    [leagueId, seasonId],
  );

  const missing = await pool.query(
    `SELECT sp.userid,
            COALESCE(NULLIF(trim(concat(COALESCE(m.firstname, ''), ' ', COALESCE(m.lastname, ''))), ''), m.nickname, u.emailaddress) AS displayname,
            COALESCE(m.isguestuser, FALSE) AS isguestuser,
            u.emailaddress
     FROM leagueseasonparticipants sp
     JOIN users u ON u.guid = sp.userid
     LEFT JOIN usermetadata m ON m.userid = sp.userid
     LEFT JOIN leaguemembers lm ON lm.leagueid = sp.leagueid AND lm.userid = sp.userid
     WHERE sp.leagueid = $1 AND sp.seasonid = $2 AND sp.participating = TRUE AND lm.userid IS NULL
     ORDER BY lower(COALESCE(NULLIF(trim(concat(COALESCE(m.firstname, ''), ' ', COALESCE(m.lastname, ''))), ''), m.nickname, u.emailaddress))`,
    [leagueId, seasonId],
  );

  const linked = await pool.query(
    `SELECT sp.userid,
            COALESCE(NULLIF(trim(concat(COALESCE(m.firstname, ''), ' ', COALESCE(m.lastname, ''))), ''), m.nickname, u.emailaddress) AS displayname,
            lm.approved, lm.participating AS league_participating
     FROM leagueseasonparticipants sp
     JOIN leaguemembers lm ON lm.leagueid = sp.leagueid AND lm.userid = sp.userid
     JOIN users u ON u.guid = sp.userid
     LEFT JOIN usermetadata m ON m.userid = sp.userid
     WHERE sp.leagueid = $1 AND sp.seasonid = $2 AND sp.participating = TRUE
     ORDER BY lower(COALESCE(NULLIF(trim(concat(COALESCE(m.firstname, ''), ' ', COALESCE(m.lastname, ''))), ''), m.nickname, u.emailaddress))`,
    [leagueId, seasonId],
  );

  console.log(JSON.stringify({ summary: summary.rows[0], missing: missing.rows, linked: linked.rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
