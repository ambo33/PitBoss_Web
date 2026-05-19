import { Router, Request, Response } from 'express';
import { query, queryOne, pool } from '../db';
import { requireAuth } from '../middleware/auth';

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

type LeagueRow = {
  leagueid: string;
  ownerid: string;
  name: string;
  invitecode: string;
  approvalneeded: boolean;
  showupbonuspoints: number;
  bestfinishcount: number;
  pointslookup: LeaguePointRule[] | string;
  active: boolean;
  createdat: string;
  isadmin?: boolean;
  approved?: boolean;
  membercount?: number;
  eventcount?: number;
};

type LeaguePointRule = { place: number | 'DNF'; points: number };
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

function generateInviteCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function normalizeInviteCode(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
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

function serializeLeague(row: LeagueRow) {
  return {
    ...row,
    pointslookup: typeof row.pointslookup === 'string'
      ? JSON.parse(row.pointslookup) as LeaguePointRule[]
      : row.pointslookup,
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
            l.showupbonuspoints, l.bestfinishcount, l.pointslookup, l.active, l.createdat,
            lm.admin AS isadmin, lm.approved,
            (SELECT count(*) FROM leaguemembers WHERE leagueid = l.leagueid AND approved = TRUE) AS membercount,
            (SELECT count(*) FROM leagueevents WHERE leagueid = l.leagueid AND active = TRUE) AS eventcount
     FROM leagues l
     JOIN leaguemembers lm ON lm.leagueid = l.leagueid AND lm.userid = $2
     WHERE l.leagueid = $1 AND l.active = TRUE`,
    [leagueId, userId]
  );
}

leaguesRouter.get('/', async (req: Request, res: Response) => {
  const rows = await query<LeagueRow>(
    `SELECT l.leagueid, l.userid AS ownerid, l.name, l.invitecode, l.approvalneeded,
            l.showupbonuspoints, l.bestfinishcount, l.pointslookup, l.active, l.createdat,
            lm.admin AS isadmin, lm.approved,
            (SELECT count(*) FROM leaguemembers WHERE leagueid = l.leagueid AND approved = TRUE) AS membercount,
            (SELECT count(*) FROM leagueevents WHERE leagueid = l.leagueid AND active = TRUE) AS eventcount
     FROM leagues l
     JOIN leaguemembers lm ON lm.leagueid = l.leagueid AND lm.userid = $1
     WHERE l.active = TRUE
     ORDER BY lm.admin DESC, lower(l.name) ASC`,
    [req.userId]
  );
  res.json(rows.map(serializeLeague));
});

leaguesRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as { name?: string; approvalneeded?: boolean; showupbonuspoints?: number; bestfinishcount?: number; pointslookup?: unknown };
  const name = String(body.name ?? '').trim().slice(0, 160);
  if (!name) {
    res.status(400).json({ error: 'League name required.' });
    return;
  }
  const showupBonus = Math.max(0, Math.round(Number(body.showupbonuspoints ?? 300)));
  const bestFinishCount = Math.max(1, Math.min(100, Math.round(Number(body.bestfinishcount ?? 7))));
  const pointsLookup = normalizePointsLookup(body.pointslookup);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invitecode = generateInviteCode();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const leagueResult = await client.query<{ leagueid: string }>(
        `INSERT INTO leagues (userid, name, invitecode, approvalneeded, showupbonuspoints, bestfinishcount, pointslookup)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING leagueid`,
        [req.userId, name, invitecode, Boolean(body.approvalneeded), showupBonus, bestFinishCount, JSON.stringify(pointsLookup)]
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
    `SELECT leagueid, approvalneeded FROM leagues WHERE invitecode = $1 AND active = TRUE`,
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
  res.json({
    league,
    members,
    events,
    results,
    standings: buildStandings(members, results, Number(league.bestfinishcount || 7)),
  });
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
