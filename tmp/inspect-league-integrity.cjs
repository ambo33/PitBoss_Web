require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=disable')
    ? false
    : { rejectUnauthorized: false },
});

async function main() {
  const leagues = await pool.query(`
    SELECT leagueid, name, expectedplayercount
    FROM leagues
    ORDER BY createdat
  `);

  for (const league of leagues.rows) {
    const seasons = await pool.query(`
      SELECT
        s.seasonid,
        s.name,
        s.begindate,
        s.enddate,
        (SELECT count(*)
         FROM leagueseasonparticipants sp
         WHERE sp.seasonid = s.seasonid AND sp.participating = TRUE) AS participants,
        (SELECT count(DISTINCT r.userid)
         FROM leagueresults r
         JOIN leagueevents e ON e.eventid = r.eventid
         WHERE e.seasonid = s.seasonid) AS result_users,
        (SELECT count(*)
         FROM leagueevents e
         WHERE e.seasonid = s.seasonid AND e.active = TRUE) AS events
      FROM leagueseasons s
      WHERE s.leagueid = $1 AND COALESCE(s.active, TRUE) = TRUE
      ORDER BY s.begindate DESC NULLS LAST, s.createdat DESC
    `, [league.leagueid]);

    console.log(JSON.stringify({ league, seasons: seasons.rows }, null, 2));

    for (const season of seasons.rows) {
      const inactiveCandidates = await pool.query(`
        SELECT
          sp.userid,
          COALESCE(NULLIF(trim(concat(COALESCE(m.firstname, ''), ' ', COALESCE(m.lastname, ''))), ''), m.nickname, u.emailaddress) AS displayname,
          COALESCE(m.isguestuser, FALSE) AS isguestuser,
          (SELECT count(*) FROM leagueresults r JOIN leagueevents e ON e.eventid = r.eventid WHERE e.seasonid = sp.seasonid AND r.userid = sp.userid) AS result_count,
          (SELECT count(*) FROM leaguepayments p WHERE p.seasonid = sp.seasonid AND p.userid = sp.userid) AS payment_count,
          (SELECT count(*) FROM leagueeventrsvps rv JOIN leagueevents e ON e.eventid = rv.eventid WHERE e.seasonid = sp.seasonid AND rv.userid = sp.userid) AS rsvp_count
        FROM leagueseasonparticipants sp
        JOIN users u ON u.guid = sp.userid
        LEFT JOIN usermetadata m ON m.userid = sp.userid
        WHERE sp.seasonid = $1 AND sp.participating = TRUE
        ORDER BY lower(COALESCE(NULLIF(trim(concat(COALESCE(m.firstname, ''), ' ', COALESCE(m.lastname, ''))), ''), m.nickname, u.emailaddress))
      `, [season.seasonid]);

      const noActivity = inactiveCandidates.rows.filter((row) =>
        Number(row.result_count) === 0 && Number(row.payment_count) === 0 && Number(row.rsvp_count) === 0
      );

      console.log(JSON.stringify({
        season: season.name,
        no_activity_count: noActivity.length,
        no_activity: noActivity,
      }, null, 2));

      if (String(season.name) === '2026') {
        const eventNine = await pool.query(`
          SELECT
            e.eventid,
            e.name AS eventname,
            r.resultid,
            r.userid,
            r.placed,
            r.dnf,
            r.points,
            u.emailaddress,
            COALESCE(m.isguestuser, FALSE) AS isguestuser,
            m.firstname,
            m.lastname,
            m.nickname,
            COALESCE(NULLIF(trim(concat(COALESCE(m.firstname, ''), ' ', COALESCE(m.lastname, ''))), ''), m.nickname, u.emailaddress) AS displayname,
            c.claimedby
          FROM leagueevents e
          LEFT JOIN leagueresults r ON r.eventid = e.eventid
          LEFT JOIN users u ON u.guid = r.userid
          LEFT JOIN usermetadata m ON m.userid = r.userid
          LEFT JOIN LATERAL (
            SELECT claimedby
            FROM leagueguestclaims c
            WHERE c.leagueid = e.leagueid AND c.guestuserid = r.userid AND c.claimedat IS NOT NULL
            ORDER BY c.claimedat DESC
            LIMIT 1
          ) c ON TRUE
          WHERE e.seasonid = $1 AND e.eventnumber = 9
          ORDER BY lower(COALESCE(NULLIF(trim(concat(COALESCE(m.firstname, ''), ' ', COALESCE(m.lastname, ''))), ''), m.nickname, u.emailaddress)), r.createdat
        `, [season.seasonid]);

        console.log(JSON.stringify({ season: season.name, event9: eventNine.rows }, null, 2));
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
