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
  invitecode     STRING(50) UNIQUE NOT NULL,
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
  rebuyprice        DECIMAL(10,2) DEFAULT 0,
  rebuychips        INT DEFAULT 0,
  addonprice        DECIMAL(10,2) DEFAULT 0,
  addonchips        INT DEFAULT 0,
  maxplayers        INT DEFAULT 0,
  playerselftracking BOOL DEFAULT FALSE,
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

CREATE TABLE IF NOT EXISTS tournamenttimer (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournamentid   UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE UNIQUE,
  currentlevel   INT DEFAULT 1,
  remainingsecs  INT DEFAULT 0,
  running        BOOL DEFAULT FALSE,
  lastupdated    TIMESTAMPTZ DEFAULT now()
);
