import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db';
import { signToken, requireAuth } from '../middleware/auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, displayname } = req.body as {
    email: string; password: string; displayname?: string;
  };
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !password) { res.status(400).json({ error: 'Email and password required' }); return; }

  const existing = await queryOne('SELECT guid FROM users WHERE LOWER(emailaddress) = $1', [normalizedEmail]);
  if (existing) { res.status(409).json({ error: 'Email already registered' }); return; }

  const hash = await bcrypt.hash(password, 12);
  const pin = Math.floor(100000 + Math.random() * 900000).toString();

  const row = await queryOne<{ guid: string }>(
    `INSERT INTO users (emailaddress, password, verificationpin)
     VALUES ($1, $2, $3) RETURNING guid`,
    [normalizedEmail, hash, pin]
  );
  if (!row) { res.status(500).json({ error: 'Failed to create user' }); return; }

  await query(
    `INSERT INTO usermetadata (userid, nickname) VALUES ($1, $2)`,
    [row.guid, displayname ?? normalizedEmail.split('@')[0]]
  );

  try { await sendVerificationEmail(normalizedEmail, pin); } catch { /* non-fatal */ }

  res.status(201).json({ message: 'Account created. Check your email for a verification PIN.' });
});

authRouter.post('/verify-email', async (req: Request, res: Response) => {
  const { email, pin } = req.body as { email: string; pin: string };
  const normalizedEmail = email?.trim().toLowerCase();
  const user = await queryOne<{ guid: string; verificationpin: string }>(
    `SELECT guid, verificationpin FROM users WHERE LOWER(emailaddress) = $1`,
    [normalizedEmail]
  );
  if (!user || user.verificationpin !== pin) {
    res.status(400).json({ error: 'Invalid PIN' }); return;
  }
  await query(`UPDATE users SET emailverified = TRUE, verificationpin = NULL WHERE guid = $1`, [user.guid]);
  const token = signToken(user.guid);
  res.json({ token });
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const normalizedEmail = email?.trim().toLowerCase();
  const user = await queryOne<{ guid: string; password: string; emailverified: boolean }>(
    `SELECT guid, password, emailverified FROM users WHERE LOWER(emailaddress) = $1`,
    [normalizedEmail]
  );
  if (!user) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  let valid = false;
  try {
    valid = typeof user.password === 'string' && user.password.startsWith('$2')
      ? await bcrypt.compare(password, user.password)
      : false;
  } catch {
    valid = false;
  }
  if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  if (!user.emailverified) {
    res.status(403).json({ error: 'Please verify your email before logging in.' }); return;
  }

  const token = signToken(user.guid);
  res.json({ token });
});

authRouter.post('/request-reset', async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  const normalizedEmail = email?.trim().toLowerCase();
  const user = await queryOne<{ guid: string }>(
    `SELECT guid FROM users WHERE LOWER(emailaddress) = $1`, [normalizedEmail]
  );
  // Always respond 200 to prevent user enumeration
  if (user) {
    const resetPin = Math.floor(100000 + Math.random() * 900000).toString();
    await query(`UPDATE users SET verificationpin = $1 WHERE guid = $2`, [resetPin, user.guid]);
    try { await sendPasswordResetEmail(normalizedEmail, resetPin); } catch { /* non-fatal */ }
  }
  res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body as { token: string; password: string };
  const user = await queryOne<{ guid: string }>(
    `SELECT guid FROM users WHERE verificationpin = $1`, [token]
  );
  if (!user) { res.status(400).json({ error: 'Invalid or expired reset token' }); return; }
  const hash = await bcrypt.hash(password, 12);
  await query(`UPDATE users SET password = $1, verificationpin = NULL WHERE guid = $2`, [hash, user.guid]);
  res.json({ message: 'Password updated. You can now log in.' });
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const row = await queryOne<{ guid: string; emailaddress: string; emailverified: boolean; displayname: string }>(
    `SELECT u.guid, u.emailaddress, u.emailverified,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname
     FROM users u LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE u.guid = $1`,
    [req.userId]
  );
  if (!row) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(row);
});
