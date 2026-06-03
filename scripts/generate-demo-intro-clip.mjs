import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.resolve(repoRoot, '..', '..', '.env') });

const outputDir = path.join(repoRoot, 'apps', 'web', 'public', 'sounds', 'announcer-static');
const outputPath = path.join(outputDir, 'demo-tournament-start.mp3');

const input = 'Welcome to The Poker Planner demo tournament! We are picking it up here with 12 minutes, 12 seconds left in the 8th level of our tournament. Six players remain with $1,170 still up for grabs.';
const instructions = [
  'Male energetic Las Vegas poker announcer with rapid pacing, confident rhythm, punchy delivery, premium product demo energy, and natural excitement.',
  'Avoid robotic pauses, slow corporate pacing, profanity, copyrighted catchphrases, and real organization affiliation claims.',
].join(' ');

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not configured in .env.');
}

await fs.mkdir(outputDir, { recursive: true });

const response = await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
    voice: 'echo',
    input,
    instructions,
    response_format: 'mp3',
  }),
});

if (!response.ok) {
  throw new Error(await response.text());
}

const buffer = Buffer.from(await response.arrayBuffer());
await fs.writeFile(outputPath, buffer);
console.log(`Saved ${path.relative(repoRoot, outputPath)} (${buffer.length} bytes)`);
