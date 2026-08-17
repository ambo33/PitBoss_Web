require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const LEAGUE_ID = 'dc6cc3af-dc67-4f67-8eeb-7c1d0f10a678';
const HISTORICAL_SEASONS = ['2024', '2025', '2026'];
const EXPECTED_COUNTS = { 2024: 28, 2025: 32, 2026: 36, 2027: 28 };
const MERGES = [
  {
    label: 'Andrew Guthrie imported history',
    targetUserId: 'f027bc85-e69a-4deb-af93-f51f50289de2',
    sourceUserIds: ['3a0d7785-6f17-4468-95bf-23cf6ca845f1'],
  },
  {
    label: 'Eric Wilkinson imported history',
    targetUserId: '0687a6c3-d121-4603-94d7-b79b081332d9',
    sourceUserIds: [
      'c07cbb2b-5cc6-4318-afe9-c86ee1d5e33b',
      '9a0aae04-eca9-415e-833f-1440b4164761',
    ],
  },
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=disable')
    ? false
    : { rejectUnauthorized: false },
});

async function seasonCounts(client) {
  const result = await client.query(`
    SELECT s.name,
           (SELECT count(*)::INT
            FROM leagueseasonparticipants sp
            WHERE sp.seasonid = s.seasonid AND sp.participating = TRUE) AS participants,
           (SELECT count(DISTINCT r.userid)::INT
            FROM leagueresults r
            JOIN leagueevents e ON e.eventid = r.eventid
            WHERE e.seasonid = s.seasonid) AS result_users
    FROM leagueseasons s
    WHERE s.leagueid = $1 AND s.name = ANY($2::STRING[])
    ORDER BY s.name
  `, [LEAGUE_ID, Object.keys(EXPECTED_COUNTS)]);
  return result.rows;
}

async function mergeIdentity(client, merge) {
  const target = await client.query(
    `SELECT leagueid, userid FROM leaguemembers WHERE leagueid = $1 AND userid = $2`,
    [LEAGUE_ID, merge.targetUserId]
  );
  if (!target.rows[0]) throw new Error(`${merge.label}: target league member does not exist.`);

  for (const sourceUserId of merge.sourceUserIds) {
    const source = await client.query(
      `SELECT admin, approved, participating, emailalertsenabled, pushalertsenabled
       FROM leaguemembers
       WHERE leagueid = $1 AND userid = $2`,
      [LEAGUE_ID, sourceUserId]
    );
    if (!source.rows[0]) continue;

    const conflicts = await client.query(`
      SELECT source.eventid
      FROM leagueresults source
      JOIN leagueresults target
        ON target.eventid = source.eventid
       AND target.userid = $3
      WHERE source.leagueid = $1 AND source.userid = $2
    `, [LEAGUE_ID, sourceUserId, merge.targetUserId]);
    if (conflicts.rowCount) {
      throw new Error(`${merge.label}: ${conflicts.rowCount} conflicting event result(s) require manual review.`);
    }

    await client.query(`
      UPDATE leaguemembers
      SET admin = admin OR $3,
          approved = approved OR $4,
          participating = participating OR $5,
          emailalertsenabled = emailalertsenabled OR $6,
          pushalertsenabled = pushalertsenabled OR $7
      WHERE leagueid = $1 AND userid = $2
    `, [
      LEAGUE_ID,
      merge.targetUserId,
      source.rows[0].admin,
      source.rows[0].approved,
      source.rows[0].participating,
      source.rows[0].emailalertsenabled,
      source.rows[0].pushalertsenabled,
    ]);

    await client.query(`
      INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
      SELECT seasonid, leagueid, $3, participating
      FROM leagueseasonparticipants
      WHERE leagueid = $1 AND userid = $2
      ON CONFLICT (seasonid, userid) DO UPDATE
      SET participating = leagueseasonparticipants.participating OR EXCLUDED.participating
    `, [LEAGUE_ID, sourceUserId, merge.targetUserId]);

    await client.query(
      `UPDATE leagueresults SET userid = $3 WHERE leagueid = $1 AND userid = $2`,
      [LEAGUE_ID, sourceUserId, merge.targetUserId]
    );
    await client.query(
      `UPDATE leaguepayments SET userid = $3 WHERE leagueid = $1 AND userid = $2`,
      [LEAGUE_ID, sourceUserId, merge.targetUserId]
    );
    await client.query(`
      DELETE FROM leagueeventrsvps source
      WHERE source.leagueid = $1
        AND source.userid = $2
        AND EXISTS (
          SELECT 1 FROM leagueeventrsvps target
          WHERE target.eventid = source.eventid AND target.userid = $3
        )
    `, [LEAGUE_ID, sourceUserId, merge.targetUserId]);
    await client.query(
      `UPDATE leagueeventrsvps SET userid = $3, updatedat = now() WHERE leagueid = $1 AND userid = $2`,
      [LEAGUE_ID, sourceUserId, merge.targetUserId]
    );
    await client.query(
      `UPDATE leagueauditlogs SET targetuserid = $3 WHERE leagueid = $1 AND targetuserid = $2`,
      [LEAGUE_ID, sourceUserId, merge.targetUserId]
    );
    await client.query(
      `UPDATE leagueauditlogs SET actorid = $3 WHERE leagueid = $1 AND actorid = $2`,
      [LEAGUE_ID, sourceUserId, merge.targetUserId]
    );
    await client.query(`
      UPDATE leagueguestclaims
      SET claimedby = $3,
          claimedat = COALESCE(claimedat, now())
      WHERE leagueid = $1 AND guestuserid = $2
    `, [LEAGUE_ID, sourceUserId, merge.targetUserId]);
    await client.query(
      `DELETE FROM leagueseasonparticipants WHERE leagueid = $1 AND userid = $2`,
      [LEAGUE_ID, sourceUserId]
    );
    await client.query(
      `DELETE FROM leaguemembers WHERE leagueid = $1 AND userid = $2`,
      [LEAGUE_ID, sourceUserId]
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const sourceIds = MERGES.flatMap((merge) => merge.sourceUserIds);
    const backup = {};
    for (const [key, sql] of Object.entries({
      members: `SELECT * FROM leaguemembers WHERE leagueid = $1 AND userid = ANY($2::UUID[])`,
      participants: `SELECT * FROM leagueseasonparticipants WHERE leagueid = $1 AND userid = ANY($2::UUID[])`,
      results: `SELECT * FROM leagueresults WHERE leagueid = $1 AND userid = ANY($2::UUID[])`,
      payments: `SELECT * FROM leaguepayments WHERE leagueid = $1 AND userid = ANY($2::UUID[])`,
      rsvps: `SELECT * FROM leagueeventrsvps WHERE leagueid = $1 AND userid = ANY($2::UUID[])`,
      claims: `SELECT * FROM leagueguestclaims WHERE leagueid = $1 AND guestuserid = ANY($2::UUID[])`,
    })) {
      backup[key] = (await client.query(sql, [LEAGUE_ID, sourceIds])).rows;
    }
    backup.countsBefore = await seasonCounts(client);

    const backupPath = path.join(__dirname, `league-integrity-backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`Backup: ${backupPath}`);
    console.table(backup.countsBefore);

    if (!APPLY) {
      console.log('Dry run only. Re-run with --apply to execute the transaction.');
      return;
    }

    await client.query('BEGIN');
    for (const merge of MERGES) await mergeIdentity(client, merge);

    const reconciled = await client.query(`
      UPDATE leagueseasonparticipants sp
      SET participating = FALSE
      FROM leagueseasons s
      WHERE s.seasonid = sp.seasonid
        AND s.leagueid = $1
        AND s.name = ANY($2::STRING[])
        AND sp.participating = TRUE
        AND NOT EXISTS (
          SELECT 1
          FROM leagueresults r
          JOIN leagueevents e ON e.eventid = r.eventid
          WHERE e.seasonid = sp.seasonid AND r.userid = sp.userid
        )
        AND NOT EXISTS (
          SELECT 1 FROM leaguepayments p
          WHERE p.seasonid = sp.seasonid AND p.userid = sp.userid
        )
        AND NOT EXISTS (
          SELECT 1
          FROM leagueeventrsvps rv
          JOIN leagueevents e ON e.eventid = rv.eventid
          WHERE e.seasonid = sp.seasonid AND rv.userid = sp.userid
        )
      RETURNING sp.seasonid, sp.userid
    `, [LEAGUE_ID, HISTORICAL_SEASONS]);

    const countsAfter = await seasonCounts(client);
    for (const row of countsAfter) {
      const expected = EXPECTED_COUNTS[row.name];
      if (expected != null && Number(row.participants) !== expected) {
        throw new Error(`Season ${row.name} has ${row.participants} participants; expected ${expected}.`);
      }
    }

    await client.query(`
      INSERT INTO leagueauditlogs (leagueid, action, summary, details)
      VALUES ($1, 'season_rosters_reconciled', 'Historical season rosters and imported player identities were reconciled.', $2::JSONB)
    `, [LEAGUE_ID, JSON.stringify({
      historicalSeasons: HISTORICAL_SEASONS,
      identitiesMerged: MERGES.map((merge) => merge.label),
      participationRowsDisabled: reconciled.rowCount,
      countsAfter,
    })]);

    await client.query('COMMIT');
    console.log(`Reconciled rows: ${reconciled.rowCount}`);
    console.table(countsAfter);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
