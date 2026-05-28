import { pool } from './db';
import { encryptEmail, hashEmail, isPrivateEmailPlaceholder, privateEmailPlaceholder } from './privacy';

function generateTvCode(existing: Set<string>): string {
  let code = '';
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (existing.has(code));
  existing.add(code);
  return code;
}

export async function ensureDatabaseSchema(options: { closePool?: boolean } = {}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS appsettings (
        key STRING PRIMARY KEY,
        value STRING NOT NULL,
        updatedat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      INSERT INTO appsettings (key, value)
      VALUES ('default_ai_credits', COALESCE($1, '25'))
      ON CONFLICT (key) DO NOTHING
    `, [process.env.DEFAULT_AI_CREDITS ?? '25']);
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounttiers (
        tierid INT PRIMARY KEY,
        tierkey STRING(20) NOT NULL UNIQUE,
        displayname STRING(40) NOT NULL,
        sortorder INT NOT NULL DEFAULT 0
      )
    `);
    await client.query(`
      INSERT INTO accounttiers (tierid, tierkey, displayname, sortorder)
      VALUES
        (1, 'host', 'Host', 1),
        (2, 'club', 'Club', 2),
        (3, 'pro', 'Pro', 3)
      ON CONFLICT (tierid)
      DO UPDATE SET
        tierkey = EXCLUDED.tierkey,
        displayname = EXCLUDED.displayname,
        sortorder = EXCLUDED.sortorder
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS groupid UUID REFERENCES groups(groupid) ON DELETE SET NULL
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS rake DECIMAL(10,2) DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS payoutstructure STRING
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS rebuychips INT DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS rebuylastlevel INT
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS addonchips INT DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS genericrebuys INT DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS genericaddons INT DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS tvdisplaycode STRING(8)
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS tvgreetingdisplayenabled BOOL DEFAULT TRUE
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS tvgreetingaudioenabled BOOL DEFAULT TRUE
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS tvshowknockoutqrenabled BOOL DEFAULT TRUE
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS tvdisplaymode STRING(20) DEFAULT 'timer'
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS seatingmaxpertable INT DEFAULT 9
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS bountyenabled BOOL DEFAULT FALSE
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS bountymode STRING(20) DEFAULT 'manual'
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS bountyprizepool DECIMAL(10,2) DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS bountypooltype STRING(20) DEFAULT 'amount'
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS bountyroundingdenomination DECIMAL(10,2) DEFAULT 5
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS bountystartplace INT
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS bountyminpayout DECIMAL(10,2) DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS accounttier STRING DEFAULT 'free'
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS tierid INT REFERENCES accounttiers(tierid)
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS issuperadmin BOOL DEFAULT FALSE
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS hostedtournamentcount INT DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS aicreditsremaining INT
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS aicreditsrefreshedat TIMESTAMPTZ
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS checkinaudiodata STRING
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS checkinaudiofilename STRING(255)
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS avatarimagedata STRING
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS avatarfilename STRING(255)
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS termsacceptedat TIMESTAMPTZ
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS onboardingtourcompletedat TIMESTAMPTZ
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS phonenumber STRING(32)
    `);
    await client.query(`
      ALTER TABLE usermetadata
      ADD COLUMN IF NOT EXISTS smsoptedin BOOL DEFAULT FALSE
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS emailhash STRING(64)
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS emailencrypted STRING
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS defaulttrackingmode STRING(20) DEFAULT 'standard'
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS tvseatingwelcomemessage STRING(180) DEFAULT 'Welcome! Please see host to check-in!'
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS speechfiveminutemessage STRING(240) DEFAULT 'There are 5 minutes remaining in the current blind.'
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS speechoneminutemessage STRING(240) DEFAULT 'One minute remaining in the current blind.'
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS speechlevelupmessage STRING(240) DEFAULT 'Level {BlindLevel}. Small blind {SB}. Big blind {BB}.'
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS aiannouncerenabled BOOL DEFAULT FALSE
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS aiannouncerpreset STRING(30) DEFAULT 'all_in_alex'
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS aiannouncercustomprompt STRING(500)
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS aiannouncerclassicmode BOOL DEFAULT FALSE
    `);
    await client.query(`
      ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS postapprovalrequired BOOL DEFAULT TRUE
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS groupblindstructures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        groupid UUID NOT NULL REFERENCES groups(groupid) ON DELETE CASCADE,
        name STRING(120) NOT NULL,
        levels JSONB NOT NULL,
        createdby UUID REFERENCES users(guid) ON DELETE SET NULL,
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS groupposts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        groupid UUID NOT NULL REFERENCES groups(groupid) ON DELETE CASCADE,
        createdby UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        posttype STRING(20) NOT NULL DEFAULT 'message',
        message STRING(1200) NOT NULL,
        createdat TIMESTAMPTZ DEFAULT now(),
        active BOOL DEFAULT TRUE,
        status STRING(30) NOT NULL DEFAULT 'approved',
        approvedat TIMESTAMPTZ,
        approvedby UUID REFERENCES users(guid) ON DELETE SET NULL
      )
    `);
    await client.query(`
      ALTER TABLE groupposts
      ADD COLUMN IF NOT EXISTS status STRING(30) NOT NULL DEFAULT 'approved'
    `);
    await client.query(`
      ALTER TABLE groupposts
      ADD COLUMN IF NOT EXISTS approvedat TIMESTAMPTZ
    `);
    await client.query(`
      ALTER TABLE groupposts
      ADD COLUMN IF NOT EXISTS approvedby UUID REFERENCES users(guid) ON DELETE SET NULL
    `);
    await client.query(`
      UPDATE groupposts
      SET status = 'approved',
          approvedat = COALESCE(approvedat, createdat)
      WHERE status IS NULL OR status = ''
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS grouppolloptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        postid UUID NOT NULL REFERENCES groupposts(id) ON DELETE CASCADE,
        label STRING(240) NOT NULL,
        sortorder INT DEFAULT 0
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS grouppollvotes (
        postid UUID NOT NULL REFERENCES groupposts(id) ON DELETE CASCADE,
        optionid UUID NOT NULL REFERENCES grouppolloptions(id) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        createdat TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (postid, userid)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS groupcomments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        postid UUID NOT NULL REFERENCES groupposts(id) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        message STRING(800) NOT NULL,
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE groupmembers
      ADD COLUMN IF NOT EXISTS emailalertsenabled BOOL DEFAULT TRUE
    `);
    await client.query(`
      ALTER TABLE groupmembers
      ADD COLUMN IF NOT EXISTS smsalertsenabled BOOL DEFAULT FALSE
    `);
    await client.query(`
      ALTER TABLE groupmembers
      ADD COLUMN IF NOT EXISTS pushalertsenabled BOOL DEFAULT TRUE
    `);
    await client.query(`
      ALTER TABLE groupmembers
      ALTER COLUMN pushalertsenabled SET DEFAULT TRUE
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        userid UUID REFERENCES users(guid) ON DELETE SET NULL,
        type STRING(30) NOT NULL DEFAULT 'issue',
        message STRING(2000) NOT NULL,
        pageurl STRING(500),
        useragent STRING(500),
        status STRING(30) NOT NULL DEFAULT 'new',
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      UPDATE usermetadata
      SET tierid = CASE
        WHEN COALESCE(accounttier, 'free') = 'premium' THEN 2
        ELSE 1
      END
      WHERE tierid IS NULL
    `);

    const existingCodeRows = await client.query<{ tvdisplaycode: string | null }>(`
      SELECT tvdisplaycode
      FROM tournaments
      WHERE tvdisplaycode IS NOT NULL
    `);
    const existingCodes = new Set(
      existingCodeRows.rows
        .map((row) => row.tvdisplaycode)
        .filter((value): value is string => Boolean(value))
    );
    const missingCodeRows = await client.query<{ tournamentid: string }>(`
      SELECT tournamentid
      FROM tournaments
      WHERE tvdisplaycode IS NULL OR length(tvdisplaycode) < 6
    `);
    for (const row of missingCodeRows.rows) {
      await client.query(
        `UPDATE tournaments
         SET tvdisplaycode = $2
         WHERE tournamentid = $1`,
        [row.tournamentid, generateTvCode(existingCodes)]
      );
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_invitecode
      ON groups (invitecode)
    `);
    const emailRows = await client.query<{ guid: string; emailaddress: string | null; emailhash: string | null; emailencrypted: string | null }>(`
      SELECT guid, emailaddress, emailhash, emailencrypted
      FROM users
      WHERE emailaddress IS NOT NULL
    `);
    for (const row of emailRows.rows) {
      if (!row.emailaddress) continue;
      const sourceEmail = isPrivateEmailPlaceholder(row.emailaddress) ? null : row.emailaddress;
      const nextHash = row.emailhash ?? (sourceEmail ? hashEmail(sourceEmail) : null);
      const nextEncrypted = row.emailencrypted ?? (sourceEmail ? encryptEmail(sourceEmail) : null);
      await client.query(
        `UPDATE users
         SET emailhash = COALESCE($2, emailhash),
             emailencrypted = COALESCE($3, emailencrypted),
             emailaddress = $4
         WHERE guid = $1`,
        [row.guid, nextHash, nextEncrypted, privateEmailPlaceholder(row.guid)]
      );
    }
    await client.query(`
      DROP INDEX IF EXISTS unique_users_emailhash
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_emailhash
      ON users (emailhash)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_tournament_tvdisplaycode
      ON tournaments (tvdisplaycode)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournamentchips (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournamentid UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
        denomination INT NOT NULL,
        color STRING(30) NOT NULL,
        quantity INT DEFAULT 0,
        sortorder INT DEFAULT 0
      )
    `);
    await client.query(`
      ALTER TABLE tournamentplayers
      ADD COLUMN IF NOT EXISTS knockedoutbyuserid UUID
    `);
    await client.query(`
      ALTER TABLE tournamentplayers
      ADD COLUMN IF NOT EXISTS knockedoutat TIMESTAMPTZ
    `);
    await client.query(`
      ALTER TABLE tournamentplayers
      ADD COLUMN IF NOT EXISTS bountyamount DECIMAL(10,2) DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE tournamentplayers
      ADD COLUMN IF NOT EXISTS bountyclaimedbyuserid UUID
    `);
    await client.query(`
      ALTER TABLE tournamentplayers
      ADD COLUMN IF NOT EXISTS bountyclaimedat TIMESTAMPTZ
    `);
    await client.query(`
      ALTER TABLE tournamentplayers
      ADD COLUMN IF NOT EXISTS reminderemailsentat TIMESTAMPTZ
    `);
    await client.query(`
      ALTER TABLE tournamentplayers
      ADD COLUMN IF NOT EXISTS reminderpushsentat TIMESTAMPTZ
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournamentdeclines (
        tournamentid UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        declinedat TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (tournamentid, userid)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS groupcoins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        groupid UUID NOT NULL REFERENCES groups(groupid) ON DELETE CASCADE,
        name STRING(80) NOT NULL,
        description STRING(240),
        imagedata STRING,
        imageurl STRING(240),
        imagefilename STRING(160),
        createdby UUID REFERENCES users(guid),
        active BOOL DEFAULT TRUE,
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS publicblindtimers (
        code STRING(6) PRIMARY KEY,
        name STRING(120) NOT NULL DEFAULT 'Poker Timer',
        levels JSONB NOT NULL,
        state JSONB,
        soundannouncementsenabled BOOL DEFAULT FALSE,
        emailhash STRING(64),
        emailencrypted STRING,
        promoconsentat TIMESTAMPTZ,
        promounsubscribetoken STRING(64),
        promooptoutat TIMESTAMPTZ,
        createdat TIMESTAMPTZ DEFAULT now(),
        updatedat TIMESTAMPTZ DEFAULT now(),
        lastaccessedat TIMESTAMPTZ
      )
    `);
    await client.query(`
      ALTER TABLE publicblindtimers
      ADD COLUMN IF NOT EXISTS state JSONB
    `);
    await client.query(`
      ALTER TABLE publicblindtimers
      ADD COLUMN IF NOT EXISTS soundannouncementsenabled BOOL DEFAULT FALSE
    `);
    await client.query(`
      ALTER TABLE publicblindtimers
      ADD COLUMN IF NOT EXISTS promounsubscribetoken STRING(64)
    `);
    await client.query(`
      ALTER TABLE publicblindtimers
      ADD COLUMN IF NOT EXISTS promooptoutat TIMESTAMPTZ
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_publicblindtimers_unsubscribe
      ON publicblindtimers (promounsubscribetoken)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagues (
        leagueid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        userid UUID NOT NULL REFERENCES users(guid),
        name STRING(160) NOT NULL,
        invitecode STRING(12) UNIQUE NOT NULL,
        approvalneeded BOOL DEFAULT FALSE,
        expectedplayercount INT DEFAULT 36,
        leaguefee DECIMAL(10,2) DEFAULT 0,
        pereventfee DECIMAL(10,2) DEFAULT 0,
        showupbonuspoints INT DEFAULT 300,
        bestfinishcount INT DEFAULT 7,
        pointslookup JSONB NOT NULL,
        finalenabled BOOL DEFAULT FALSE,
        finalmultiplierlookup JSONB DEFAULT '[]',
        finalchiprounding INT DEFAULT 100,
        finalstartingbigblind INT DEFAULT 100,
        active BOOL DEFAULT TRUE,
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS userid UUID REFERENCES users(guid)`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS name STRING(160) DEFAULT 'League'`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS invitecode STRING(12)`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS approvalneeded BOOL DEFAULT FALSE`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS expectedplayercount INT DEFAULT 36`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS leaguefee DECIMAL(10,2) DEFAULT 0`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS pereventfee DECIMAL(10,2) DEFAULT 0`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS showupbonuspoints INT DEFAULT 300`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS bestfinishcount INT DEFAULT 7`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS pointslookup JSONB DEFAULT '[{"place":"DNF","points":0},{"place":1,"points":671},{"place":2,"points":448},{"place":3,"points":336}]'`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS finalenabled BOOL DEFAULT FALSE`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS finalmultiplierlookup JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS finalchiprounding INT DEFAULT 100`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS finalstartingbigblind INT DEFAULT 100`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS active BOOL DEFAULT TRUE`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS createdat TIMESTAMPTZ DEFAULT now()`);
    await client.query(`ALTER TABLE leagues ALTER COLUMN active SET DEFAULT TRUE`);
    await client.query(`UPDATE leagues SET active = TRUE WHERE active IS NULL`);
    await client.query(`UPDATE leagues SET expectedplayercount = 36 WHERE expectedplayercount IS NULL`);
    await client.query(`UPDATE leagues SET leaguefee = 0 WHERE leaguefee IS NULL`);
    await client.query(`UPDATE leagues SET pereventfee = 0 WHERE pereventfee IS NULL`);
    await client.query(`UPDATE leagues SET finalenabled = FALSE WHERE finalenabled IS NULL`);
    await client.query(`UPDATE leagues SET finalmultiplierlookup = '[]' WHERE finalmultiplierlookup IS NULL`);
    await client.query(`UPDATE leagues SET finalchiprounding = 100 WHERE finalchiprounding IS NULL`);
    await client.query(`UPDATE leagues SET finalstartingbigblind = 100 WHERE finalstartingbigblind IS NULL`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagueseasons (
        seasonid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leagueid UUID NOT NULL REFERENCES leagues(leagueid) ON DELETE CASCADE,
        name STRING(160) NOT NULL,
        begindate DATE NOT NULL,
        enddate DATE NOT NULL,
        pereventfee DECIMAL(10,2) DEFAULT 0,
        active BOOL DEFAULT TRUE,
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE leagueseasons ADD COLUMN IF NOT EXISTS pereventfee DECIMAL(10,2) DEFAULT 0`);
    await client.query(`
      UPDATE leagueseasons s
      SET pereventfee = COALESCE(l.pereventfee, 0)
      FROM leagues l
      WHERE l.leagueid = s.leagueid
        AND s.pereventfee IS NULL
    `);
    await client.query(`
      INSERT INTO leagueseasons (leagueid, name, begindate, enddate, pereventfee)
      SELECT l.leagueid, 'Season 1', current_date(), CAST(current_date() + INTERVAL '365 days' AS DATE), COALESCE(l.pereventfee, 0)
      FROM leagues l
      WHERE NOT EXISTS (
        SELECT 1 FROM leagueseasons s WHERE s.leagueid = l.leagueid
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaguemembers (
        leagueid UUID NOT NULL REFERENCES leagues(leagueid) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        admin BOOL DEFAULT FALSE,
        approved BOOL DEFAULT TRUE,
        participating BOOL DEFAULT TRUE,
        joinedat TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (leagueid, userid)
      )
    `);
    await client.query(`ALTER TABLE leaguemembers ADD COLUMN IF NOT EXISTS participating BOOL DEFAULT TRUE`);
    await client.query(`ALTER TABLE leaguemembers ADD COLUMN IF NOT EXISTS emailalertsenabled BOOL DEFAULT TRUE`);
    await client.query(`ALTER TABLE leaguemembers ADD COLUMN IF NOT EXISTS pushalertsenabled BOOL DEFAULT TRUE`);
    await client.query(`ALTER TABLE leaguemembers ALTER COLUMN pushalertsenabled SET DEFAULT TRUE`);
    await client.query(`UPDATE leaguemembers SET participating = TRUE WHERE participating IS NULL`);
    await client.query(`UPDATE leaguemembers SET emailalertsenabled = TRUE WHERE emailalertsenabled IS NULL`);
    await client.query(`UPDATE leaguemembers SET pushalertsenabled = TRUE WHERE pushalertsenabled IS NULL`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagueguestclaims (
        claimid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leagueid UUID NOT NULL REFERENCES leagues(leagueid) ON DELETE CASCADE,
        guestuserid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        emailhash STRING(64) NOT NULL,
        emailencrypted STRING,
        tokenhash STRING(64) UNIQUE NOT NULL,
        invitedby UUID REFERENCES users(guid) ON DELETE SET NULL,
        claimedby UUID REFERENCES users(guid) ON DELETE SET NULL,
        seasonid UUID REFERENCES leagueseasons(seasonid) ON DELETE CASCADE,
        expiresat TIMESTAMPTZ NOT NULL,
        claimedat TIMESTAMPTZ,
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE leagueguestclaims ADD COLUMN IF NOT EXISTS seasonid UUID REFERENCES leagueseasons(seasonid) ON DELETE CASCADE`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leagueguestclaims_guest
      ON leagueguestclaims (leagueid, guestuserid, claimedat)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leagueguestclaims_token
      ON leagueguestclaims (tokenhash)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagueseasonparticipants (
        seasonid UUID NOT NULL REFERENCES leagueseasons(seasonid) ON DELETE CASCADE,
        leagueid UUID NOT NULL REFERENCES leagues(leagueid) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        participating BOOL DEFAULT TRUE,
        createdat TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (seasonid, userid)
      )
    `);
    await client.query(`
      INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
      SELECT s.seasonid, s.leagueid, lm.userid, COALESCE(lm.participating, TRUE)
      FROM leagueseasons s
      JOIN leaguemembers lm ON lm.leagueid = s.leagueid
      WHERE lm.approved = TRUE
      ON CONFLICT (seasonid, userid) DO NOTHING
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagueevents (
        eventid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leagueid UUID NOT NULL REFERENCES leagues(leagueid) ON DELETE CASCADE,
        seasonid UUID REFERENCES leagueseasons(seasonid) ON DELETE CASCADE,
        name STRING(160) NOT NULL,
        eventdate DATE,
        eventtime STRING(5),
        eventnumber INT,
        eventfee DECIMAL(10,2),
        active BOOL DEFAULT TRUE,
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE leagueevents ADD COLUMN IF NOT EXISTS seasonid UUID REFERENCES leagueseasons(seasonid) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE leagueevents ADD COLUMN IF NOT EXISTS eventtime STRING(5)`);
    await client.query(`ALTER TABLE leagueevents ADD COLUMN IF NOT EXISTS eventfee DECIMAL(10,2)`);
    await client.query(`
      UPDATE leagueevents e
      SET seasonid = (
        SELECT s.seasonid
        FROM leagueseasons s
        WHERE s.leagueid = e.leagueid AND COALESCE(s.active, TRUE) = TRUE
        ORDER BY s.begindate DESC, s.createdat DESC
        LIMIT 1
      )
      WHERE e.seasonid IS NULL
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagueeventrsvps (
        rsvpid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        eventid UUID NOT NULL REFERENCES leagueevents(eventid) ON DELETE CASCADE,
        leagueid UUID NOT NULL REFERENCES leagues(leagueid) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        status STRING(20) NOT NULL DEFAULT 'going',
        createdat TIMESTAMPTZ DEFAULT now(),
        updatedat TIMESTAMPTZ DEFAULT now(),
        UNIQUE (eventid, userid)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagueresults (
        resultid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        eventid UUID NOT NULL REFERENCES leagueevents(eventid) ON DELETE CASCADE,
        leagueid UUID NOT NULL REFERENCES leagues(leagueid) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        placed INT,
        dnf BOOL DEFAULT FALSE,
        points INT DEFAULT 0,
        showupbonuspoints INT DEFAULT 0,
        loggedby UUID REFERENCES users(guid),
        createdat TIMESTAMPTZ DEFAULT now(),
        updatedat TIMESTAMPTZ DEFAULT now(),
        UNIQUE (eventid, userid)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaguepayments (
        paymentid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leagueid UUID NOT NULL REFERENCES leagues(leagueid) ON DELETE CASCADE,
        seasonid UUID REFERENCES leagueseasons(seasonid) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        eventid UUID REFERENCES leagueevents(eventid) ON DELETE SET NULL,
        paymenttype STRING(20) DEFAULT 'league',
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        paidat DATE DEFAULT current_date(),
        note STRING(240),
        recordedby UUID REFERENCES users(guid),
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE leaguepayments ADD COLUMN IF NOT EXISTS seasonid UUID REFERENCES leagueseasons(seasonid) ON DELETE CASCADE`);
    await client.query(`
      UPDATE leaguepayments p
      SET seasonid = COALESCE(
        (SELECT e.seasonid FROM leagueevents e WHERE e.eventid = p.eventid),
        (SELECT s.seasonid
         FROM leagueseasons s
         WHERE s.leagueid = p.leagueid AND COALESCE(s.active, TRUE) = TRUE
         ORDER BY s.begindate DESC, s.createdat DESC
         LIMIT 1)
      )
      WHERE p.seasonid IS NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leagueevents_league
      ON leagueevents (leagueid, eventnumber)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leagueeventrsvps_event
      ON leagueeventrsvps (eventid, status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leagueresults_league
      ON leagueresults (leagueid, userid)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leaguepayments_league
      ON leaguepayments (leagueid, userid)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagueauditlogs (
        auditid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leagueid UUID NOT NULL REFERENCES leagues(leagueid) ON DELETE CASCADE,
        seasonid UUID REFERENCES leagueseasons(seasonid) ON DELETE SET NULL,
        eventid UUID REFERENCES leagueevents(eventid) ON DELETE SET NULL,
        actorid UUID REFERENCES users(guid) ON DELETE SET NULL,
        targetuserid UUID REFERENCES users(guid) ON DELETE SET NULL,
        action STRING(80) NOT NULL,
        summary STRING(500) NOT NULL,
        details JSONB DEFAULT '{}',
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leagueauditlogs_league_created
      ON leagueauditlogs (leagueid, createdat DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leagueauditlogs_actor
      ON leagueauditlogs (actorid, createdat DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagueeventreminders (
        eventid UUID NOT NULL REFERENCES leagueevents(eventid) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        emailsentat TIMESTAMPTZ,
        pushsentat TIMESTAMPTZ,
        createdat TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (eventid, userid)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pushsubscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        userid UUID REFERENCES users(guid) ON DELETE CASCADE,
        endpoint STRING NOT NULL UNIQUE,
        p256dh STRING NOT NULL,
        auth STRING NOT NULL,
        useragent STRING(500),
        createdat TIMESTAMPTZ DEFAULT now(),
        updatedat TIMESTAMPTZ DEFAULT now(),
        disabledat TIMESTAMPTZ,
        lastsuccessat TIMESTAMPTZ,
        lastfailureat TIMESTAMPTZ
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pushsubscriptions_user_active
      ON pushsubscriptions (userid, disabledat)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS notificationpreferences (
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        category STRING(60) NOT NULL,
        enabled BOOL NOT NULL DEFAULT TRUE,
        digestonly BOOL NOT NULL DEFAULT FALSE,
        createdat TIMESTAMPTZ DEFAULT now(),
        updatedat TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (userid, category)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS notificationlog (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        type STRING(80) NOT NULL,
        category STRING(60) NOT NULL,
        entitytype STRING(60),
        entityid STRING(120),
        tag STRING(240) NOT NULL,
        status STRING(40) NOT NULL,
        error STRING(500),
        sentat TIMESTAMPTZ,
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notificationlog_user_tag
      ON notificationlog (userid, tag)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notificationlog_entity
      ON notificationlog (entitytype, entityid, type)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        groupid UUID NOT NULL REFERENCES groups(groupid) ON DELETE CASCADE,
        createdbyuserid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        gametype STRING(20) NOT NULL CHECK (gametype IN ('tournament', 'cash')),
        title STRING(160) NOT NULL,
        status STRING(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
        visibility STRING(24) NOT NULL DEFAULT 'group_public' CHECK (visibility IN ('group_public', 'invite_only')),
        startsat TIMESTAMPTZ,
        tournamentid UUID REFERENCES tournaments(tournamentid) ON DELETE SET NULL,
        createdat TIMESTAMPTZ DEFAULT now(),
        updatedat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_games_group_status
      ON games (groupid, status, startsat)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_games_visibility
      ON games (visibility, groupid)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cashgamedetails (
        gameid UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
        stakeslabel STRING(80) NOT NULL,
        minbuyin DECIMAL(12,2),
        maxbuyin DECIMAL(12,2),
        seatsavailable INT,
        notes STRING(1000),
        updatedat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS gameinvitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gameid UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        invitedbyuserid UUID REFERENCES users(guid) ON DELETE SET NULL,
        rsvpstatus STRING(20) CHECK (rsvpstatus IN ('going', 'not_going')),
        createdat TIMESTAMPTZ DEFAULT now(),
        updatedat TIMESTAMPTZ DEFAULT now(),
        UNIQUE (gameid, userid)
      )
    `);
    await client.query(`ALTER TABLE gameinvitations ADD COLUMN IF NOT EXISTS rsvpstatus STRING(20)`);
    await client.query(`ALTER TABLE gameinvitations ADD COLUMN IF NOT EXISTS updatedat TIMESTAMPTZ DEFAULT now()`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gameinvitations_user
      ON gameinvitations (userid, gameid)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cashgameplayers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gameid UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        displaynamesnapshot STRING(160),
        status STRING(24) NOT NULL DEFAULT 'interested' CHECK (status IN ('interested', 'seated', 'cashed_out', 'removed')),
        buyintotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        addontotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        cashouttotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        createdat TIMESTAMPTZ DEFAULT now(),
        updatedat TIMESTAMPTZ DEFAULT now(),
        UNIQUE (gameid, userid)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cashgameplayers_game
      ON cashgameplayers (gameid, status)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cashgameledgerevents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gameid UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        userid UUID REFERENCES users(guid) ON DELETE SET NULL,
        eventtype STRING(40) NOT NULL CHECK (eventtype IN ('buy_in', 'add_on', 'cash_out', 'status_change', 'removed')),
        amount DECIMAL(12,2),
        createdbyuserid UUID REFERENCES users(guid) ON DELETE SET NULL,
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cashgameledgerevents_game
      ON cashgameledgerevents (gameid, createdat DESC)
    `);
    await client.query(`
      ALTER TABLE groupcoins
      ADD COLUMN IF NOT EXISTS imageurl STRING(240)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS groupcoinawards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        groupid UUID NOT NULL REFERENCES groups(groupid) ON DELETE CASCADE,
        coinid UUID NOT NULL REFERENCES groupcoins(id) ON DELETE CASCADE,
        userid UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
        awardedby UUID REFERENCES users(guid),
        note STRING(240),
        createdat TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log('Schema ready: tier tables, admin flags, hosted tournament counts, tournament group defaults, saved blind structures, rake, payout structure, rebuy/add-on chip fields, invite code uniqueness, TV display codes, TV greeting settings, profile media, chip sets, knockout tracking, tournament bounties, and group coins are available.');
  } finally {
    client.release();
    if (options.closePool) {
      await pool.end();
    }
  }
}
