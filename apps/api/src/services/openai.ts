import { Buffer } from 'buffer';

export type AnnouncerPreset = 'professional' | 'wwe' | 'minimal' | 'football' | 'roaster' | 'wsop';

interface AnnouncerContext {
  preset: AnnouncerPreset;
  customPrompt?: string | null;
  tournamentName: string;
  groupName?: string | null;
  eventType: 'level_up' | 'five_minute_warning' | 'one_minute_warning';
  currentLevel: number;
  previousLevel?: number | null;
  smallBlind?: number;
  bigBlind?: number;
  ante?: number;
  remainingPlayers: number;
  checkedInPlayers: number;
  knockedOutDuringPriorLevel: number;
  totalRebuys: number;
  totalAddons: number;
  addOnPercent: number;
}

interface HandAnalysisContext {
  preset?: AnnouncerPreset | null;
  tournamentName: string;
  blindLevel?: number | null;
  smallBlind?: number | null;
  bigBlind?: number | null;
  ante?: number | null;
  handText: string;
}

const presetInstructions: Record<AnnouncerPreset, string> = {
  professional: 'Crisp, polished tournament host. Energetic but never silly.',
  wwe: 'Big arena energy, dramatic hype, punchy phrasing. Do not mention copyrighted wrestler names or catchphrases.',
  minimal: 'Minimal, calm, short. One sentence whenever possible.',
  football: 'American football broadcast cadence with scoreboard-style clarity. No team names or copyrighted catchphrases.',
  roaster: 'Playful roast-comedy tone, light jabs only. Never insult protected traits, identity, appearance, or anything cruel.',
  wsop: 'Serious poker tournament director voice. Authoritative, clear, and casino-floor professional. Do not imply official WSOP affiliation.',
};

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  return key;
}

function sanitizePreset(value: string | null | undefined): AnnouncerPreset {
  if (value === 'wwe' || value === 'minimal' || value === 'football' || value === 'roaster' || value === 'wsop') return value;
  return 'professional';
}

async function createText(prompt: string): Promise<string> {
  const model = process.env.OPENAI_TEXT_MODEL ?? 'gpt-4.1-mini';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 220,
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text().catch(() => 'OpenAI text request failed.'));
  }
  const data = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const text = data.output_text
    ?? data.output?.flatMap((item) => item.content ?? []).map((content) => content.text ?? '').join('').trim()
    ?? '';
  return text.trim();
}

async function createSpeech(input: string, preset: AnnouncerPreset): Promise<{ audioBase64: string; mimeType: string }> {
  const model = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
  const voice = process.env.OPENAI_TTS_VOICE ?? 'coral';
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice,
      input,
      instructions: `Voice direction: ${presetInstructions[preset]} Make it sound like an AI-generated tournament announcer.`,
      response_format: 'mp3',
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text().catch(() => 'OpenAI speech request failed.'));
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    audioBase64: Buffer.from(arrayBuffer).toString('base64'),
    mimeType: 'audio/mpeg',
  };
}

export function normalizeAnnouncerPreset(value: string | null | undefined): AnnouncerPreset {
  return sanitizePreset(value);
}

export async function generateAnnouncerMoment(context: AnnouncerContext): Promise<{ text: string; audioBase64?: string; mimeType?: string; aiEnabled: boolean }> {
  const preset = sanitizePreset(context.preset);
  const prompt = [
    'Write one short poker tournament announcer line.',
    `Style preset: ${presetInstructions[preset]}`,
    context.customPrompt ? `Group custom direction: ${context.customPrompt}` : '',
    'Rules: keep it under 38 words, no profanity, no illegal gambling encouragement, no copyrighted catchphrases, and do not claim affiliation with WWE, NFL, WSOP, or any real organization.',
    `Tournament: ${context.tournamentName}`,
    context.groupName ? `Group: ${context.groupName}` : '',
    `Event: ${context.eventType}`,
    `Current level: ${context.currentLevel}`,
    context.previousLevel ? `Previous level: ${context.previousLevel}` : '',
    `Blinds: ${context.smallBlind ?? 0}/${context.bigBlind ?? 0}, ante ${context.ante ?? 0}`,
    `Remaining players: ${context.remainingPlayers} of ${context.checkedInPlayers}`,
    `Players knocked out during prior level: ${context.knockedOutDuringPriorLevel}`,
    `Total rebuys so far: ${context.totalRebuys}`,
    `Add-ons so far: ${context.totalAddons} (${context.addOnPercent}% of checked-in field)`,
  ].filter(Boolean).join('\n');

  const fallback = `Level ${context.currentLevel}. Blinds are ${context.smallBlind ?? 0} and ${context.bigBlind ?? 0}.`;
  const text = process.env.OPENAI_API_KEY ? await createText(prompt) : fallback;
  if (!process.env.OPENAI_API_KEY) {
    return { text, aiEnabled: false };
  }
  const speech = await createSpeech(text, preset);
  return { text, ...speech, aiEnabled: true };
}

export async function analyzePokerHand(context: HandAnalysisContext): Promise<{ analysis: string; aiEnabled: boolean }> {
  const preset = sanitizePreset(context.preset);
  const prompt = [
    'You are a poker hand coach. Analyze the described prior hand for a home poker tournament player.',
    'Give practical coaching, not gambling encouragement. Mention missing information when relevant.',
    'Keep the answer concise: best move, why, and one takeaway.',
    `Tone: ${presetInstructions[preset]}`,
    `Tournament: ${context.tournamentName}`,
    context.blindLevel ? `Level: ${context.blindLevel}` : '',
    context.smallBlind && context.bigBlind ? `Blinds: ${context.smallBlind}/${context.bigBlind}, ante ${context.ante ?? 0}` : '',
    `Hand description: ${context.handText}`,
  ].filter(Boolean).join('\n');

  if (!process.env.OPENAI_API_KEY) {
    return {
      aiEnabled: false,
      analysis: 'AI is not configured yet. Add OPENAI_API_KEY, then describe the hand with positions, stack sizes, cards, action, and pot size for coaching.',
    };
  }
  return { aiEnabled: true, analysis: await createText(prompt) };
}
