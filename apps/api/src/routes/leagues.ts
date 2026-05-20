import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne, pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { encryptEmail, hashEmail, privateEmailPlaceholder } from '../privacy';

export const leaguesRouter = Router();
leaguesRouter.use(requireAuth);

const DEFAULT_POINTS_LOOKUP: LeaguePointRule[] = [
  { place: 'DNF', points: 0 },
  { place: 1, points: 671 },
  { place: 2, points: 448 },
  { place: 3, points: 336 },
  { place: 4, points: 269 },
  { place: 5, points: 224 },
  { place: 6, points: 192 },
  { place: 7, points: 168 },
  { place: 8, points: 150 },
  { place: 9, points: 135 },
  { place: 10, points: 122 },
  { place: 11, points: 112 },
  { place: 12, points: 104 },
  { place: 13, points: 96 },
  { place: 14, points: 90 },
  { place: 15, points: 84 },
  { place: 16, points: 79 },
  { place: 17, points: 75 },
  { place: 18, points: 71 },
  { place: 19, points: 68 },
  { place: 20, points: 64 },
  { place: 21, points: 61 },
  { place: 22, points: 59 },
  { place: 23, points: 56 },
  { place: 24, points: 54 },
  { place: 25, points: 52 },
  { place: 26, points: 50 },
  { place: 27, points: 48 },
  { place: 28, points: 47 },
  { place: 29, points: 45 },
  { place: 30, points: 44 },
  { place: 31, points: 42 },
  { place: 32, points: 41 },
  { place: 33, points: 40 },
  { place: 34, points: 39 },
  { place: 35, points: 38 },
  { place: 36, points: 37 },
];
const BASE_POINT_TOTAL = DEFAULT_POINTS_LOOKUP
  .filter((rule) => rule.place !== 'DNF')
  .reduce((sum, rule) => sum + rule.points, 0);
const TOP_THREE_SHARE = DEFAULT_POINTS_LOOKUP
  .filter((rule) => typeof rule.place === 'number' && rule.place <= 3)
  .reduce((sum, rule) => sum + rule.points, 0) / BASE_POINT_TOTAL;
const TOP_EIGHT_SHARE = 0.5;

type LeagueRow = {
  leagueid: string;
  ownerid: string;
  name: string;
  invitecode: string;
  approvalneeded: boolean;
  expectedplayercount: number;
  leaguefee: number;
  pereventfee: number;
  showupbonuspoints: number;
  bestfinishcount: number;
  pointslookup: LeaguePointRule[] | string;
  finalenabled: boolean;
  finalmultiplierlookup: LeagueFinalMultiplier[] | string | null;
  finalchiprounding: number;
  finalstartingbigblind: number;
  active: boolean;
  createdat: string;
  isadmin?: boolean;
  approved?: boolean;
  membercount?: number;
  eventcount?: number;
};

type LeaguePointRule = { place: number | 'DNF'; points: number };
type LeagueFinalMultiplier = { place: number; multiplier: number };
type LeagueMemberRow = {
  userid: string;
  emailaddress: string | null;
  displayname: string | null;
  isadmin: boolean;
  approved: boolean;
};
type LeagueEventRow = {
  eventid: string;
  leagueid: string;
  name: string;
  eventdate: string | null;
  eventnumber: number | null;
  resultcount?: number;
  active: boolean;
  createdat: string;
};
type LeagueResultRow = {
  resultid: string;
  eventid: string;
  leagueid: string;
  userid: string;
  displayname: string | null;
  placed: number | null;
  dnf: boolean;
  points: number;
  showupbonuspoints: number;
  loggedby: string | null;
  createdat: string;
  updatedat: string;
};
type LeaguePaymentRow = {
  paymentid: string;
  leagueid: string;
  userid: string;
  displayname: string | null;
  eventid: string | null;
  eventname: string | null;
  paymenttype: string;
  amount: number;
  paidat: string;
  note: string | null;
  recordedby: string | null;
  createdat: string;
};

function generateInviteCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function normalizeInviteCode(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function createGuestEmail() {
  return `guest+${crypto.randomUUID()}@guest.pokerplanner.bet`;
}

function normalizePointsLookup(value: unknown): LeaguePointRule[] {
  if (!Array.isArray(value)) return DEFAULT_POINTS_LOOKUP;
  const rules = value
    .map((raw) => {
      const item = raw as Partial<LeaguePointRule>;
      const rawPlace = String(item.place ?? '').trim().toUpperCase();
      const place = rawPlace === 'DNF' ? 'DNF' : Math.max(1, Math.round(Number(item.place)));
      const points = Math.max(0, Math.round(Number(item.points ?? 0)));
      if (place !== 'DNF' && !Number.isFinite(place)) return null;
      return { place, points };
    })
    .filter(Boolean) as LeaguePointRule[];
  return rules.length ? rules : DEFAULT_POINTS_LOOKUP;
}

function generatePointsLookup(playerCount: number, totalPoints?: number): LeaguePointRule[] {
  const players = Math.max(1, Math.min(500, Math.round(Number(playerCount || 36))));
  const total = Math.max(players, Math.round(Number(totalPoints || players * 100)));
  const baseByPlace = new Map<number, number>();
  for (const rule of DEFAULT_POINTS_LOOKUP) {
    if (typeof rule.place === 'number') baseByPlace.set(rule.place, rule.points);
  }
  const weightForPlace = (place: number) => {
    if (baseByPlace.has(place)) return baseByPlace.get(place)!;
    const last = baseByPlace.get(36) ?? 1;
    return Math.max(1, last * Math.pow(0.96, place - 36));
  };
  const topCount = Math.min(8, players);
  const topThreeCount = Math.min(3, players);
  const buckets = [
    { start: 1, end: topThreeCount, share: players >= 3 ? TOP_THREE_SHARE : 1 },
    { start: 4, end: topCount, share: players >= 8 ? TOP_EIGHT_SHARE - TOP_THREE_SHARE : Math.max(0, 1 - TOP_THREE_SHARE) },
    { start: 9, end: players, share: players >= 9 ? 1 - TOP_EIGHT_SHARE : 0 },
  ].filter((bucket) => bucket.start <= bucket.end && bucket.share > 0);
  const raw = buckets.flatMap((bucket) => {
    const places = Array.from({ length: bucket.end - bucket.start + 1 }, (_, index) => bucket.start + index);
    const weightTotal = places.reduce((sum, place) => sum + weightForPlace(place), 0);
    return places.map((place) => ({
      place,
      value: (total * bucket.share * weightForPlace(place)) / weightTotal,
    }));
  });
  const rounded = raw.map((item) => ({ ...item, points: Math.floor(item.value), remainder: item.value - Math.floor(item.value) }));
  let delta = total - rounded.reduce((sum, item) => sum + item.points, 0);
  for (const item of [...rounded].sort((a, b) => b.remainder - a.remainder || a.place - b.place)) {
    if (delta <= 0) break;
    item.points += 1;
    delta -= 1;
  }
  return [{ place: 'DNF', points: 0 }, ...rounded.sort((a, b) => a.place - b.place).map(({ place, points }) => ({ place, points }))];
}

function normalizeFinalMultipliers(value: unknown): LeagueFinalMultiplier[] {
  const source = Array.isArray(value) ? value : Array.from({ length: 36 }, (_, index) => ({
    place: index + 1,
    multiplier: index === 0 ? 0 : Math.max(2, 19 - index),
  }));
  const rules = source
    .map((raw) => {
      const item = raw as Partial<LeagueFinalMultiplier>;
      const place = Math.max(1, Math.round(Number(item.place)));
      const multiplier = Math.max(0, Math.round(Number(item.multiplier ?? 0)));
      if (!Number.isFinite(place)) return null;
      return { place, multiplier };
    })
    .filter(Boolean) as LeagueFinalMultiplier[];
  const unique = new Map<number, LeagueFinalMultiplier>();
  for (const rule of rules) unique.set(rule.place, rule);
  return [...unique.values()].sort((a, b) => a.place - b.place);
}

function serializeLeague(row: LeagueRow) {
  return {
    ...row,
    expectedplayercount: Number(row.expectedplayercount || 36),
    leaguefee: Number(row.leaguefee || 0),
    pereventfee: Number(row.pereventfee || 0),
    showupbonuspoints: Number(row.showupbonuspoints || 0),
    bestfinishcount: Number(row.bestfinishcount || 7),
    finalchiprounding: Number(row.finalchiprounding || 100),
    finalstartingbigblind: Number(row.finalstartingbigblind || 100),
    pointslookup: typeof row.pointslookup === 'string'
      ? JSON.parse(row.pointslookup) as LeaguePointRule[]
      : row.pointslookup,
    finalmultiplierlookup: normalizeFinalMultipliers(
      typeof row.finalmultiplierlookup === 'string'
        ? JSON.parse(row.finalmultiplierlookup) as LeagueFinalMultiplier[]
        : row.finalmultiplierlookup
    ),
  };
}

function pointsForPlace(pointsLookup: LeaguePointRule[], placed: number | null, dnf: boolean): number {
  if (dnf || !placed) return 0;
  const found = pointsLookup.find((rule) => Number(rule.place) === placed);
  return found?.points ?? 0;
}

function buildStandings(members: LeagueMemberRow[], results: LeagueResultRow[], bestFinishCount: number) {
  return members
    .filter((member) => member.approved)
    .map((member) => {
      const playerResults = results.filter((result) => result.userid === member.userid);
      const scoredFinishes = playerResults
        .filter((result) => !result.dnf && result.placed != null)
        .map((result) => result.points)
        .sort((a, b) => b - a)
        .slice(0, bestFinishCount);
      const showupBonus = playerResults.reduce((sum, result) => sum + Number(result.showupbonuspoints || 0), 0);
      const scoredPoints = scoredFinishes.reduce((sum, points) => sum + points, 0);
      const placements = playerResults
        .filter((result) => !result.dnf && result.placed != null)
        .map((result) => Number(result.placed));
      const averageFinish = placements.length
        ? placements.reduce((sum, place) => sum + place, 0) / placements.length
        : null;
      return {
        userid: member.userid,
        displayname: member.displayname,
        isadmin: member.isadmin,
        eventsplayed: playerResults.filter((result) => !result.dnf && result.placed != null).length,
        showupbonus: showupBonus,
        scoredpoints: scoredPoints,
        totalpoints: scoredPoints + showupBonus,
        averagefinish: averageFinish,
        bestfinishes: scoredFinishes,
      };
    })
    .sort((a, b) => b.totalpoints - a.totalpoints || b.scoredpoints - a.scoredpoints || (a.averagefinish ?? 999) - (b.averagefinish ?? 999));
}

function buildFinalStacks(standings: ReturnType<typeof buildStandings>, league: ReturnType<typeof serializeLeague>) {
  if (!league.finalenabled) return [];
  const rounding = Math.max(1, Math.round(Number(league.finalchiprounding || 100)));
  const bigBlind = Math.max(1, Math.round(Number(league.finalstartingbigblind || 100)));
  const multiplierByPlace = new Map(league.finalmultiplierlookup.map((rule) => [rule.place, rule.multiplier]));
  return standings.map((standing, index) => {
    const place = index + 1;
    const multiplier = multiplierByPlace.get(place) ?? 0;
    const multiplierChips = Math.round(standing.scoredpoints * multiplier);
    const roundedChips = Math.round(multiplierChips / rounding) * rounding;
    const startingstack = roundedChips + standing.showupbonus;
    return {
      ...standing,
      place,
      multiplier,
      multiplierchips: multiplierChips,
      roundedchips: roundedChips,
      startingstack,
      bbstostart: Math.round(startingstack / bigBlind),
    };
  });
}

async function requireLeagueAdmin(leagueId: string, userId: string): Promise<boolean> {
  return Boolean(await queryOne(
    `SELECT 1 FROM leaguemembers WHERE leagueid = $1 AND userid = $2 AND approved = TRUE AND admin = TRUE`,
    [leagueId, userId]
  ));
}

async function requireLeagueMember(leagueId: string, userId: string): Promise<boolean> {
  return Boolean(await queryOne(
    `SELECT 1 FROM leaguemembers WHERE leagueid = $1 AND userid = $2 AND approved = TRUE`,
    [leagueId, userId]
  ));
}

async function getLeagueForUser(leagueId: string, userId: string) {
  return queryOne<LeagueRow>(
    `SELECT l.leagueid, l.userid AS ownerid, l.name, l.invitecode, l.approvalneeded,
            l.expectedplayercount, l.leaguefee, l.pereventfee, l.showupbonuspoints, l.bestfinishcount, l.pointslookup,
            l.finalenabled, l.finalmultiplierlookup, l.finalchiprounding, l.finalstartingbigblind,
            l.active, l.createdat,
            lm.admin AS isadmin, lm.approved,
            (SELECT count(*) FROM leaguemembers WHERE leagueid = l.leagueid AND approved = TRUE) AS membercount,
            (SELECT count(*) FROM leagueevents WHERE leagueid = l.leagueid AND active = TRUE) AS eventcount
     FROM leagues l
     JOIN leaguemembers lm ON lm.leagueid = l.leagueid AND lm.userid = $2
     WHERE l.leagueid = $1 AND COALESCE(l.active, TRUE) = TRUE`,
    [leagueId, userId]
  );
}

leaguesRouter.get('/', async (req: Request, res: Response) => {
  const rows = await query<LeagueRow>(
    `SELECT l.leagueid, l.userid AS ownerid, l.name, l.invitecode, l.approvalneeded,
            l.expectedplayercount, l.leaguefee, l.pereventfee, l.showupbonuspoints, l.bestfinishcount, l.pointslookup,
            l.finalenabled, l.finalmultiplierlookup, l.finalchiprounding, l.finalstartingbigblind,
            l.active, l.createdat,
            lm.admin AS isadmin, lm.approved,
            (SELECT count(*) FROM leaguemembers WHERE leagueid = l.leagueid AND approved = TRUE) AS membercount,
            (SELECT count(*) FROM leagueevents WHERE leagueid = l.leagueid AND active = TRUE) AS eventcount
     FROM leagues l
     JOIN leaguemembers lm ON lm.leagueid = l.leagueid AND lm.userid = $1
     WHERE COALESCE(l.active, TRUE) = TRUE
     ORDER BY lm.admin DESC, lower(l.name) ASC`,
    [req.userId]
  );
  res.json(rows.map(serializeLeague));
});

leaguesRouter.patch('/:id', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as {
    name?: string;
    approvalneeded?: boolean;
    expectedplayercount?: number;
    leaguefee?: number;
    pereventfee?: number;
    showupbonuspoints?: number;
    bestfinishcount?: number;
    pointslookup?: unknown;
    finalenabled?: boolean;
    finalmultiplierlookup?: unknown;
    finalchiprounding?: number;
    finalstartingbigblind?: number;
  };
  const current = await getLeagueForUser(req.params.id, req.userId!);
  if (!current) {
    res.status(404).json({ error: 'League not found.' });
    return;
  }
  const name = body.name == null ? current.name : String(body.name).trim().slice(0, 160);
  if (!name) {
    res.status(400).json({ error: 'League name required.' });
    return;
  }
  const showupBonus = body.showupbonuspoints == null ? Number(current.showupbonuspoints || 0) : Math.max(0, Math.round(Number(body.showupbonuspoints)));
  const leagueFee = body.leaguefee == null ? Number(current.leaguefee || 0) : Math.max(0, Math.round(Number(body.leaguefee) * 100) / 100);
  const perEventFee = body.pereventfee == null ? Number(current.pereventfee || 0) : Math.max(0, Math.round(Number(body.pereventfee) * 100) / 100);
  const bestFinishCount = body.bestfinishcount == null ? Number(current.bestfinishcount || 7) : Math.max(1, Math.min(100, Math.round(Number(body.bestfinishcount))));
  const expectedPlayerCount = body.expectedplayercount == null ? Number(current.expectedplayercount || 36) : Math.max(2, Math.min(500, Math.round(Number(body.expectedplayercount))));
  const pointsLookup = body.pointslookup == null ? normalizePointsLookup(current.pointslookup) : normalizePointsLookup(body.pointslookup);
  const finalEnabled = body.finalenabled == null ? Boolean(current.finalenabled) : Boolean(body.finalenabled);
  const finalMultipliers = body.finalmultiplierlookup == null ? normalizeFinalMultipliers(current.finalmultiplierlookup) : normalizeFinalMultipliers(body.finalmultiplierlookup);
  const finalChipRounding = body.finalchiprounding == null ? Number(current.finalchiprounding || 100) : Math.max(1, Math.round(Number(body.finalchiprounding)));
  const finalStartingBigBlind = body.finalstartingbigblind == null ? Number(current.finalstartingbigblind || 100) : Math.max(1, Math.round(Number(body.finalstartingbigblind)));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query<LeagueRow>(
      `UPDATE leagues
       SET name = $2,
           approvalneeded = $3,
           expectedplayercount = $4,
           leaguefee = $5,
           pereventfee = $6,
           showupbonuspoints = $7,
           bestfinishcount = $8,
           pointslookup = $9,
           finalenabled = $10,
           finalmultiplierlookup = $11,
           finalchiprounding = $12,
           finalstartingbigblind = $13
       WHERE leagueid = $1
       RETURNING leagueid, userid AS ownerid, name, invitecode, approvalneeded, expectedplayercount, leaguefee, pereventfee, showupbonuspoints,
                 bestfinishcount, pointslookup, finalenabled, finalmultiplierlookup,
                 finalchiprounding, finalstartingbigblind, active, createdat`,
      [
        req.params.id,
        name,
        Boolean(body.approvalneeded ?? current.approvalneeded),
        expectedPlayerCount,
        leagueFee,
        perEventFee,
        showupBonus,
        bestFinishCount,
        JSON.stringify(pointsLookup),
        finalEnabled,
        JSON.stringify(finalMultipliers),
        finalChipRounding,
        finalStartingBigBlind,
      ]
    );
    const results = await client.query<{ resultid: string; placed: number | null; dnf: boolean }>(
      `SELECT resultid, placed, dnf FROM leagueresults WHERE leagueid = $1`,
      [req.params.id]
    );
    for (const result of results.rows) {
      await client.query(
        `UPDATE leagueresults SET points = $2, showupbonuspoints = $3, updatedat = now() WHERE resultid = $1`,
        [
          result.resultid,
          pointsForPlace(pointsLookup, result.placed, result.dnf),
          result.dnf ? 0 : showupBonus,
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ league: serializeLeague({ ...updated.rows[0], isadmin: true, approved: true }) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.delete('/:id', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  await query(`UPDATE leagues SET active = FALSE WHERE leagueid = $1`, [req.params.id]);
  res.json({ success: true });
});

leaguesRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as { name?: string; approvalneeded?: boolean; expectedplayercount?: number; leaguefee?: number; pereventfee?: number; showupbonuspoints?: number; bestfinishcount?: number; pointslookup?: unknown };
  const name = String(body.name ?? '').trim().slice(0, 160);
  if (!name) {
    res.status(400).json({ error: 'League name required.' });
    return;
  }
  const expectedPlayerCount = Math.max(2, Math.min(500, Math.round(Number(body.expectedplayercount ?? 36))));
  const leagueFee = Math.max(0, Math.round(Number(body.leaguefee ?? 0) * 100) / 100);
  const perEventFee = Math.max(0, Math.round(Number(body.pereventfee ?? 0) * 100) / 100);
  const showupBonus = Math.max(0, Math.round(Number(body.showupbonuspoints ?? 300)));
  const bestFinishCount = Math.max(1, Math.min(100, Math.round(Number(body.bestfinishcount ?? 7))));
  const pointsLookup = body.pointslookup == null
    ? generatePointsLookup(expectedPlayerCount)
    : normalizePointsLookup(body.pointslookup);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invitecode = generateInviteCode();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const leagueResult = await client.query<{ leagueid: string }>(
        `INSERT INTO leagues (userid, name, invitecode, approvalneeded, expectedplayercount, leaguefee, pereventfee, showupbonuspoints, bestfinishcount, pointslookup, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
         RETURNING leagueid`,
        [req.userId, name, invitecode, Boolean(body.approvalneeded), expectedPlayerCount, leagueFee, perEventFee, showupBonus, bestFinishCount, JSON.stringify(pointsLookup)]
      );
      const league = leagueResult.rows[0];
      await client.query(
        `INSERT INTO leaguemembers (leagueid, userid, admin, approved)
         VALUES ($1, $2, TRUE, TRUE)`,
        [league.leagueid, req.userId]
      );
      await client.query('COMMIT');
      res.status(201).json({ leagueid: league.leagueid, invitecode });
      return;
    } catch (err) {
      await client.query('ROLLBACK');
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
      if (code === '23505') continue;
      console.error(err);
      res.status(500).json({ error: 'Failed to create league.' });
      return;
    } finally {
      client.release();
    }
  }
  res.status(500).json({ error: 'Failed to create a unique league code.' });
});

leaguesRouter.post('/join', async (req: Request, res: Response) => {
  const invitecode = normalizeInviteCode((req.body as { invitecode?: string }).invitecode);
  const league = await queryOne<LeagueRow>(
    `SELECT leagueid, approvalneeded FROM leagues WHERE invitecode = $1 AND COALESCE(active, TRUE) = TRUE`,
    [invitecode]
  );
  if (!league) {
    res.status(404).json({ error: 'League invite code not found.' });
    return;
  }
  await query(
    `INSERT INTO leaguemembers (leagueid, userid, admin, approved)
     VALUES ($1, $2, FALSE, $3)
     ON CONFLICT (leagueid, userid) DO UPDATE SET approved = CASE WHEN leaguemembers.approved THEN TRUE ELSE $3 END`,
    [league.leagueid, req.userId, !league.approvalneeded]
  );
  res.json({ leagueid: league.leagueid, pending: Boolean(league.approvalneeded) });
});

leaguesRouter.post('/:id/members/guest', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const displayname = String((req.body as { displayname?: string }).displayname ?? '').trim().slice(0, 120);
  if (!displayname) {
    res.status(400).json({ error: 'Guest player name required.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const guestId = crypto.randomUUID();
    const guestEmail = createGuestEmail();
    const createdUserResult = await client.query<{ guid: string }>(
      `INSERT INTO users (guid, emailaddress, emailhash, emailencrypted, password, emailverified)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING guid`,
      [guestId, privateEmailPlaceholder(guestId), hashEmail(guestEmail), encryptEmail(guestEmail), `guest:${crypto.randomUUID()}`]
    );
    const createdUser = createdUserResult.rows[0];
    if (!createdUser) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: 'Failed to create guest player.' });
      return;
    }
    await client.query(
      `INSERT INTO usermetadata (userid, nickname, isguestuser, guestofuserid)
       VALUES ($1, $2, TRUE, $3)`,
      [createdUser.guid, displayname, req.userId]
    );
    await client.query(
      `INSERT INTO leaguemembers (leagueid, userid, admin, approved)
       VALUES ($1, $2, FALSE, TRUE)`,
      [req.params.id, createdUser.guid]
    );
    await client.query('COMMIT');
    res.status(201).json({
      member: {
        userid: createdUser.guid,
        emailaddress: null,
        displayname,
        isadmin: false,
        approved: true,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

leaguesRouter.get('/:id', async (req: Request, res: Response) => {
  const leagueRow = await getLeagueForUser(req.params.id, req.userId!);
  if (!leagueRow) {
    res.status(404).json({ error: 'League not found or not joined.' });
    return;
  }
  const league = serializeLeague(leagueRow);
  const members = await query<LeagueMemberRow>(
    `SELECT u.guid AS userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            lm.admin AS isadmin, lm.approved
     FROM leaguemembers lm
     JOIN users u ON u.guid = lm.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE lm.leagueid = $1
     ORDER BY lm.admin DESC, lm.approved DESC, lower(COALESCE(m.nickname, u.emailaddress)) ASC`,
    [league.leagueid]
  );
  const events = await query<LeagueEventRow>(
    `SELECT e.eventid, e.leagueid, e.name, e.eventdate, e.eventnumber, e.active, e.createdat,
            (SELECT count(*) FROM leagueresults WHERE eventid = e.eventid) AS resultcount
     FROM leagueevents e
     WHERE e.leagueid = $1 AND e.active = TRUE
     ORDER BY e.eventnumber ASC NULLS LAST, e.eventdate ASC NULLS LAST, e.createdat ASC`,
    [league.leagueid]
  );
  const results = await query<LeagueResultRow>(
    `SELECT r.resultid, r.eventid, r.leagueid, r.userid,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            r.placed, r.dnf, r.points, r.showupbonuspoints, r.loggedby, r.createdat, r.updatedat
     FROM leagueresults r
     JOIN users u ON u.guid = r.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE r.leagueid = $1`,
    [league.leagueid]
  );
  const payments = await query<LeaguePaymentRow>(
    `SELECT p.paymentid, p.leagueid, p.userid,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            p.eventid, e.name AS eventname, p.paymenttype, CAST(p.amount AS DECIMAL) AS amount,
            p.paidat, p.note, p.recordedby, p.createdat
     FROM leaguepayments p
     JOIN users u ON u.guid = p.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     LEFT JOIN leagueevents e ON e.eventid = p.eventid
     WHERE p.leagueid = $1
     ORDER BY p.paidat DESC, p.createdat DESC`,
    [league.leagueid]
  );
  res.json({
    league,
    members,
    events,
    results,
    payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount || 0) })),
    standings: buildStandings(members, results, Number(league.bestfinishcount || 7)),
    finalstacks: buildFinalStacks(buildStandings(members, results, Number(league.bestfinishcount || 7)), league),
  });
});

leaguesRouter.post('/:id/payments', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as { userid?: string; eventid?: string | null; paymenttype?: string; amount?: number; paidat?: string; note?: string };
  const userId = String(body.userid ?? '');
  if (!await requireLeagueMember(req.params.id, userId)) {
    res.status(400).json({ error: 'Player is not an approved league member.' });
    return;
  }
  const paymentType = ['league', 'event', 'other'].includes(String(body.paymenttype)) ? String(body.paymenttype) : 'league';
  const amount = Math.max(0, Math.round(Number(body.amount ?? 0) * 100) / 100);
  if (!amount) {
    res.status(400).json({ error: 'Payment amount required.' });
    return;
  }
  const eventId = body.eventid ? String(body.eventid) : null;
  if (eventId) {
    const event = await queryOne(`SELECT 1 FROM leagueevents WHERE leagueid = $1 AND eventid = $2`, [req.params.id, eventId]);
    if (!event) {
      res.status(400).json({ error: 'Event is not part of this league.' });
      return;
    }
  }
  const paidAt = body.paidat ? String(body.paidat).slice(0, 10) : null;
  const note = String(body.note ?? '').trim().slice(0, 240) || null;
  const row = await queryOne<LeaguePaymentRow>(
    `INSERT INTO leaguepayments (leagueid, userid, eventid, paymenttype, amount, paidat, note, recordedby)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::DATE, current_date()), $7, $8)
     RETURNING paymentid, leagueid, userid, eventid, paymenttype, CAST(amount AS DECIMAL) AS amount, paidat, note, recordedby, createdat`,
    [req.params.id, userId, eventId, paymentType, amount, paidAt, note, req.userId]
  );
  res.status(201).json({ payment: row ? { ...row, amount: Number(row.amount || 0) } : null });
});

leaguesRouter.delete('/:id/payments/:paymentId', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  await query(`DELETE FROM leaguepayments WHERE leagueid = $1 AND paymentid = $2`, [req.params.id, req.params.paymentId]);
  res.json({ success: true });
});

leaguesRouter.post('/:id/events', async (req: Request, res: Response) => {
  if (!await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  const body = req.body as { name?: string; eventdate?: string | null; eventnumber?: number };
  const name = String(body.name ?? '').trim().slice(0, 160);
  if (!name) {
    res.status(400).json({ error: 'Event name required.' });
    return;
  }
  const eventNumber = Math.max(1, Math.round(Number(body.eventnumber ?? 1)));
  const date = body.eventdate ? String(body.eventdate).slice(0, 10) : null;
  const row = await queryOne<LeagueEventRow>(
    `INSERT INTO leagueevents (leagueid, name, eventdate, eventnumber)
     VALUES ($1, $2, $3, $4)
     RETURNING eventid, leagueid, name, eventdate, eventnumber, active, createdat`,
    [req.params.id, name, date, eventNumber]
  );
  res.status(201).json({ event: row });
});

async function upsertResult(req: Request, res: Response, targetUserId: string) {
  const leagueRow = await getLeagueForUser(req.params.id, req.userId!);
  if (!leagueRow) {
    res.status(404).json({ error: 'League not found.' });
    return;
  }
  const event = await queryOne<LeagueEventRow>(
    `SELECT eventid, leagueid FROM leagueevents WHERE eventid = $1 AND leagueid = $2 AND active = TRUE`,
    [req.params.eventId, req.params.id]
  );
  if (!event) {
    res.status(404).json({ error: 'League event not found.' });
    return;
  }
  const isSelf = targetUserId === req.userId;
  if (!isSelf && !await requireLeagueAdmin(req.params.id, req.userId!)) {
    res.status(403).json({ error: 'League admin required.' });
    return;
  }
  if (!await requireLeagueMember(req.params.id, targetUserId)) {
    res.status(400).json({ error: 'Player is not an approved league member.' });
    return;
  }

  const body = req.body as { placed?: number | null; dnf?: boolean };
  const dnf = Boolean(body.dnf);
  const placed = dnf ? null : Math.max(1, Math.round(Number(body.placed ?? 0)));
  if (!dnf && !placed) {
    res.status(400).json({ error: 'Place required.' });
    return;
  }
  const pointsLookup = normalizePointsLookup(leagueRow.pointslookup);
  const points = pointsForPlace(pointsLookup, placed, dnf);
  const showupBonus = dnf ? 0 : Math.max(0, Number(leagueRow.showupbonuspoints || 0));

  const row = await queryOne<LeagueResultRow>(
    `INSERT INTO leagueresults (eventid, leagueid, userid, placed, dnf, points, showupbonuspoints, loggedby)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (eventid, userid) DO UPDATE
     SET placed = $4,
         dnf = $5,
         points = $6,
         showupbonuspoints = $7,
         loggedby = $8,
         updatedat = now()
     RETURNING resultid, eventid, leagueid, userid, placed, dnf, points, showupbonuspoints, loggedby, createdat, updatedat`,
    [event.eventid, req.params.id, targetUserId, placed, dnf, points, showupBonus, req.userId]
  );
  res.json({ result: row });
}

leaguesRouter.put('/:id/events/:eventId/results/:userId', async (req: Request, res: Response) => {
  await upsertResult(req, res, req.params.userId);
});

leaguesRouter.put('/:id/events/:eventId/self-result', async (req: Request, res: Response) => {
  await upsertResult(req, res, req.userId!);
});
