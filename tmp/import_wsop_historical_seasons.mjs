import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const PYTHON = 'C:\\Users\\EricA\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const LEAGUE_NAME = 'Nocatee WSOP';
const APPLY = process.argv.includes('--apply');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const SEASON_NAME = argValue('--season');
const WORKBOOK = argValue('--file');
if (!SEASON_NAME || !WORKBOOK) {
  throw new Error('Usage: node tmp/import_wsop_historical_seasons.mjs --season 2025 --file "C:\\path\\sheet.xlsx" [--apply]');
}

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

function normalizeName(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^([^,]+),\s*(.+)$/, '$2 $1')
    .toLowerCase();
  const aliases = new Map([
    ['andrew gunthie', 'andrew guthrie'],
  ]);
  return aliases.get(normalized) ?? normalized;
}

function sqlNameExpression(metaAlias = 'm', userAlias = 'u') {
  const fullName = `NULLIF(trim(coalesce(${metaAlias}.fullname, '')), '')`;
  const nickname = `NULLIF(trim(coalesce(${metaAlias}.nickname, '')), '')`;
  const legacyName = `NULLIF(trim(concat(coalesce(${metaAlias}.firstname, ''), ' ', coalesce(${metaAlias}.lastname, ''))), '')`;
  return `COALESCE(${fullName}, ${nickname}, ${legacyName}, ${userAlias}.emailaddress)`;
}

function hashEmail(email) {
  return crypto.createHash('sha256').update(String(email ?? '').trim().toLowerCase()).digest('hex');
}

function encryptionKey(env) {
  return crypto.createHash('sha256').update(env.EMAIL_ENCRYPTION_KEY || env.JWT_SECRET || 'dev-secret').digest();
}

function encryptEmail(email, env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(String(email).trim().toLowerCase(), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function privateEmailPlaceholder(userId) {
  return `private+${userId}@private.thepokerplanner.com`;
}

function createGuestEmail() {
  return `guest+${crypto.randomUUID()}@guest.thepokerplanner.com`;
}

function moneyValue(value) {
  const amount = Number(String(value ?? '').replace('$', '').replace(',', ''));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

function seasonDates(seasonName) {
  const year = Number(String(seasonName).match(/\d{4}/)?.[0]);
  if (Number.isInteger(year)) {
    return { begin: `${year}-01-01`, end: `${year}-12-31` };
  }
  const today = new Date().toISOString().slice(0, 10);
  return { begin: today, end: today };
}

function pointsForPlace(pointsLookup, place, dnf) {
  if (dnf || !place) return 0;
  const rule = pointsLookup.find((item) => Number(item.place) === Number(place));
  return Number(rule?.points ?? 0);
}

function analyze(parsed) {
  const anomalies = [];
  for (const event of parsed.events) {
    const places = event.results.filter((result) => !result.dnf && result.place).map((result) => result.place);
    const dupes = [...new Set(places.filter((place, index) => places.indexOf(place) !== index))];
    if (dupes.length) anomalies.push({ event: event.name, duplicatePlaces: dupes });
  }
  return anomalies;
}

async function ensureSeasonColumns(client) {
  await client.query(`ALTER TABLE leagueseasons ADD COLUMN IF NOT EXISTS expectedplayercount INT`);
  await client.query(`ALTER TABLE leagueseasons ADD COLUMN IF NOT EXISTS leaguefee DECIMAL(10,2)`);
  await client.query(`ALTER TABLE leagueseasons ADD COLUMN IF NOT EXISTS pereventfee DECIMAL(10,2) DEFAULT 0`);
  await client.query(`ALTER TABLE leagueseasons ADD COLUMN IF NOT EXISTS showupbonuspoints INT`);
  await client.query(`ALTER TABLE leagueseasons ADD COLUMN IF NOT EXISTS bestfinishcount INT`);
  await client.query(`ALTER TABLE leagueseasons ADD COLUMN IF NOT EXISTS pointslookup JSONB`);
}

async function ensureGuestMember(client, env, leagueId, ownerId, name) {
  const userId = crypto.randomUUID();
  const guestEmail = createGuestEmail();
  await client.query(
    `INSERT INTO users (guid, emailaddress, emailhash, emailencrypted, password, emailverified)
     VALUES ($1, $2, $3, $4, $5, TRUE)`,
    [userId, privateEmailPlaceholder(userId), hashEmail(guestEmail), encryptEmail(guestEmail, env), `guest:${crypto.randomUUID()}`]
  );
  await client.query(
    `INSERT INTO usermetadata (userid, fullname, nickname, isguestuser, guestofuserid)
     VALUES ($1, $2, $2, TRUE, $3)
     ON CONFLICT (userid) DO UPDATE SET fullname = $2, nickname = $2, isguestuser = TRUE`,
    [userId, name, ownerId]
  );
  await client.query(
    `INSERT INTO leaguemembers (leagueid, userid, admin, approved, participating)
     VALUES ($1, $2, FALSE, TRUE, TRUE)
     ON CONFLICT (leagueid, userid) DO UPDATE SET approved = TRUE`,
    [leagueId, userId]
  );
  return { userid: userId, displayname: name, created: true };
}

const parsed = JSON.parse(execFileSync(PYTHON, ['tmp\\inspect_wsop_history.py', 'parse-results', WORKBOOK], { encoding: 'utf8' }));
const env = { ...loadEnv('.env'), ...loadEnv('apps/api/.env'), ...process.env };
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await ensureSeasonColumns(client);

  const leagueResult = await client.query(
    `SELECT leagueid, userid AS ownerid, name
     FROM leagues
     WHERE lower(name) = lower($1) AND COALESCE(active, TRUE) = TRUE
     ORDER BY createdat DESC
     LIMIT 1`,
    [LEAGUE_NAME]
  );
  const league = leagueResult.rows[0];
  if (!league) throw new Error(`League not found: ${LEAGUE_NAME}`);

  const membersResult = await client.query(
    `SELECT lm.userid, lm.admin, ${sqlNameExpression('m', 'u')} AS displayname
     FROM leaguemembers lm
     JOIN users u ON u.guid = lm.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE lm.leagueid = $1 AND lm.approved = TRUE`,
    [league.leagueid]
  );
  const membersByName = new Map();
  for (const member of membersResult.rows) {
    const key = normalizeName(member.displayname);
    if (!membersByName.has(key)) membersByName.set(key, member);
  }

  const importMembers = [];
  const createdGuests = [];
  for (const player of parsed.players) {
    const key = normalizeName(player.name);
    let member = membersByName.get(key);
    if (!member && APPLY) {
      member = await ensureGuestMember(client, env, league.leagueid, league.ownerid, player.name);
      membersByName.set(key, member);
      createdGuests.push(player.name);
    }
    importMembers.push({ ...player, userid: member?.userid ?? null, matched: Boolean(member) });
  }
  const unmatchedPlayers = importMembers.filter((member) => !member.userid).map((member) => member.name);

  const { begin, end } = seasonDates(SEASON_NAME);
  const existingSeason = await client.query(
    `SELECT seasonid
     FROM leagueseasons
     WHERE leagueid = $1 AND lower(name) = lower($2) AND COALESCE(active, TRUE) = TRUE
     LIMIT 1`,
    [league.leagueid, SEASON_NAME]
  );
  const seasonId = existingSeason.rows[0]?.seasonid ?? crypto.randomUUID();
  const settings = parsed.settings ?? {};
  const pointsLookupJson = JSON.stringify(parsed.pointsLookup);

  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    league: league.name,
    season: SEASON_NAME,
    seasonid: seasonId,
    players: parsed.players.length,
    matchedPlayers: importMembers.filter((member) => member.userid).length,
    guestsToCreate: APPLY ? createdGuests.length : unmatchedPlayers.length,
    unmatchedPlayers,
    events: parsed.events.length,
    results: parsed.events.reduce((sum, event) => sum + event.results.length, 0),
    leagueFee: moneyValue(settings.leagueFee),
    perEventFee: moneyValue(settings.perEventFee),
    showupBonusPoints: Number(settings.showupBonusPoints || 0),
    bestFinishCount: Number(settings.bestFinishCount || 7),
    expectedPlayerCount: Number(settings.expectedPlayerCount || parsed.players.length),
    anomalies: analyze(parsed),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!APPLY) {
    await client.query('ROLLBACK');
    process.exit(unmatchedPlayers.length ? 2 : 0);
  }

  await client.query(
    `INSERT INTO leagueseasons (
       seasonid, leagueid, name, begindate, enddate,
       expectedplayercount, leaguefee, pereventfee, showupbonuspoints, bestfinishcount, pointslookup, active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB, TRUE)
     ON CONFLICT (seasonid) DO UPDATE
     SET name = $3,
         begindate = $4,
         enddate = $5,
         expectedplayercount = $6,
         leaguefee = $7,
         pereventfee = $8,
         showupbonuspoints = $9,
         bestfinishcount = $10,
         pointslookup = $11::JSONB,
         active = TRUE`,
    [
      seasonId,
      league.leagueid,
      SEASON_NAME,
      begin,
      end,
      Number(settings.expectedPlayerCount || parsed.players.length),
      moneyValue(settings.leagueFee),
      moneyValue(settings.perEventFee),
      Number(settings.showupBonusPoints || 0),
      Number(settings.bestFinishCount || 7),
      pointsLookupJson,
    ]
  );

  await client.query(
    `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
     SELECT $1, $2, lm.userid, FALSE
     FROM leaguemembers lm
     WHERE lm.leagueid = $2 AND lm.approved = TRUE
     ON CONFLICT (seasonid, userid) DO UPDATE SET participating = FALSE`,
    [seasonId, league.leagueid]
  );

  for (const member of importMembers) {
    await client.query(
      `INSERT INTO leagueseasonparticipants (seasonid, leagueid, userid, participating)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (seasonid, userid) DO UPDATE SET participating = TRUE`,
      [seasonId, league.leagueid, member.userid]
    );
  }

  await client.query(
    `DELETE FROM leagueresults
     WHERE leagueid = $1
       AND eventid IN (SELECT eventid FROM leagueevents WHERE leagueid = $1 AND seasonid = $2)`,
    [league.leagueid, seasonId]
  );
  await client.query(
    `DELETE FROM leaguepayments
     WHERE leagueid = $1
       AND (seasonid = $2 OR eventid IN (SELECT eventid FROM leagueevents WHERE leagueid = $1 AND seasonid = $2))`,
    [league.leagueid, seasonId]
  );
  await client.query(
    `UPDATE leagueevents SET active = FALSE WHERE leagueid = $1 AND seasonid = $2`,
    [league.leagueid, seasonId]
  );

  const admin = membersResult.rows.find((member) => member.admin)?.userid ?? league.ownerid;
  const eventByName = new Map();
  for (const [index, event] of parsed.events.entries()) {
    const eventNumber = index + 1;
    const eventDate = `${String(SEASON_NAME).match(/\d{4}/)?.[0] ?? new Date().getFullYear()}-${String(eventNumber).padStart(2, '0')}-01`;
    const eventResult = await client.query(
      `INSERT INTO leagueevents (leagueid, seasonid, name, eventdate, eventtime, eventnumber, eventfee, active)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, TRUE)
       RETURNING eventid`,
      [league.leagueid, seasonId, event.name, eventDate, eventNumber, moneyValue(settings.perEventFee)]
    );
    eventByName.set(normalizeName(event.name), eventResult.rows[0].eventid);
  }

  const paidAt = begin;
  for (const member of importMembers) {
    const amount = moneyValue(parsed.leagueFees[member.name]);
    if (!amount) continue;
    await client.query(
      `INSERT INTO leaguepayments (leagueid, seasonid, userid, eventid, paymenttype, amount, paidat, note, recordedby)
       VALUES ($1, $2, $3, NULL, 'league', $4, $5, $6, $7)`,
      [league.leagueid, seasonId, member.userid, amount, paidAt, `Imported ${SEASON_NAME} league fee.`, admin]
    );
  }

  for (const event of parsed.events) {
    const eventId = eventByName.get(normalizeName(event.name));
    for (const result of event.results) {
      const member = importMembers.find((item) => normalizeName(item.name) === normalizeName(result.name));
      const points = pointsForPlace(parsed.pointsLookup, result.place, result.dnf);
      const showup = result.dnf ? 0 : Number(settings.showupBonusPoints || 0);
      await client.query(
        `INSERT INTO leagueresults (eventid, leagueid, userid, placed, dnf, points, showupbonuspoints, loggedby)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [eventId, league.leagueid, member.userid, result.place, result.dnf, points, showup, admin]
      );
      const eventFeePaid = moneyValue(result.paid);
      if (eventFeePaid) {
        await client.query(
          `INSERT INTO leaguepayments (leagueid, seasonid, userid, eventid, paymenttype, amount, paidat, note, recordedby)
           VALUES ($1, $2, $3, $4, 'event', $5, $6, $7, $8)`,
          [league.leagueid, seasonId, member.userid, eventId, eventFeePaid, paidAt, `Imported ${SEASON_NAME} ${event.name}.`, admin]
        );
      }
    }
  }

  await client.query(
    `INSERT INTO leagueauditlogs (leagueid, seasonid, actorid, action, summary, details)
     VALUES ($1, $2, $3, 'spreadsheet_results_imported', $4, $5::JSONB)`,
    [
      league.leagueid,
      seasonId,
      admin,
      `${SEASON_NAME} spreadsheet results were imported.`,
      JSON.stringify({
        source: WORKBOOK,
        playersImported: parsed.players.length,
        guestsCreated: createdGuests,
        eventsImported: parsed.events.length,
        resultsImported: parsed.events.reduce((sum, event) => sum + event.results.length, 0),
        settings: summary,
      }),
    ]
  );

  await client.query('COMMIT');
  console.log(JSON.stringify({ imported: true, ...summary, createdGuests }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
