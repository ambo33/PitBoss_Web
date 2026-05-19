import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const outputDir = path.join(repoRoot, 'apps', 'web', 'public', 'sounds', 'announcer-static');

const pacing = 'Maintain fast conversational pacing with natural flow. Avoid long pauses. Do not sound robotic, sleepy, sluggish, or corporate.';

const styles = {
  all_in_alex: {
    voice: 'echo',
    instructions: `Male energetic Las Vegas poker announcer with rapid pacing, confident rhythm, punchy delivery, and slightly gritty texture. ${pacing}`,
  },
  royal_rumble_riley: {
    voice: 'onyx',
    instructions: `Male sports arena announcer with powerful projection, fast cadence, explosive delivery, and theatrical but natural hype. Do not mention real leagues, teams, fighters, or copyrighted catchphrases. ${pacing}`,
  },
  velvet_dealer: {
    voice: 'shimmer',
    instructions: `Female smooth casino-host energy. Fast but elegant cadence, confident and playful Vegas lounge tone, polished and natural. ${pacing}`,
  },
  chipstorm: {
    voice: 'ash',
    instructions: `Male esports-style caster with very high energy, accelerated pacing, sharp articulation, constant momentum, and expressive live-commentary hype. Do not mention Twitch or any real platform as affiliation. ${pacing}`,
  },
  queen_of_spades: {
    voice: 'nova',
    instructions: `Female tournament announcer with fast cadence, confident authority, modern sports-broadcast energy, and polished emphasis on tournament details. ${pacing}`,
  },
  the_pit_boss: {
    voice: 'onyx',
    instructions: `Deep male voice with rough casino-floor authority, rapid delivery, experienced command, and fun intimidation. ${pacing}`,
  },
  british_high_roller: {
    voice: 'fable',
    instructions: `British female voice with refined luxury-casino energy, quicker-than-normal pacing, crisp emphasis, and elegant but lively delivery. ${pacing}`,
  },
  turbo_tony: {
    voice: 'echo',
    instructions: `Fast-talking New York poker room announcer with strong personality, nonstop momentum, streetwise playfulness, and rapid pacing. ${pacing}`,
  },
  midnight_mayhem: {
    voice: 'onyx',
    instructions: `Male cinematic narrator with deep dramatic intensity, suspenseful tension, immersive tone, and forward-moving pacing. ${pacing}`,
  },
  sunny_stacks: {
    voice: 'coral',
    instructions: `Female upbeat friendly poker-host energy with quick conversational cadence, warmth, enthusiasm, and welcoming casino-event charm. ${pacing}`,
  },
};

const clips = {
  pause: 'Clock paused. Players, hold your action.',
  resume: 'Clock is live. Cards are back in the air.',
  five_minute_warning: 'Five minutes remaining in this level.',
  one_minute_warning: 'One minute remaining in this level.',
};

function slug(value) {
  return value.replace(/_/g, '-');
}

async function createSpeech({ input, voice, instructions }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured in .env.');
  }
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
      voice,
      input,
      instructions,
      response_format: 'mp3',
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return Buffer.from(await response.arrayBuffer());
}

await fs.mkdir(outputDir, { recursive: true });
const manifest = [];

for (const [style, config] of Object.entries(styles)) {
  for (const [event, text] of Object.entries(clips)) {
    const filename = `${slug(style)}-${slug(event)}.mp3`;
    const filePath = path.join(outputDir, filename);
    const audio = await createSpeech({
      input: text,
      voice: config.voice,
      instructions: config.instructions,
    });
    await fs.writeFile(filePath, audio);
    manifest.push({
      style,
      event,
      text,
      filename,
      url: `/sounds/announcer-static/${filename}`,
      bytes: audio.length,
      updatedAt: new Date().toISOString(),
    });
    console.log(`Saved ${filename}`);
  }
}

await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
