import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db';
import { sqlCanUseClubFeatures, sqlResolveTierId, sqlResolveTierKey, syncSuperAdminByEmail } from '../account';
import { signToken, requireAuth } from '../middleware/auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email';
import { encryptEmail, hashEmail, normalizeEmail, privateEmailPlaceholder, publicEmail } from '../privacy';

export const authRouter = Router();

const AUDIO_DATA_URL_PATTERN = /^data:audio\/(?:mpeg|mp3|wav|wave|x-wav|mp4|m4a|x-m4a|aac);base64,[A-Za-z0-9+/=]+$/i;
const MAX_AUDIO_DATA_URL_LENGTH = 4_200_000;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const MAX_IMAGE_DATA_URL_LENGTH = 2_800_000;

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, displayname, acceptterms } = req.body as {
    email: string; password: string; displayname?: string; acceptterms?: boolean;
  };
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) { res.status(400).json({ error: 'Email and password required' }); return; }
  if (acceptterms !== true) { res.status(400).json({ error: 'You must agree to the Terms of Service to create an account.' }); return; }

  const emailhash = hashEmail(normalizedEmail);
  const existing = await queryOne('SELECT guid FROM users WHERE emailhash = $1', [emailhash]);
  if (existing) { res.status(409).json({ error: 'Email already registered' }); return; }

  const hash = await bcrypt.hash(password, 12);
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const userId = uuidv4();

  const row = await queryOne<{ guid: string }>(
    `INSERT INTO users (guid, emailaddress, emailhash, emailencrypted, password, verificationpin)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING guid`,
    [userId, privateEmailPlaceholder(userId), emailhash, encryptEmail(normalizedEmail), hash, pin]
  );
  if (!row) { res.status(500).json({ error: 'Failed to create user' }); return; }

  await query(
    `INSERT INTO usermetadata (userid, nickname, tierid, issuperadmin, hostedtournamentcount, termsacceptedat)
     VALUES ($1, $2, 1, FALSE, 0, now())`,
    [row.guid, displayname ?? normalizedEmail.split('@')[0]]
  );
  await syncSuperAdminByEmail(row.guid);

  try { await sendVerificationEmail(normalizedEmail, pin); } catch { /* non-fatal */ }

  res.status(201).json({ message: 'Account created. Check your email for a verification PIN.' });
});

authRouter.post('/verify-email', async (req: Request, res: Response) => {
  const { email, pin } = req.body as { email: string; pin: string };
  const normalizedEmail = normalizeEmail(email);
  const user = await queryOne<{ guid: string; verificationpin: string }>(
    `SELECT guid, verificationpin FROM users WHERE emailhash = $1`,
    [hashEmail(normalizedEmail)]
  );
  if (!user || user.verificationpin !== pin) {
    res.status(400).json({ error: 'Invalid PIN' }); return;
  }
  await query(`UPDATE users SET emailverified = TRUE, verificationpin = NULL WHERE guid = $1`, [user.guid]);
  await repairEmailEncryption(user.guid, normalizedEmail);
  const token = signToken(user.guid);
  res.json({ token });
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const normalizedEmail = normalizeEmail(email);
  const user = await queryOne<{ guid: string; password: string; emailverified: boolean; emailaddress: string | null; emailencrypted: string | null }>(
    `SELECT guid, password, emailverified, emailaddress, emailencrypted FROM users WHERE emailhash = $1`,
    [hashEmail(normalizedEmail)]
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

  await repairEmailEncryption(user.guid, normalizedEmail, user.emailencrypted, user.emailaddress);

  const token = signToken(user.guid);
  res.json({ token });
});

authRouter.post('/request-reset', async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  const normalizedEmail = normalizeEmail(email);
  const user = await queryOne<{ guid: string; emailencrypted: string | null; emailaddress: string | null }>(
    `SELECT guid, emailencrypted, emailaddress FROM users WHERE emailhash = $1`, [hashEmail(normalizedEmail)]
  );
  // Always respond 200 to prevent user enumeration
  if (user) {
    const resetPin = Math.floor(100000 + Math.random() * 900000).toString();
    await query(`UPDATE users SET verificationpin = $1 WHERE guid = $2`, [resetPin, user.guid]);
    try { await sendPasswordResetEmail(publicEmail(user.emailencrypted, user.emailaddress) || normalizedEmail, resetPin); } catch { /* non-fatal */ }
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
  await syncSuperAdminByEmail(req.userId!);
  const row = await selectAuthProfile(req.userId!);
  if (!row) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(row);
});

authRouter.put('/me', requireAuth, async (req: Request, res: Response) => {
  const { displayname, checkinaudiodata, checkinaudiofilename, clearcheckinaudio, avatarimagedata, avatarfilename, clearavatarimage, completeonboarding } = req.body as {
    displayname?: string;
    checkinaudiodata?: string | null;
    checkinaudiofilename?: string | null;
    clearcheckinaudio?: boolean;
    avatarimagedata?: string | null;
    avatarfilename?: string | null;
    clearavatarimage?: boolean;
    completeonboarding?: boolean;
  };

  const normalizedDisplayName = typeof displayname === 'string' ? displayname.trim() : undefined;
  const normalizedAudioData = typeof checkinaudiodata === 'string' ? checkinaudiodata.trim() : undefined;
  const normalizedAudioFilename = typeof checkinaudiofilename === 'string' ? checkinaudiofilename.trim().slice(0, 255) : undefined;
  const normalizedAvatarData = typeof avatarimagedata === 'string' ? avatarimagedata.trim() : undefined;
  const normalizedAvatarFilename = typeof avatarfilename === 'string' ? avatarfilename.trim().slice(0, 255) : undefined;

  if (normalizedAudioData !== undefined) {
    if (!AUDIO_DATA_URL_PATTERN.test(normalizedAudioData)) {
      res.status(400).json({ error: 'Only MP3, WAV, M4A, or AAC audio is supported.' });
      return;
    }
    if (normalizedAudioData.length > MAX_AUDIO_DATA_URL_LENGTH) {
      res.status(400).json({ error: 'Audio file is too large. Keep it under about 3 MB.' });
      return;
    }
  }
  if (normalizedAvatarData !== undefined) {
    if (!IMAGE_DATA_URL_PATTERN.test(normalizedAvatarData)) {
      res.status(400).json({ error: 'Only PNG, JPG, GIF, or WEBP images are supported.' });
      return;
    }
    if (normalizedAvatarData.length > MAX_IMAGE_DATA_URL_LENGTH) {
      res.status(400).json({ error: 'Image is too large. Keep it under about 2 MB.' });
      return;
    }
  }

  await query(
    `UPDATE usermetadata
     SET nickname = COALESCE($2::STRING, nickname),
         checkinaudiodata = CASE
           WHEN $5::BOOL = TRUE THEN NULL
           WHEN $3::STRING IS NOT NULL THEN $3::STRING
           ELSE checkinaudiodata
         END,
         checkinaudiofilename = CASE
           WHEN $5::BOOL = TRUE THEN NULL
           WHEN $4::STRING IS NOT NULL THEN $4::STRING
           ELSE checkinaudiofilename
         END,
         avatarimagedata = CASE
           WHEN $8::BOOL = TRUE THEN NULL
           WHEN $6::STRING IS NOT NULL THEN $6::STRING
           ELSE avatarimagedata
         END,
         avatarfilename = CASE
           WHEN $8::BOOL = TRUE THEN NULL
           WHEN $7::STRING IS NOT NULL THEN $7::STRING
           ELSE avatarfilename
         END,
         onboardingtourcompletedat = CASE
           WHEN $9::BOOL = TRUE THEN COALESCE(onboardingtourcompletedat, now())
           ELSE onboardingtourcompletedat
         END
     WHERE userid = $1`,
    [
      req.userId,
      normalizedDisplayName ?? null,
      normalizedAudioData ?? null,
      normalizedAudioFilename ?? null,
      clearcheckinaudio === true,
      normalizedAvatarData ?? null,
      normalizedAvatarFilename ?? null,
      clearavatarimage === true,
      completeonboarding === true,
    ]
  );

  await syncSuperAdminByEmail(req.userId!);
  const row = await selectAuthProfile(req.userId!);
  if (!row) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(row);
});

async function selectAuthProfile(userId: string) {
  return queryOne<{
    guid: string;
    emailaddress: string;
    emailencrypted?: string | null;
    emailverified: boolean;
    displayname: string;
    tierid: number;
    accounttier: string;
    issuperadmin: boolean;
    hostedtournamentcount: number;
    trialhostedremaining: number;
    trialactive: boolean;
    canuseclubfeatures: boolean;
    checkinaudiodata?: string | null;
    checkinaudiofilename?: string | null;
    hascheckinaudio?: boolean;
    avatarimagedata?: string | null;
    avatarfilename?: string | null;
    hasavatarimage?: boolean;
    onboardingtourcompletedat?: string | null;
    onboardingcomplete?: boolean;
  }>(
    `SELECT u.guid, u.emailaddress, u.emailencrypted, u.emailverified,
            COALESCE(m.nickname, NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''), u.emailaddress) AS displayname,
            ${sqlResolveTierId('m')} AS tierid,
            ${sqlResolveTierKey('m')} AS accounttier,
            COALESCE(m.issuperadmin, FALSE) AS issuperadmin,
            COALESCE(CAST(m.hostedtournamentcount AS INT), 0) AS hostedtournamentcount,
            GREATEST(2 - COALESCE(CAST(m.hostedtournamentcount AS INT), 0), 0) AS trialhostedremaining,
            CASE
              WHEN ${sqlResolveTierId('m')} = 1 AND COALESCE(CAST(m.hostedtournamentcount AS INT), 0) < 2 THEN TRUE
              ELSE FALSE
            END AS trialactive,
            ${sqlCanUseClubFeatures('m')} AS canuseclubfeatures,
            m.checkinaudiodata,
            m.checkinaudiofilename,
            CASE WHEN m.checkinaudiodata IS NOT NULL AND length(m.checkinaudiodata) > 0 THEN TRUE ELSE FALSE END AS hascheckinaudio,
            m.avatarimagedata,
            m.avatarfilename,
            CASE WHEN m.avatarimagedata IS NOT NULL AND length(m.avatarimagedata) > 0 THEN TRUE ELSE FALSE END AS hasavatarimage,
            m.onboardingtourcompletedat,
            CASE WHEN m.onboardingtourcompletedat IS NOT NULL THEN TRUE ELSE FALSE END AS onboardingcomplete
     FROM users u
     LEFT JOIN usermetadata m ON m.userid = u.guid
     LEFT JOIN accounttiers at ON at.tierid = ${sqlResolveTierId('m')}
     WHERE u.guid = $1`,
    [userId]
  ).then((row) => row ? {
    ...row,
    emailaddress: publicEmail(row.emailencrypted, row.emailaddress),
    displayname: row.displayname === row.emailaddress ? publicEmail(row.emailencrypted, row.emailaddress) : row.displayname,
  } : null);
}

async function repairEmailEncryption(
  userId: string,
  normalizedEmail: string,
  emailencrypted?: string | null,
  emailaddress?: string | null
) {
  if (publicEmail(emailencrypted, emailaddress) === normalizedEmail) return;
  await query(
    `UPDATE users
     SET emailencrypted = $2,
         emailaddress = $3,
         emailhash = $4
     WHERE guid = $1`,
    [userId, encryptEmail(normalizedEmail), privateEmailPlaceholder(userId), hashEmail(normalizedEmail)]
  );
}
