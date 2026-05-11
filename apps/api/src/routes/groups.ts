import { Router, Request, Response } from 'express';
import { query, queryOne, pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { getClientUrl } from '../config';
import { Group, GroupMember } from '../types';
import { sendGroupInviteEmail } from '../services/email';

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

function generateInviteCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function normalizeInviteCode(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

groupsRouter.get('/', async (req: Request, res: Response) => {
  const rows = await query<Group>(
    `SELECT g.groupid, g.userid AS ownerid, g.name, g.invitecode, g.approvalneeded, g.active, g.createdate AS createdat,
            gm.admin AS isadmin, gm.approved,
            (SELECT count(*) FROM groupmembers WHERE groupid = g.groupid AND approved = TRUE) AS membercount
     FROM groups g
     JOIN groupmembers gm ON gm.groupid = g.groupid AND gm.userid = $1
     WHERE g.active = TRUE
     ORDER BY g.createdate DESC`,
    [req.userId]
  );
  res.json(rows);
});

groupsRouter.post('/', async (req: Request, res: Response) => {
  const { name, approvalneeded } = req.body as { name: string; approvalneeded?: boolean };
  const trimmedName = name?.trim();
  if (!trimmedName) { res.status(400).json({ error: 'Name required' }); return; }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invitecode = generateInviteCode();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const groupResult = await client.query<{ groupid: string }>(
        `INSERT INTO groups (userid, name, invitecode, approvalneeded)
         VALUES ($1, $2, $3, $4) RETURNING groupid`,
        [req.userId, trimmedName, invitecode, approvalneeded ?? false]
      );
      const group = groupResult.rows[0];
      if (!group) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to create group' });
        return;
      }

      await client.query(
        `INSERT INTO groupmembers (groupid, userid, admin, approved) VALUES ($1, $2, TRUE, TRUE)`,
        [group.groupid, req.userId]
      );

      await client.query('COMMIT');
      res.status(201).json({ groupid: group.groupid, invitecode });
      return;
    } catch (err) {
      await client.query('ROLLBACK');
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
      if (code === '23505') {
        continue;
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to create group' });
      return;
    } finally {
      client.release();
    }
  }

  res.status(500).json({ error: 'Failed to create a unique invite code. Please try again.' });
});

groupsRouter.get('/:id', async (req: Request, res: Response) => {
  const group = await queryOne<Group>(
    `SELECT g.groupid, g.userid AS ownerid, g.name, g.invitecode, g.approvalneeded, g.active, g.createdate AS createdat,
            gm.admin AS isadmin, gm.approved FROM groups g
     JOIN groupmembers gm ON gm.groupid = g.groupid AND gm.userid = $2
     WHERE g.groupid = $1`,
    [req.params.id, req.userId]
  );
  if (!group) { res.status(404).json({ error: 'Group not found or not a member' }); return; }

  const members = await query<GroupMember>(
    `SELECT u.guid AS userid, u.emailaddress,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            gm.admin AS isadmin, gm.approved
     FROM groupmembers gm
     JOIN users u ON u.guid = gm.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE gm.groupid = $1
     ORDER BY gm.admin DESC, u.emailaddress`,
    [req.params.id]
  );

  res.json({ ...group, members });
});

groupsRouter.put('/:id', async (req: Request, res: Response) => {
  const { name, approvalneeded, invitecode } = req.body as { name?: string; approvalneeded?: boolean; invitecode?: string };
  const admin = await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND admin = TRUE`,
    [req.params.id, req.userId]
  );
  if (!admin) { res.status(403).json({ error: 'Not a group admin' }); return; }

  const normalizedInviteCode = invitecode == null ? null : normalizeInviteCode(invitecode);
  if (normalizedInviteCode != null) {
    if (!/^[A-Z0-9]{4,12}$/.test(normalizedInviteCode)) {
      res.status(400).json({ error: 'Invite code must be 4-12 letters or numbers.' });
      return;
    }
  }

  try {
    await query(
      `UPDATE groups
       SET name = COALESCE($1, name),
           approvalneeded = COALESCE($2, approvalneeded),
           invitecode = COALESCE($3, invitecode)
       WHERE groupid = $4`,
      [name ?? null, approvalneeded ?? null, normalizedInviteCode, req.params.id]
    );
    res.json({ success: true, invitecode: normalizedInviteCode ?? undefined });
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
    if (code === '23505') {
      res.status(409).json({ error: 'That invite code is already in use.' });
      return;
    }
    throw err;
  }
});

groupsRouter.post('/join', async (req: Request, res: Response) => {
  const { invitecode } = req.body as { invitecode: string };
  const group = await queryOne<{ groupid: string; approvalneeded: boolean }>(
    `SELECT groupid, approvalneeded FROM groups WHERE invitecode = $1 AND active = TRUE`,
    [invitecode?.toUpperCase()]
  );
  if (!group) { res.status(404).json({ error: 'Invalid invite code' }); return; }

  const already = await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2`,
    [group.groupid, req.userId]
  );
  if (already) { res.status(409).json({ error: 'Already a member' }); return; }

  const approved = !group.approvalneeded;
  await query(
    `INSERT INTO groupmembers (groupid, userid, approved) VALUES ($1, $2, $3)`,
    [group.groupid, req.userId, approved]
  );
  res.json({ groupid: group.groupid, pending: !approved });
});

groupsRouter.get('/:id/tournaments', async (req: Request, res: Response) => {
  const member = await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND approved = TRUE`,
    [req.params.id, req.userId]
  );
  if (!member) { res.status(403).json({ error: 'Not a group member' }); return; }

  const rows = await query(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, t.rebuycost AS rebuyprice, t.addoncost AS addonprice, t.maxplayers,
            t.createdate AS createdat, t.groupid,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND userid = $2) AS isregistered
     FROM tournaments t
     WHERE t.groupid = $1
     ORDER BY t.createdate DESC`,
    [req.params.id, req.userId]
  );
  res.json(rows);
});

groupsRouter.post('/:id/invite', async (req: Request, res: Response) => {
  const admin = await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND admin = TRUE`,
    [req.params.id, req.userId]
  );
  if (!admin) { res.status(403).json({ error: 'Not a group admin' }); return; }

  const { email, phone, note } = req.body as { email?: string; phone?: string; note?: string };
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedPhone = phone?.trim();
  const trimmedNote = note?.trim();

  if (!normalizedEmail && !normalizedPhone) {
    res.status(400).json({ error: 'Enter an email address or phone number.' });
    return;
  }

  const group = await queryOne<{ name: string; invitecode: string }>(
    `SELECT name, invitecode FROM groups WHERE groupid = $1`,
    [req.params.id]
  );
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const joinLink = `${getClientUrl()}/join/${encodeURIComponent(group.invitecode)}`;
  if (normalizedEmail) {
    await sendGroupInviteEmail(normalizedEmail, group.name, group.invitecode, trimmedNote);
  }

  const baseMessage = `Join my PitBoss group "${group.name}" with code ${group.invitecode}: ${joinLink}`;
  const fullMessage = trimmedNote ? `${baseMessage} ${trimmedNote}` : baseMessage;
  const smsLink = normalizedPhone
    ? `sms:${normalizedPhone}?body=${encodeURIComponent(fullMessage)}`
    : `sms:?body=${encodeURIComponent(fullMessage)}`;

  res.json({
    success: true,
    emailed: Boolean(normalizedEmail),
    joinLink,
    smsLink,
    smsBody: fullMessage,
  });
});

groupsRouter.put('/:id/members/:userId/approve', async (req: Request, res: Response) => {
  const admin = await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND admin = TRUE`,
    [req.params.id, req.userId]
  );
  if (!admin) { res.status(403).json({ error: 'Not a group admin' }); return; }
  await query(
    `UPDATE groupmembers SET approved = TRUE WHERE groupid = $1 AND userid = $2`,
    [req.params.id, req.params.userId]
  );
  res.json({ success: true });
});

groupsRouter.delete('/:id/members/:userId', async (req: Request, res: Response) => {
  const admin = await queryOne(
    `SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2 AND admin = TRUE`,
    [req.params.id, req.userId]
  );
  const isSelf = req.params.userId === req.userId;
  if (!admin && !isSelf) { res.status(403).json({ error: 'Forbidden' }); return; }

  const targetMembership = await queryOne<{ admin: boolean }>(
    `SELECT COALESCE(admin, FALSE) AS admin FROM groupmembers WHERE groupid = $1 AND userid = $2`,
    [req.params.id, req.params.userId]
  );
  if (!targetMembership) { res.status(404).json({ error: 'Member not found' }); return; }

  if (targetMembership.admin) {
    const adminCount = await queryOne<{ count: string }>(
      `SELECT count(*)::STRING AS count FROM groupmembers WHERE groupid = $1 AND admin = TRUE`,
      [req.params.id]
    );
    if (Number(adminCount?.count ?? 0) <= 1) {
      res.status(400).json({ error: 'A group must have at least one admin.' });
      return;
    }
  }

  await query(
    `DELETE FROM groupmembers WHERE groupid = $1 AND userid = $2`,
    [req.params.id, req.params.userId]
  );
  res.json({ success: true });
});
