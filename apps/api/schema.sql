-- PitBoss schema for CockroachDB (PostgreSQL-compatible)
-- Run once against your defaultdb: cockroach sql --url "..." < schema.sql

CREATE TABLE IF NOT EXISTS users (
  guid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emailaddress  STRING(255) UNIQUE NOT NULL,
  password      STRING(255) NOT NULL,
  emailverified BOOL DEFAULT FALSE,
  verificationpin STRING(10),
  resetguid     UUID,
  createdat     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS demosessions (
  demosessionid  STRING(64) PRIMARY KEY,
  demohostuserid UUID,
  tournamentid   UUID,
  groupid        UUID,
  tvdisplaycode  STRING(8),
  status         STRING(20) NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'claimed', 'purged')),
  claimedat      TIMESTAMPTZ,
  purgedat       TIMESTAMPTZ,
  createdat      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demosessions_status_created
  ON demosessions (status, createdat);

CREATE INDEX IF NOT EXISTS idx_demosessions_claimed
  ON demosessions (status, claimedat);

CREATE TABLE IF NOT EXISTS anonymoustournamentdrafts (
  draftid             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymoussessionid STRING(96) NOT NULL,
  status             STRING(20) NOT NULL DEFAULT 'anonymous' CHECK (status IN ('anonymous', 'claim_pending', 'claimed', 'expired')),
  wizardinput        JSONB NOT NULL,
  generatedstructure JSONB NOT NULL,
  tournamentconfig   JSONB NOT NULL,
  version            INT NOT NULL DEFAULT 1,
  expiresat          TIMESTAMPTZ NOT NULL,
  claimedbyuserid    UUID,
  claimedtournamentid UUID,
  createdat          TIMESTAMPTZ DEFAULT now(),
  updatedat          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anonymoustournamentdrafts_session
  ON anonymoustournamentdrafts (anonymoussessionid, updatedat);

CREATE INDEX IF NOT EXISTS idx_anonymoustournamentdrafts_expires
  ON anonymoustournamentdrafts (status, expiresat);

CREATE UNIQUE INDEX IF NOT EXISTS unique_anonymoustournamentdrafts_claimed_tournament
  ON anonymoustournamentdrafts (claimedtournamentid)
  WHERE claimedtournamentid IS NOT NULL;

CREATE TABLE IF NOT EXISTS usermetadata (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userid      UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
  displayname STRING(100),
  UNIQUE (userid)
);

CREATE TABLE IF NOT EXISTS groups (
  groupid        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ownerid        UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
  name           STRING(255) NOT NULL,
  invitecode     STRING(10) UNIQUE NOT NULL,
  approvalneeded BOOL DEFAULT FALSE,
  active         BOOL DEFAULT TRUE,
  createdat      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groupmembers (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groupid  UUID NOT NULL REFERENCES groups(groupid) ON DELETE CASCADE,
  userid   UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
  isadmin  BOOL DEFAULT FALSE,
  approved BOOL DEFAULT TRUE,
  UNIQUE (groupid, userid)
);

CREATE TABLE IF NOT EXISTS tournaments (
  tournamentid      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ownerid           UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
  name              STRING(255) NOT NULL,
  tourneydate       DATE,
  tourneytime       TIME,
  buyin             DECIMAL(10,2) DEFAULT 0,
  rake              DECIMAL(10,2) DEFAULT 0,
  payoutstructure   STRING,
  rebuyprice        DECIMAL(10,2) DEFAULT 0,
  rebuychips        INT DEFAULT 0,
  addonprice        DECIMAL(10,2) DEFAULT 0,
  addonchips        INT DEFAULT 0,
  maxplayers        INT DEFAULT 0,
  playerselftracking BOOL DEFAULT FALSE,
  musicrequestsenabled BOOL DEFAULT FALSE,
  musicrequestlimit INT DEFAULT 1,
  musicrequestwindowminutes INT DEFAULT 5,
  active            BOOL DEFAULT TRUE,
  createdat         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournamentplayers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournamentid UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  userid       UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
  checkedin    BOOL DEFAULT FALSE,
  rebuys       INT DEFAULT 0,
  addedon      BOOL DEFAULT FALSE,
  placed       INT,
  knockedoutbyuserid UUID,
  knockedoutat TIMESTAMPTZ,
  paid         BOOL DEFAULT FALSE,
  registeredat TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tournamentid, userid)
);

CREATE TABLE IF NOT EXISTS tournamentseating (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournamentid UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  userid       UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
  tablenumber  INT NOT NULL,
  seat         INT NOT NULL,
  UNIQUE (tournamentid, userid)
);

CREATE TABLE IF NOT EXISTS blindstructure (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournamentid   UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  level          INT NOT NULL,
  label          STRING(100),
  smallblind     INT DEFAULT 0,
  bigblind       INT DEFAULT 0,
  ante           INT DEFAULT 0,
  minutes        INT DEFAULT 20,
  islastlevel    BOOL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tournamentchips (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournamentid   UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  denomination   INT NOT NULL,
  color          STRING(30) NOT NULL,
  quantity       INT DEFAULT 0,
  sortorder      INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tournamenttimer (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournamentid   UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE UNIQUE,
  currentlevel   INT DEFAULT 1,
  remainingsecs  INT DEFAULT 0,
  running        BOOL DEFAULT FALSE,
  lastupdated    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spotifyoauthstates (
  state      STRING(96) PRIMARY KEY,
  userid     UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
  returnpath STRING(400),
  expiresat  TIMESTAMPTZ NOT NULL,
  createdat  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spotifyoauthstates_expires
  ON spotifyoauthstates (expiresat);

CREATE TABLE IF NOT EXISTS spotifyconnections (
  userid                UUID PRIMARY KEY REFERENCES users(guid) ON DELETE CASCADE,
  spotifyuserid         STRING(128),
  displayname           STRING(160),
  accesstokenencrypted  STRING NOT NULL,
  refreshtokenencrypted STRING NOT NULL,
  scope                 STRING(500),
  expiresat             TIMESTAMPTZ NOT NULL,
  product               STRING(40),
  createdat             TIMESTAMPTZ DEFAULT now(),
  updatedat             TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournamentmusicrequests (
  requestid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournamentid       UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  requestedbyuserid  UUID REFERENCES users(guid) ON DELETE SET NULL,
  requestedbyname    STRING(160),
  spotifyuri         STRING(180) NOT NULL,
  trackname          STRING(200) NOT NULL,
  artistname         STRING(200) NOT NULL,
  albumimageurl      STRING(500),
  status             STRING(24) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'queued', 'played', 'skipped', 'failed')),
  prioritypoints     INT NOT NULL DEFAULT 0,
  vipapplied         BOOL NOT NULL DEFAULT FALSE,
  spotifyqueuedat    TIMESTAMPTZ,
  failuremessage     STRING(240),
  createdat          TIMESTAMPTZ DEFAULT now(),
  updatedat          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournamentmusicrequests_queue
  ON tournamentmusicrequests (tournamentid, status, prioritypoints DESC, createdat);

CREATE TABLE IF NOT EXISTS tournamentmusicrequestblocks (
  tournamentid    UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  userid          UUID NOT NULL REFERENCES users(guid) ON DELETE CASCADE,
  blockedbyuserid UUID REFERENCES users(guid) ON DELETE SET NULL,
  createdat       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tournamentid, userid)
);

CREATE INDEX IF NOT EXISTS idx_tournamentmusicrequestblocks_user
  ON tournamentmusicrequestblocks (tournamentid, userid);
