import { query, queryOne } from './db';
import { publicEmail } from './privacy';

export type AccountTier = 'host' | 'club' | 'pro';

export interface AccountProfile {
  guid: string;
  userid: string;
  displayname: string;
  emailaddress: string;
  tierid: number;
  accounttier: AccountTier;
  issuperadmin: boolean;
  hostedtournamentcount: number;
  trialhostedremaining: number;
  trialactive: boolean;
  canuseclubfeatures: boolean;
  maxgroups: number;
  maxupcominghostedtournaments: number;
  maxplayerspertournament: number;
  aicreditsremaining: number;
  defaultaicredits: number;
}

const TRIAL_HOSTED_TOURNAMENT_LIMIT = 2;
const HOST_TIER_ID = 1;
const CLUB_TIER_ID = 2;
const PRO_TIER_ID = 3;
const HOST_MAX_GROUPS = 1;
const HOST_MAX_UPCOMING_HOSTED_TOURNAMENTS = 1;
const HOST_MAX_PLAYERS = 8;
const BETA_ALL_FEATURES = process.env.BETA_ALL_FEATURES !== 'false';
const FALLBACK_DEFAULT_AI_CREDITS = 25;

function normalizeCreditCount(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function normalizeTier(value: string | null | undefined): AccountTier {
  if (value === 'club' || value === 'pro') return value;
  return 'host';
}

function normalizeTierId(value: unknown, fallbackTier: AccountTier): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= HOST_TIER_ID) return parsed;
  if (fallbackTier === 'pro') return PRO_TIER_ID;
  if (fallbackTier === 'club') return CLUB_TIER_ID;
  return HOST_TIER_ID;
}

function getAdminEmails(): Set<string> {
  return new Set(
    String(process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function tierFromLegacyValue(value: string | null | undefined): number {
  if (value === 'premium') return CLUB_TIER_ID;
  return HOST_TIER_ID;
}

function clubFeatureSql(tierIdColumn: string, hostedCountColumn: string, adminColumn: string) {
  if (BETA_ALL_FEATURES) return 'TRUE';
  return `CASE
    WHEN COALESCE(${adminColumn}, FALSE) = TRUE THEN TRUE
    WHEN COALESCE(CAST(${tierIdColumn} AS INT), 0) >= ${CLUB_TIER_ID} THEN TRUE
    WHEN COALESCE(CAST(${tierIdColumn} AS INT), 0) <= ${HOST_TIER_ID} AND COALESCE(CAST(${hostedCountColumn} AS INT), 0) < ${TRIAL_HOSTED_TOURNAMENT_LIMIT} THEN TRUE
    ELSE FALSE
  END`;
}

export function sqlResolveTierId(userMetadataAlias: string) {
  return `COALESCE(CAST(${userMetadataAlias}.tierid AS INT), CASE WHEN COALESCE(${userMetadataAlias}.accounttier, 'free') = 'premium' THEN ${CLUB_TIER_ID} ELSE ${HOST_TIER_ID} END)`;
}

export function sqlResolveTierKey(userMetadataAlias: string, tierAlias = 'at') {
  return `COALESCE(${tierAlias}.tierkey, CASE WHEN COALESCE(${userMetadataAlias}.accounttier, 'free') = 'premium' THEN 'club' ELSE 'host' END)`;
}

export function sqlCanUseClubFeatures(userMetadataAlias: string, tierAlias = 'at') {
  return clubFeatureSql(sqlResolveTierId(userMetadataAlias), `${userMetadataAlias}.hostedtournamentcount`, `${userMetadataAlias}.issuperadmin`);
}

export async function syncSuperAdminByEmail(userId: string): Promise<void> {
  const row = await queryOne<{ emailaddress: string | null; emailencrypted: string | null; issuperadmin: boolean | null }>(
    `SELECT u.emailaddress, u.emailencrypted, COALESCE(um.issuperadmin, FALSE) AS issuperadmin
     FROM users u
     LEFT JOIN usermetadata um ON um.userid = u.guid
     WHERE u.guid = $1`,
    [userId]
  );
  if (!row) return;

  const email = publicEmail(row.emailencrypted, row.emailaddress);
  const shouldBeAdmin = Boolean(email) && getAdminEmails().has(email.toLowerCase());
  if (!shouldBeAdmin || Boolean(row.issuperadmin)) return;

  await query(
    `INSERT INTO usermetadata (userid, issuperadmin)
     VALUES ($1, TRUE)
     ON CONFLICT (userid)
     DO UPDATE SET issuperadmin = TRUE`,
    [userId]
  );
}

export async function getAccountProfile(userId: string): Promise<AccountProfile | null> {
  await syncSuperAdminByEmail(userId);
  const defaultaicredits = await getDefaultAiCredits();

  const row = await queryOne<{
    userid: string;
    displayname: string;
    emailaddress: string | null;
    emailencrypted: string | null;
    tierid: number | string | null;
    accounttier: string | null;
    issuperadmin: boolean | null;
    hostedtournamentcount: number | string | null;
    aicreditsremaining: number | string | null;
  }>(
    `SELECT u.guid AS userid,
            COALESCE(um.nickname, NULLIF(trim(concat(coalesce(um.firstname, ''), ' ', coalesce(um.lastname, ''))), ''), u.emailaddress) AS displayname,
            u.emailaddress,
            u.emailencrypted,
            ${sqlResolveTierId('um')} AS tierid,
            ${sqlResolveTierKey('um')} AS accounttier,
            COALESCE(um.issuperadmin, FALSE) AS issuperadmin,
            COALESCE(CAST(um.hostedtournamentcount AS INT), 0) AS hostedtournamentcount
            , um.aicreditsremaining
     FROM users u
     LEFT JOIN usermetadata um ON um.userid = u.guid
     LEFT JOIN accounttiers at ON at.tierid = ${sqlResolveTierId('um')}
     WHERE u.guid = $1`,
    [userId]
  );
  if (!row) return null;

  const accounttier = normalizeTier(row.accounttier);
  const tierid = normalizeTierId(row.tierid, accounttier);
  const issuperadmin = Boolean(row.issuperadmin);
  const hostedtournamentcount = Number(row.hostedtournamentcount ?? 0);
  const aicreditsremaining = normalizeCreditCount(row.aicreditsremaining, defaultaicredits);
  const trialhostedremaining = Math.max(TRIAL_HOSTED_TOURNAMENT_LIMIT - hostedtournamentcount, 0);
  const trialactive = tierid === HOST_TIER_ID && trialhostedremaining > 0;
  const canuseclubfeatures = BETA_ALL_FEATURES || issuperadmin || tierid >= CLUB_TIER_ID || trialactive;
  const unrestrictedHosting = BETA_ALL_FEATURES || issuperadmin || tierid >= CLUB_TIER_ID;

  const emailaddress = publicEmail(row.emailencrypted, row.emailaddress);
  return {
    guid: row.userid,
    userid: row.userid,
    displayname: row.displayname === row.emailaddress ? emailaddress : row.displayname,
    emailaddress,
    tierid,
    accounttier,
    issuperadmin,
    hostedtournamentcount,
    trialhostedremaining,
    trialactive,
    canuseclubfeatures,
    maxgroups: unrestrictedHosting ? Number.MAX_SAFE_INTEGER : HOST_MAX_GROUPS,
    maxupcominghostedtournaments: unrestrictedHosting ? Number.MAX_SAFE_INTEGER : HOST_MAX_UPCOMING_HOSTED_TOURNAMENTS,
    maxplayerspertournament: canuseclubfeatures ? Number.MAX_SAFE_INTEGER : HOST_MAX_PLAYERS,
    aicreditsremaining,
    defaultaicredits,
  };
}

export async function getDefaultAiCredits(): Promise<number> {
  const row = await queryOne<{ value: string | null }>(
    `SELECT value FROM appsettings WHERE key = 'default_ai_credits'`
  );
  return normalizeCreditCount(row?.value, normalizeCreditCount(process.env.DEFAULT_AI_CREDITS, FALLBACK_DEFAULT_AI_CREDITS));
}

export async function setDefaultAiCredits(value: number): Promise<number> {
  const credits = normalizeCreditCount(value, FALLBACK_DEFAULT_AI_CREDITS);
  await query(
    `INSERT INTO appsettings (key, value, updatedat)
     VALUES ('default_ai_credits', $1, now())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updatedat = now()`,
    [String(credits)]
  );
  return credits;
}

export async function setAiCreditsForUser(userId: string, value: number): Promise<number> {
  const credits = normalizeCreditCount(value, 0);
  await query(
    `INSERT INTO usermetadata (userid, aicreditsremaining)
     VALUES ($1, $2)
     ON CONFLICT (userid)
     DO UPDATE SET aicreditsremaining = $2`,
    [userId, credits]
  );
  return credits;
}

export async function consumeAiCredit(userId: string): Promise<{ allowed: boolean; remaining: number; defaultaicredits: number }> {
  const defaultaicredits = await getDefaultAiCredits();
  const row = await queryOne<{ aicreditsremaining: number | string | null }>(
    `SELECT aicreditsremaining FROM usermetadata WHERE userid = $1`,
    [userId]
  );
  const current = normalizeCreditCount(row?.aicreditsremaining, defaultaicredits);
  if (current <= 0) return { allowed: false, remaining: 0, defaultaicredits };

  const next = current - 1;
  await setAiCreditsForUser(userId, next);
  return { allowed: true, remaining: next, defaultaicredits };
}

export async function requireSuperAdmin(userId: string): Promise<boolean> {
  const profile = await getAccountProfile(userId);
  return Boolean(profile?.issuperadmin);
}

export async function getOwnedGroupCount(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::STRING AS count
     FROM groupmembers gm
     JOIN groups g ON g.groupid = gm.groupid
     WHERE gm.userid = $1
       AND gm.admin = TRUE
       AND gm.approved = TRUE
       AND g.active = TRUE`,
    [userId]
  );
  return Number(row?.count ?? 0);
}

export async function getUpcomingHostedTournamentCount(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::STRING AS count
     FROM tournaments
     WHERE userid = $1
       AND date IS NOT NULL
       AND CAST(date AS STRING) >= $2`,
    [userId, todayInAppTimezone()]
  );
  return Number(row?.count ?? 0);
}

export async function incrementHostedTournamentCount(userId: string): Promise<void> {
  await query(
    `INSERT INTO usermetadata (userid, hostedtournamentcount)
     VALUES ($1, 1)
     ON CONFLICT (userid)
     DO UPDATE SET hostedtournamentcount = COALESCE(usermetadata.hostedtournamentcount, 0) + 1`,
    [userId]
  );
}

export async function ensureTierIdForUser(userId: string): Promise<void> {
  const row = await queryOne<{ tierid: number | null; accounttier: string | null }>(
    `SELECT tierid, accounttier
     FROM usermetadata
     WHERE userid = $1`,
    [userId]
  );
  if (!row || row.tierid != null) return;

  await query(
    `UPDATE usermetadata
     SET tierid = $2
     WHERE userid = $1`,
    [userId, tierFromLegacyValue(row.accounttier)]
  );
}

function todayInAppTimezone() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
