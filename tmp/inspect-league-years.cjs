require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=disable')
    ? false
    : { rejectUnauthorized: false },
});

const displayNameSql = `COALESCE(
  NULLIF(trim(concat(COALESCE(m.firstname, ''), ' ', COALESCE(m.lastname, ''))), ''),
  m.nickname,
  u.emailaddress
)`;

async function main() {
  const seasons = await pool.query(`
    SELECT
      l.leagueid,
      l.name AS leaguename,
      l.expectedplayercount,
      s.seasonid,
      s.name AS seasonname,
      (SELECT count(*) FROM leagueseasonparticipants sp WHERE sp.seasonid = s.seasonid AND sp.participating = TRUE) AS participants,
      (SELECT count(DISTINCT r.userid) FROM leagueresults r JOIN leagueevents e ON e.eventid = r.eventid WHERE e.seasonid = s.seasonid) AS result_users,
      (SELECT count(*) FROM leagueevents e WHERE e.seasonid = s.seasonid AND e.active = TRUE) AS events
    FROM leagues l
    JOIN leagueseasons s ON s.leagueid = l.leagueid
    WHERE s.name IN ('2024', '2025', '2026', '2027')
      AND l.leagueid = 'dc6cc3af-dc67-4f67-8eeb-7c1d0f10a678'
      AND COALESCE(s.active, TRUE) = TRUE
    ORDER BY l.createdat, s.name
  `);

  console.log('SEASONS');
  console.table(seasons.rows);

  for (const season of seasons.rows) {
    const duplicateNames = await pool.query(`
      SELECT lower(trim(${displayNameSql})) AS normalized_name,
             array_agg(json_build_object(
               'userid', sp.userid,
               'displayname', ${displayNameSql},
               'isguest', COALESCE(m.isguestuser, FALSE),
               'results', (SELECT count(*) FROM leagueresults r JOIN leagueevents e ON e.eventid = r.eventid WHERE e.seasonid = sp.seasonid AND r.userid = sp.userid),
               'claims', (SELECT count(*) FROM leagueguestclaims c WHERE c.leagueid = sp.leagueid AND c.guestuserid = sp.userid AND c.claimedat IS NOT NULL)
             ) ORDER BY sp.createdat) AS identities
      FROM leagueseasonparticipants sp
      JOIN users u ON u.guid = sp.userid
      LEFT JOIN usermetadata m ON m.userid = sp.userid
      WHERE sp.seasonid = $1 AND sp.participating = TRUE
      GROUP BY lower(trim(${displayNameSql}))
      HAVING count(*) > 1
      ORDER BY normalized_name
    `, [season.seasonid]);

    const noActivity = await pool.query(`
      SELECT sp.userid, ${displayNameSql} AS displayname, COALESCE(m.isguestuser, FALSE) AS isguestuser
      FROM leagueseasonparticipants sp
      JOIN users u ON u.guid = sp.userid
      LEFT JOIN usermetadata m ON m.userid = sp.userid
      WHERE sp.seasonid = $1
        AND sp.participating = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM leagueresults r JOIN leagueevents e ON e.eventid = r.eventid
          WHERE e.seasonid = sp.seasonid AND r.userid = sp.userid
        )
        AND NOT EXISTS (SELECT 1 FROM leaguepayments p WHERE p.seasonid = sp.seasonid AND p.userid = sp.userid)
        AND NOT EXISTS (
          SELECT 1 FROM leagueeventrsvps rv JOIN leagueevents e ON e.eventid = rv.eventid
          WHERE e.seasonid = sp.seasonid AND rv.userid = sp.userid
        )
      ORDER BY lower(${displayNameSql})
    `, [season.seasonid]);

    const eventNineDuplicates = await pool.query(`
      SELECT lower(trim(${displayNameSql})) AS normalized_name,
             array_agg(json_build_object(
               'userid', sp.userid,
               'displayname', ${displayNameSql},
               'isguest', COALESCE(m.isguestuser, FALSE),
               'placed', r.placed,
               'dnf', r.dnf,
               'resultid', r.resultid
             ) ORDER BY sp.createdat) AS identities
      FROM leagueseasonparticipants sp
      JOIN users u ON u.guid = sp.userid
      LEFT JOIN usermetadata m ON m.userid = sp.userid
      LEFT JOIN leagueevents e ON e.seasonid = sp.seasonid AND e.eventnumber = 9 AND e.active = TRUE
      LEFT JOIN leagueresults r ON r.eventid = e.eventid AND r.userid = sp.userid
      WHERE sp.seasonid = $1 AND sp.participating = TRUE
      GROUP BY lower(trim(${displayNameSql}))
      HAVING count(*) > 1
      ORDER BY normalized_name
    `, [season.seasonid]);

    console.log(JSON.stringify({
      league: season.leaguename,
      leagueid: season.leagueid,
      season: season.seasonname,
      seasonid: season.seasonid,
      duplicate_names: duplicateNames.rows,
      event_9_duplicate_names: eventNineDuplicates.rows,
      no_activity: noActivity.rows,
    }, null, 2));
  }

  const identityLinks = await pool.query(`
    SELECT
      c.guestuserid,
      guest_meta.nickname AS guest_name,
      c.claimedby,
      ${displayNameSql.replaceAll('m.', 'claimed_meta.').replaceAll('u.', 'claimed_user.')} AS claimed_name,
      claimed_user.emailaddress AS claimed_email,
      c.claimedat
    FROM leagueguestclaims c
    JOIN users guest_user ON guest_user.guid = c.guestuserid
    LEFT JOIN usermetadata guest_meta ON guest_meta.userid = guest_user.guid
    LEFT JOIN users claimed_user ON claimed_user.guid = c.claimedby
    LEFT JOIN usermetadata claimed_meta ON claimed_meta.userid = claimed_user.guid
    WHERE c.leagueid = 'dc6cc3af-dc67-4f67-8eeb-7c1d0f10a678'
      AND c.guestuserid IN (
        '3a0d7785-6f17-4468-95bf-23cf6ca845f1',
        'f027bc85-e69a-4deb-af93-f51f50289de2',
        'c07cbb2b-5cc6-4318-afe9-c86ee1d5e33b',
        '9a0aae04-eca9-415e-833f-1440b4164761'
      )
    ORDER BY c.createdat
  `);
  console.log('IDENTITY LINKS');
  console.log(JSON.stringify(identityLinks.rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
