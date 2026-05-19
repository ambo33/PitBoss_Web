import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'apps', 'web', 'public', 'sounds', 'ai-demo');

const clips = [
  {
    filename: 'football-style.mp3',
    label: 'Football Style',
    voice: 'echo',
    text: "Welcome to Johnny's Saturday Night Game!",
    instructions:
      'High-energy American football broadcast announcer style, stadium excitement, punchy and celebratory. Do not mention any real league, team, network, or copyrighted catchphrase.',
  },
  {
    filename: 'british-dealer.mp3',
    label: 'British Dealer',
    voice: 'shimmer',
    text: 'The blinds will start at 25/50 and our next break will be in 90 minutes. Good luck players!',
    instructions:
      'Professional British woman poker dealer style. Calm, crisp, elegant, confident, and natural. Clear casino-floor diction without sounding robotic.',
  },
];

function getApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured. Add it to .env, then run npm.cmd run generate:ai-demo-clips.');
  }
  return key;
}

async function generateClip(clip) {
  const model = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice: clip.voice,
      input: clip.text,
      instructions: clip.instructions,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI speech request failed for ${clip.label}: ${response.status} ${body}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const outputPath = path.join(outputDir, clip.filename);
  await writeFile(outputPath, buffer);
  return { ...clip, path: outputPath, bytes: buffer.length };
}

await mkdir(outputDir, { recursive: true });

const generated = [];
for (const clip of clips) {
  generated.push(await generateClip(clip));
}

const manifest = generated.map(({ label, filename, text, voice, bytes }) => ({
  label,
  filename,
  text,
  voice,
  bytes,
  generatedAt: new Date().toISOString(),
}));

await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

for (const clip of generated) {
  console.log(`Generated ${clip.label}: ${path.relative(repoRoot, clip.path)} (${clip.bytes} bytes)`);
}
