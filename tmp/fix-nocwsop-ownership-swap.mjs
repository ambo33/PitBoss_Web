import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=disable')
    ? false
    : { rejectUnauthorized: false },
});

const leagueId = 'dc6cc3af-dc67-4f67-8eeb-7c1d0f10a678';
const realAmboId = '23912c7c-a1ff-4cf9-8936-a48006eb8139';
const guestAmboId = '511695ce-0f10-4180-8b42-654a1f71a382';
const brandonGuestId = 'd786fc0d-3085-4027-939b-1ce36dc67c1a';
const randomBrandonId = 'fef48bd4-da92-41ca-9741-db79d4fe1a36';
const wrongAmbo2ClaimId = 'f135dd54-54fc-437b-b652-7b3dd50e95eb';
const brandonClaimId = '66bed987-0fbc-4417-9507-b240adb3b2a5';

async function mergeLeagueUser(client, fromUserId, toUserId) {
  await client.query(
    `
      DELETE FROM leagueresults source
      WHERE source.leagueid = $1
        AND source.userid = $2
        AND EXISTS (
          SELECT 1
          FROM leagueresults target
          WHERE target.eventid = source.eventid
            AND target.userid = $3
        )
    `,
    [leagueId, fromUserId, toUserId],
  );
  await client.query(
    `UPDATE leagueresults SET userid = $3 WHERE leagueid = $1 AND userid = $2`,
    [leagueId, fromUserId, toUserId],
  );
  await client.query(
    `UPDATE leaguepayments SET userid = $3 WHERE leagueid = $1 AND userid = $2`,
    [leagueId, fromUserId, toUserId],
  );
  await client.query(
    `
      DELETE FROM leagueeventrsvps source
      WHERE source.leagueid = $1
        AND source.userid = $2
        AND EXISTS (
          SELECT 1
          FROM leagueeventrsvps target
          WHERE target.eventid = source.eventid
            AND target.userid = $3
        )
    `,
    [leagueId, fromUserId, toUserId],
  );
  await client.query(
    `UPDATE leagueeventrsvps SET userid = $3, updatedat = now() WHERE leagueid = $1 AND userid = $2`,
    [leagueId, fromUserId, toUserId],
  );
  await client.query(
    `
      INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
      SELECT seasonid, leagueid, $3, participating
      FROM leagueseasonparticipants
      WHERE leagueid = $1 AND userid = $2
      ON CONFLICT (seasonid, userid) DO UPDATE
      SET participating = leagueseasonparticipants.participating OR EXCLUDED.participating
    `,
    [leagueId, fromUserId, toUserId],
  );
  await client.query(
    `DELETE FROM leagueseasonparticipants WHERE leagueid = $1 AND userid = $2`,
    [leagueId, fromUserId],
  );
  await client.query(
    `
      INSERT INTO leaguemembers (leagueid, userid, admin, approved, participating, emailalertsenabled, pushalertsenabled)
      SELECT leagueid, $3, admin, approved, participating, emailalertsenabled, pushalertsenabled
      FROM leaguemembers
      WHERE leagueid = $1 AND userid = $2
      ON CONFLICT (leagueid, userid) DO UPDATE
      SET approved = leaguemembers.approved OR EXCLUDED.approved,
          participating = leaguemembers.participating OR EXCLUDED.participating,
          emailalertsenabled = leaguemembers.emailalertsenabled OR EXCLUDED.emailalertsenabled,
          pushalertsenabled = leaguemembers.pushalertsenabled OR EXCLUDED.pushalertsenabled
    `,
    [leagueId, fromUserId, toUserId],
  );
  await client.query(
    `DELETE FROM leaguemembers WHERE leagueid = $1 AND userid = $2`,
    [leagueId, fromUserId],
  );
}

const client = await pool.connect();
try {
  await client.query('BEGIN');

  await mergeLeagueUser(client, guestAmboId, realAmboId);

  await client.query(
    `
      UPDATE leagueguestclaims
      SET guestuserid = $2,
          claimedby = $3,
          claimedat = COALESCE(claimedat, now())
      WHERE claimid = $1
    `,
    [wrongAmbo2ClaimId, guestAmboId, realAmboId],
  );
  await client.query(
    `
      UPDATE leagueguestclaims
      SET claimedby = $2,
          claimedat = COALESCE(claimedat, now())
      WHERE claimid = $1
    `,
    [brandonClaimId, randomBrandonId],
  );

  await client.query(
    `
      INSERT INTO leagueauditlogs (leagueid, actorid, targetuserid, action, summary, details)
      VALUES
        ($1, $2, $3, 'league_member_ownership_corrected', 'League player ownership was corrected.', $4),
        ($1, $2, $5, 'league_member_ownership_corrected', 'League player ownership was corrected.', $6)
    `,
    [
      leagueId,
      realAmboId,
      realAmboId,
      JSON.stringify({ previousGuestUserId: guestAmboId, note: 'Mapped imported Ambo seat to real Ambo account.' }),
      randomBrandonId,
      JSON.stringify({ previousGuestUserId: brandonGuestId, note: 'Mapped Brandon Clark seat to RandomBrandon account.' }),
    ],
  );

  await client.query('COMMIT');
  console.log(JSON.stringify({ success: true }, null, 2));
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
