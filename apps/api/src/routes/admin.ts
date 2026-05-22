import { Router, Request, Response } from 'express';
import { access, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { getAccountProfile, getDefaultAiCredits, requireSuperAdmin, setDefaultAiCredits, sqlCanUseClubFeatures, sqlResolveTierId, sqlResolveTierKey } from '../account';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';
import { generateVoiceLabClip, generateVoiceLabScript } from '../services/openai';
import { hashEmail, normalizeEmail, publicEmail } from '../privacy';

export const adminRouter = Router();
adminRouter.use(requireAuth);

adminRouter.use(async (req: Request, res: Response, next) => {
  if (!await requireSuperAdmin(req.userId!)) {
    res.status(403).json({ error: 'Admins only' });
    return;
  }
  next();
});

adminRouter.get('/feedback', async (_req: Request, res: Response) => {
  const rows = await query<{
    id: string;
    userid: string | null;
    emailaddress: string | null;
    emailencrypted: string | null;
    displayname: string | null;
    type: string;
    message: string;
    pageurl: string | null;
    useragent: string | null;
    status: string;
    createdat: string;
  }>(
    `SELECT f.id, f.userid, u.emailaddress, u.emailencrypted,
            COALESCE(um.nickname, NULLIF(trim(concat(coalesce(um.firstname, ''), ' ', coalesce(um.lastname, ''))), ''), u.emailaddress) AS displayname,
            f.type, f.message, f.pageurl, f.useragent, f.status, f.createdat
     FROM feedback f
     LEFT JOIN users u ON u.guid = f.userid
     LEFT JOIN usermetadata um ON um.userid = u.guid
     ORDER BY CASE WHEN f.status = 'new' THEN 0 WHEN f.status = 'closed' THEN 2 ELSE 1 END, f.createdat DESC
     LIMIT 100`
  );
  const countRows = await query<{ newcount: string | number }>(
    `SELECT count(*) AS newcount
     FROM feedback
     WHERE status = 'new'`
  );

  res.json({
    newcount: Number(countRows[0]?.newcount ?? 0),
    feedback: rows.map((row) => {
      const emailaddress = publicEmail(row.emailencrypted, row.emailaddress);
      return {
        ...row,
        emailaddress,
        displayname: row.displayname === row.emailaddress ? emailaddress : row.displayname,
      };
    }),
  });
});

adminRouter.get('/feedback/summary', async (_req: Request, res: Response) => {
  const rows = await query<{ newcount: string | number }>(
    `SELECT count(*) AS newcount
     FROM feedback
     WHERE status = 'new'`
  );
  res.json({ newcount: Number(rows[0]?.newcount ?? 0) });
});

adminRouter.get('/settings/ai-credits', async (_req: Request, res: Response) => {
  res.json({ defaultaicredits: await getDefaultAiCredits() });
});

adminRouter.put('/settings/ai-credits', async (req: Request, res: Response) => {
  const credits = Number((req.body as { defaultaicredits?: number }).defaultaicredits);
  if (!Number.isFinite(credits) || credits < 0) {
    res.status(400).json({ error: 'Default voice credits must be zero or higher.' });
    return;
  }
  res.json({ defaultaicredits: await setDefaultAiCredits(credits) });
});

adminRouter.put('/feedback/:id', async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  const nextStatus = status === 'closed' ? 'closed' : status === 'new' ? 'new' : 'looked_at';
  const rows = await query<{ id: string; status: string }>(
    `UPDATE feedback
     SET status = $2
     WHERE id = $1
     RETURNING id, status`,
    [req.params.id, nextStatus]
  );
  if (!rows[0]) {
    res.status(404).json({ error: 'Feedback not found' });
    return;
  }
  res.json({ success: true, id: rows[0].id, status: rows[0].status });
});

const voicePacingInstruction = 'IMPORTANT: Maintain fast conversational pacing with natural flow. Avoid long pauses between phrases. Do not sound robotic, sleepy, sluggish, or overly corporate.';

const voiceLabStyles: Record<string, { label: string; voice: string; description: string; bestFor: string; instructions: string }> = {
  all_in_alex: {
    label: 'All-In Alex',
    voice: 'echo',
    description: 'Fast Vegas poker announcer',
    bestFor: 'Tournament intros, blind level increases, final table announcements',
    instructions: `Male voice. Energetic Las Vegas tournament announcer with rapid pacing and confident rhythm. Speak with excitement and momentum, like a live poker room host introducing a major event. Avoid robotic pauses and avoid sounding slow or sleepy. Tight cadence, punchy delivery, slightly gritty texture, dramatic emphasis on player counts, blinds, and tournament names. Natural human emotion with strong flow and quick transitions between phrases. ${voicePacingInstruction}`,
  },
  royal_rumble_riley: {
    label: 'Royal Rumble Riley',
    voice: 'onyx',
    description: 'Sports arena announcer',
    bestFor: 'Knockout announcements, shuffle up and deal, champion reveals',
    instructions: `Male voice inspired by high-energy NFL and UFC arena announcers. Powerful projection with fast cadence and explosive delivery. Sound hyped and theatrical but still natural. Prioritize momentum and excitement over slow clarity. Minimal dead air between phrases. Strong emphasis on dramatic tournament moments and player eliminations. Do not mention real leagues, teams, fighters, or copyrighted catchphrases. ${voicePacingInstruction}`,
  },
  velvet_dealer: {
    label: 'Velvet Dealer',
    voice: 'shimmer',
    description: 'Cool female casino host',
    bestFor: 'Upscale poker rooms, classy intros, player welcomes',
    instructions: `Female voice with smooth casino-host energy. Fast but elegant cadence. Confident, playful, slightly seductive Vegas lounge tone without sounding exaggerated. Natural conversational pacing with fluid transitions and no robotic pauses. Sound like a polished high-end poker room presenter welcoming players to an exciting tournament. ${voicePacingInstruction}`,
  },
  chipstorm: {
    label: 'Chipstorm',
    voice: 'ash',
    description: 'Hyper esports caster',
    bestFor: 'Online poker modes, turbo tournaments, fast blind warnings',
    instructions: `Male esports-style caster with very high energy and accelerated pacing. Sharp articulation with constant momentum and excitement. Sound like a live Twitch tournament commentator reacting in real time. No sluggish delivery. Tight timing and aggressive hype. Human and expressive, never robotic. Do not mention Twitch or any real platform as affiliation. ${voicePacingInstruction}`,
  },
  queen_of_spades: {
    label: 'Queen of Spades',
    voice: 'nova',
    description: 'Fast confident female announcer',
    bestFor: 'Premium voice pack, women-hosted poker nights, modern app feel',
    instructions: `Female tournament announcer with fast cadence, confident authority, and modern sports-broadcast energy. Sound sharp, exciting, and polished. Avoid overly soft or sleepy delivery. Tight phrasing with energetic flow and strong emphasis on key tournament details like blinds, payouts, and player counts. ${voicePacingInstruction}`,
  },
  the_pit_boss: {
    label: 'The Pit Boss',
    voice: 'onyx',
    description: 'Gruff casino floor manager',
    bestFor: 'Level-up alerts, clock warnings, rebuy ending announcements',
    instructions: `Deep male voice with rough casino-floor authority and rapid delivery. Sound experienced, commanding, and slightly intimidating in a fun way. Speak quickly and naturally like a real poker room veteran managing a busy tournament floor. Strong cadence with minimal pauses. ${voicePacingInstruction}`,
  },
  british_high_roller: {
    label: 'British High Roller',
    voice: 'fable',
    description: 'Fast luxury British host',
    bestFor: 'Premium mode, high roller events, luxury themes',
    instructions: `British female voice with refined luxury-casino energy and quicker-than-normal pacing. Elegant but lively. Sound polished, intelligent, and engaging without drifting into slow audiobook narration. Smooth transitions and crisp emphasis on names, blinds, and tournament structure. ${voicePacingInstruction}`,
  },
  turbo_tony: {
    label: 'Turbo Tony',
    voice: 'echo',
    description: 'NY poker room chaos energy',
    bestFor: 'Home games, funny mode, chaotic friend groups',
    instructions: `Fast-talking New York poker room announcer with strong personality and nonstop momentum. Slight streetwise energy, playful confidence, and rapid pacing. Sound like a charismatic live tournament host trying to keep players energized and moving quickly. ${voicePacingInstruction}`,
  },
  midnight_mayhem: {
    label: 'Midnight Mayhem',
    voice: 'onyx',
    description: 'Dark cinematic narrator',
    bestFor: 'Bounty events, final tables, cinematic intros',
    instructions: `Male cinematic narrator with deep dramatic intensity and moderately fast pacing. Sound suspenseful and immersive like a poker documentary trailer. Avoid sluggish pauses. Maintain forward momentum while emphasizing tension and stakes. ${voicePacingInstruction}`,
  },
  sunny_stacks: {
    label: 'Sunny Stacks',
    voice: 'coral',
    description: 'Friendly upbeat female',
    bestFor: 'Casual clubs, family-friendly tone, beginner nights',
    instructions: `Female voice with upbeat friendly poker-host energy. Quick conversational cadence with warmth and enthusiasm. Sound welcoming and lively, like a charismatic cruise director running a fun casino event. Avoid robotic pacing or long pauses. ${voicePacingInstruction}`,
  },
};

function sanitizeClipName(value: string) {
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return name || `voice-demo-${Date.now()}`;
}

function publicVoiceLabPath(filename: string) {
  return `/sounds/ai-demo/custom/${filename}`;
}

type VoiceLabManifestEntry = {
  style: string;
  label: string;
  text: string;
  filename: string;
  url: string;
  bytes: number;
  updatedAt: string;
};

function voiceLabOutputDir() {
  return path.resolve(__dirname, '../../../web/public/sounds/ai-demo/custom');
}

function voiceLabManifestPath() {
  return path.join(voiceLabOutputDir(), 'manifest.json');
}

function voiceLabStyleFilename(style: string) {
  return `${sanitizeClipName(style)}.mp3`;
}

async function fileExists(filepath: string) {
  try {
    await access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function readVoiceLabManifest(): Promise<VoiceLabManifestEntry[]> {
  try {
    const content = await readFile(voiceLabManifestPath(), 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is VoiceLabManifestEntry => {
      return Boolean(
        entry
          && typeof entry === 'object'
          && typeof (entry as VoiceLabManifestEntry).style === 'string'
          && typeof (entry as VoiceLabManifestEntry).filename === 'string'
          && typeof (entry as VoiceLabManifestEntry).text === 'string'
      );
    });
  } catch {
    return [];
  }
}

async function writeVoiceLabManifest(nextEntry: VoiceLabManifestEntry) {
  const existing = await readVoiceLabManifest();
  const next = [
    nextEntry,
    ...existing.filter((entry) => entry.style !== nextEntry.style),
  ].sort((a, b) => a.label.localeCompare(b.label));
  await writeFile(voiceLabManifestPath(), `${JSON.stringify(next, null, 2)}\n`);
}

adminRouter.get('/voice-lab/styles', async (_req: Request, res: Response) => {
  const manifest = await readVoiceLabManifest();
  res.json({
    styles: Object.entries(voiceLabStyles).map(([id, style]) => ({
      id,
      label: style.label,
      description: style.description,
      bestFor: style.bestFor,
      savedClip: manifest.find((entry) => entry.style === id) ?? null,
    })),
  });
});

adminRouter.post('/voice-lab/script', async (req: Request, res: Response) => {
  const { style, brief } = req.body as { style?: string; brief?: string };
  const selected = voiceLabStyles[style ?? ''] ?? voiceLabStyles.all_in_alex;
  const trimmedBrief = String(brief ?? '').trim();
  if (!trimmedBrief) {
    res.status(400).json({ error: 'Tell the lab what the clip should say or sell.' });
    return;
  }
  try {
    const script = await generateVoiceLabScript(selected.label, selected.instructions, trimmedBrief);
    res.json({ script });
  } catch (err) {
    console.error('Voice lab script failed', err instanceof Error ? err.message : err);
    res.status(503).json({ error: 'Script generation is unavailable right now.' });
  }
});

adminRouter.post('/voice-lab/clips', async (req: Request, res: Response) => {
  const { style, text, overwrite } = req.body as { style?: string; text?: string; filename?: string; overwrite?: boolean };
  const styleId = voiceLabStyles[style ?? ''] ? String(style) : 'all_in_alex';
  const selected = voiceLabStyles[styleId];
  const scriptText = String(text ?? '').trim();
  if (!scriptText) {
    res.status(400).json({ error: 'Script text required.' });
    return;
  }
  if (scriptText.length > 420) {
    res.status(400).json({ error: 'Keep demo clips under 420 characters.' });
    return;
  }

  const safeFilename = voiceLabStyleFilename(styleId);
  const outputDir = voiceLabOutputDir();
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, safeFilename);
  const existingManifest = await readVoiceLabManifest();
  const existingEntry = existingManifest.find((entry) => entry.style === styleId);
  const existingFile = await fileExists(outputPath);

  if ((existingEntry || existingFile) && !overwrite) {
    res.status(409).json({
      error: `${selected.label} already has a saved landing clip. Confirm overwrite to replace it.`,
      requiresOverwrite: true,
      existing: existingEntry ?? {
        style: styleId,
        label: selected.label,
        text: '',
        filename: safeFilename,
        url: publicVoiceLabPath(safeFilename),
        bytes: 0,
        updatedAt: '',
      },
    });
    return;
  }

  try {
    const clip = await generateVoiceLabClip({
      text: scriptText,
      voice: selected.voice,
      instructions: selected.instructions,
    });
    await writeFile(outputPath, clip.audioBuffer);
    const saved = {
      style: styleId,
      label: selected.label,
      filename: safeFilename,
      url: publicVoiceLabPath(safeFilename),
      bytes: clip.audioBuffer.length,
      text: scriptText,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(path.join(outputDir, `${sanitizeClipName(styleId)}.json`), `${JSON.stringify(saved, null, 2)}\n`);
    await writeVoiceLabManifest(saved);

    res.json({
      success: true,
      ...saved,
      mimeType: clip.mimeType,
    });
  } catch (err) {
    console.error('Voice lab clip failed', err instanceof Error ? err.message : err);
    res.status(503).json({ error: 'Voice generation is unavailable right now.' });
  }
});

adminRouter.get('/users', async (req: Request, res: Response) => {
  const emailSearch = typeof req.query.email === 'string' ? normalizeEmail(req.query.email) : '';
  const emailHash = emailSearch ? hashEmail(emailSearch) : null;
  const rows = await query<{
    userid: string;
    emailaddress: string | null;
    emailencrypted: string | null;
    displayname: string;
    [key: string]: unknown;
  }>(
    `SELECT u.guid AS userid,
            u.emailaddress,
            u.emailencrypted,
            COALESCE(um.nickname, NULLIF(trim(concat(coalesce(um.firstname, ''), ' ', coalesce(um.lastname, ''))), ''), u.emailaddress) AS displayname,
            ${sqlResolveTierId('um')} AS tierid,
            ${sqlResolveTierKey('um')} AS accounttier,
            COALESCE(um.issuperadmin, FALSE) AS issuperadmin,
            COALESCE(CAST(um.hostedtournamentcount AS INT), 0) AS hostedtournamentcount,
            GREATEST(2 - COALESCE(CAST(um.hostedtournamentcount AS INT), 0), 0) AS trialhostedremaining,
            CASE
              WHEN ${sqlResolveTierId('um')} = 1 AND COALESCE(CAST(um.hostedtournamentcount AS INT), 0) < 2 THEN TRUE
              ELSE FALSE
            END AS trialactive,
            ${sqlCanUseClubFeatures('um')} AS canuseclubfeatures,
            (
              SELECT count(*)
              FROM groupmembers gm
              JOIN groups g ON g.groupid = gm.groupid
              WHERE gm.userid = u.guid
                AND gm.approved = TRUE
                AND g.active = TRUE
            ) AS groupcount,
            (
              SELECT count(*)
              FROM groupmembers gm
              JOIN groups g ON g.groupid = gm.groupid
              WHERE gm.userid = u.guid
                AND gm.admin = TRUE
                AND gm.approved = TRUE
                AND g.active = TRUE
            ) AS hostedgroupcount,
            (
              SELECT count(*)
              FROM tournaments t
              WHERE t.userid = u.guid
                AND t.date IS NOT NULL
                AND concat(
                  CAST(t.date AS STRING),
                  'T',
                  CASE
                    WHEN t.time IS NULL THEN '23:59:59'
                    ELSE substring(CAST(t.time AS STRING), 1, 8)
                  END
                ) >= $1
            ) AS upcominghostedcount,
            (
              SELECT count(*)
              FROM tournaments t
              WHERE t.userid = u.guid
            ) AS totalhostedcount
     FROM users u
     LEFT JOIN usermetadata um ON um.userid = u.guid
     LEFT JOIN accounttiers at ON at.tierid = ${sqlResolveTierId('um')}
     WHERE ($2::STRING IS NULL OR u.emailhash = $2)
       AND COALESCE(u.emailaddress, '') NOT LIKE 'guest+%@guest.thepokerplanner.com'
       AND COALESCE(u.emailaddress, '') NOT LIKE 'guest+%@guest.pokerplanner.bet'
       AND COALESCE(um.isguestuser, FALSE) = FALSE
     ORDER BY lower(COALESCE(um.nickname, NULLIF(trim(concat(coalesce(um.firstname, ''), ' ', coalesce(um.lastname, ''))), ''), u.emailaddress)) ASC`,
    [nowInAppTimezone(), emailHash]
  );
  res.json(rows.map((row) => {
    const decryptedEmail = publicEmail(row.emailencrypted, row.emailaddress);
    const emailaddress = decryptedEmail || (emailHash ? emailSearch : '');
    return {
      ...row,
      emailaddress,
      displayname: row.displayname === row.emailaddress ? emailaddress : row.displayname,
    };
  }));
});

adminRouter.get('/users/:id', async (req: Request, res: Response) => {
  const account = await getAccountProfile(req.params.id);
  if (!account) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const groups = await query(
    `SELECT g.groupid, g.name, g.invitecode, g.active, gm.admin AS isadmin, gm.approved,
            (SELECT count(*) FROM groupmembers gm2 WHERE gm2.groupid = g.groupid AND gm2.approved = TRUE) AS membercount
     FROM groupmembers gm
     JOIN groups g ON g.groupid = gm.groupid
     WHERE gm.userid = $1
     ORDER BY g.createdate DESC`,
    [req.params.id]
  );

  const tournaments = await query(
    `SELECT t.tournamentid, t.userid AS ownerid, t.name, t.date AS tourneydate, t.time AS tourneytime,
            t.buyin, t.rebuycost AS rebuyprice, t.addoncost AS addonprice, t.maxplayers,
            t.createdate AS createdat, t.userid = $1 AS isowner,
            t.groupid, g.name AS groupname, TRUE AS canmanage,
            EXISTS(SELECT 1 FROM tournamentplayers tp WHERE tp.tournamentid = t.tournamentid AND tp.userid = $1) AS isregistered,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid) AS playercount,
            (SELECT count(*) FROM tournamentplayers WHERE tournamentid = t.tournamentid AND checkedin = TRUE) AS checkedincount,
            EXISTS(SELECT 1 FROM tournamentplayers WHERE tournamentid = t.tournamentid AND placed = 1) AS completed
     FROM tournaments t
     LEFT JOIN groups g ON g.groupid = t.groupid
     WHERE t.userid = $1
        OR EXISTS(SELECT 1 FROM tournamentplayers tp WHERE tp.tournamentid = t.tournamentid AND tp.userid = $1)
     ORDER BY t.createdate DESC`,
    [req.params.id]
  );

  res.json({ account, groups, tournaments });
});

adminRouter.put('/users/:id', async (req: Request, res: Response) => {
  const { tierid, issuperadmin, aicreditsremaining } = req.body as { tierid?: number; issuperadmin?: boolean; aicreditsremaining?: number };
  if (tierid != null && ![1, 2, 3].includes(Number(tierid))) {
    res.status(400).json({ error: 'Invalid account tier' });
    return;
  }
  if (aicreditsremaining != null && (!Number.isFinite(Number(aicreditsremaining)) || Number(aicreditsremaining) < 0)) {
    res.status(400).json({ error: 'Voice credits must be zero or higher.' });
    return;
  }

  await query(
    `INSERT INTO usermetadata (userid, tierid, issuperadmin, aicreditsremaining)
     VALUES ($1, COALESCE($2, 1), COALESCE($3, FALSE), $4)
     ON CONFLICT (userid)
     DO UPDATE SET
       tierid = COALESCE($2, usermetadata.tierid),
       issuperadmin = COALESCE($3, usermetadata.issuperadmin),
       aicreditsremaining = COALESCE($4, usermetadata.aicreditsremaining)`,
    [req.params.id, tierid ?? null, issuperadmin ?? null, aicreditsremaining == null ? null : Math.floor(Number(aicreditsremaining))]
  );

  const account = await getAccountProfile(req.params.id);
  res.json({ success: true, account });
});

function nowInAppTimezone() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
