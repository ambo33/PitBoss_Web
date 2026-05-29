import { Buffer } from 'buffer';

export type AnnouncerPreset =
  | 'all_in_alex'
  | 'royal_rumble_riley'
  | 'velvet_dealer'
  | 'chipstorm'
  | 'queen_of_spades'
  | 'the_pit_boss'
  | 'british_high_roller'
  | 'turbo_tony'
  | 'midnight_mayhem'
  | 'sunny_stacks';

interface AnnouncerContext {
  preset: AnnouncerPreset;
  customPrompt?: string | null;
  classicMode?: boolean | null;
  tournamentName: string;
  groupName?: string | null;
  eventType: 'tournament_start' | 'timer_paused' | 'timer_resumed' | 'level_up' | 'five_minute_warning' | 'one_minute_warning' | 'knockout' | 'rebuy' | 'addon' | 'checkin';
  currentLevel: number;
  previousLevel?: number | null;
  smallBlind?: number;
  bigBlind?: number;
  ante?: number;
  knockedOutPlayerName?: string | null;
  knockedOutByName?: string | null;
  placement?: number | null;
  prizeAmount?: number | null;
  bountyAmount?: number | null;
  bountyClaimedByName?: string | null;
  playerName?: string | null;
  isBreak?: boolean;
  breakLabel?: string | null;
  breakMinutes?: number | null;
  rebuyCutoffWarning?: 'five_minute_warning' | 'one_minute_warning' | null;
  rebuyClosed?: boolean;
  remainingPlayers: number;
  checkedInPlayers: number;
  knockedOutDuringPriorLevel: number;
  totalRebuys: number;
  totalAddons: number;
  addOnPercent: number;
  prizePool?: number | null;
  playerCount?: number | null;
  rebuyEnabled?: boolean | null;
  rebuyAmount?: number | null;
  addonEnabled?: boolean | null;
  addonAmount?: number | null;
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
  all_in_alex: 'Male voice. Energetic Las Vegas tournament announcer with rapid pacing, confident rhythm, punchy delivery, and slightly gritty texture.',
  royal_rumble_riley: 'Male sports arena announcer with powerful projection, fast cadence, explosive delivery, and theatrical but natural hype. Do not mention real leagues, teams, fighters, or copyrighted catchphrases.',
  velvet_dealer: 'Female smooth casino-host energy. Fast but elegant cadence, confident and playful Vegas lounge tone, polished and natural.',
  chipstorm: 'Male esports-style caster with very high energy, accelerated pacing, sharp articulation, constant momentum, and expressive live-commentary hype.',
  queen_of_spades: 'Female tournament announcer with fast cadence, confident authority, modern sports-broadcast energy, and polished emphasis on tournament details.',
  the_pit_boss: 'Deep male voice with rough casino-floor authority, rapid delivery, experienced command, and fun intimidation.',
  british_high_roller: 'British female voice with refined luxury-casino energy, quicker-than-normal pacing, crisp emphasis, and elegant but lively delivery.',
  turbo_tony: 'Fast-talking New York poker room announcer with strong personality, nonstop momentum, streetwise playfulness, and rapid pacing.',
  midnight_mayhem: 'Male cinematic narrator with deep dramatic intensity, suspenseful tension, immersive tone, and forward-moving pacing.',
  sunny_stacks: 'Female upbeat friendly poker-host energy with quick conversational cadence, warmth, enthusiasm, and welcoming casino-event charm.',
};

const presetVoices: Record<AnnouncerPreset, string> = {
  all_in_alex: 'echo',
  royal_rumble_riley: 'onyx',
  velvet_dealer: 'shimmer',
  chipstorm: 'ash',
  queen_of_spades: 'nova',
  the_pit_boss: 'onyx',
  british_high_roller: 'fable',
  turbo_tony: 'echo',
  midnight_mayhem: 'onyx',
  sunny_stacks: 'coral',
};

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  return key;
}

function sanitizePreset(value: string | null | undefined): AnnouncerPreset {
  if (
    value === 'all_in_alex'
    || value === 'royal_rumble_riley'
    || value === 'velvet_dealer'
    || value === 'chipstorm'
    || value === 'queen_of_spades'
    || value === 'the_pit_boss'
    || value === 'british_high_roller'
    || value === 'turbo_tony'
    || value === 'midnight_mayhem'
    || value === 'sunny_stacks'
  ) return value;
  if (value === 'football' || value === 'wwe') return 'royal_rumble_riley';
  if (value === 'minimal') return 'sunny_stacks';
  if (value === 'roaster') return 'turbo_tony';
  if (value === 'wsop' || value === 'professional') return 'the_pit_boss';
  return 'all_in_alex';
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

async function createSpeech(
  input: string,
  preset: AnnouncerPreset,
  options: { voice?: string; instructions?: string } = {}
): Promise<{ audioBase64: string; mimeType: string }> {
  const model = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
  const voice = options.voice ?? presetVoices[preset] ?? process.env.OPENAI_TTS_VOICE ?? 'coral';
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
      instructions: options.instructions ?? `Voice direction: ${presetInstructions[preset]} Make it sound like an AI-generated tournament announcer.`,
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

export async function generateVoicePreview(
  style: 'football' | 'british_dealer'
): Promise<{ text: string; audioBase64?: string; mimeType?: string; aiEnabled: boolean }> {
  if (!process.env.OPENAI_API_KEY) {
    return { text: 'AI voice preview is not configured on this server.', aiEnabled: false };
  }
  const config = style === 'british_dealer'
    ? {
        preset: 'british_high_roller' as AnnouncerPreset,
        voice: 'shimmer',
        text: 'The blinds will start at 25/50 and our next break will be in 90 minutes. Good luck players!',
        instructions: 'Professional British woman poker dealer style. Calm, crisp, elegant, confident, and natural. Clear casino-floor diction without sounding robotic.',
      }
    : {
        preset: 'royal_rumble_riley' as AnnouncerPreset,
        voice: 'echo',
        text: "Welcome to Johnny's Saturday Night Game!",
        instructions: 'High-energy American football broadcast announcer style, stadium excitement, punchy and celebratory. Do not mention any real league, team, network, or copyrighted catchphrase.',
      };
  const speech = await createSpeech(config.text, config.preset, {
    voice: config.voice,
    instructions: config.instructions,
  });
  return { text: config.text, ...speech, aiEnabled: true };
}

export async function generateVoiceLabScript(styleName: string, styleDirection: string, brief: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  const prompt = [
    'Write one short ThePokerPlanner landing page voice demo script.',
    `Style: ${styleName}`,
    `Voice direction: ${styleDirection}`,
    `Creative brief: ${brief}`,
    'Keep the announcement under 15 seconds when spoken aloud.',
    'Rules: 8 to 24 words. No profanity. No illegal gambling encouragement. No copyrighted catchphrases, league names, team names, wrestler names, casino brand names, or official affiliation claims.',
    'Return only the script text.',
  ].join('\n');
  return createText(prompt);
}

export async function generateVoiceLabClip(config: {
  text: string;
  voice: string;
  instructions: string;
}): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  const speech = await createSpeech(config.text, 'all_in_alex', {
    voice: config.voice,
    instructions: config.instructions,
  });
  return {
    audioBuffer: Buffer.from(speech.audioBase64, 'base64'),
    mimeType: speech.mimeType,
  };
}

export function normalizeAnnouncerPreset(value: string | null | undefined): AnnouncerPreset {
  return sanitizePreset(value);
}

export async function generateAnnouncerMoment(context: AnnouncerContext): Promise<{ text: string; audioBase64?: string; mimeType?: string; aiEnabled: boolean; preset?: AnnouncerPreset; voice?: string }> {
  const preset = sanitizePreset(context.preset);
  const isTournamentStart = context.eventType === 'tournament_start';
  const isTimerStatus = context.eventType === 'timer_paused' || context.eventType === 'timer_resumed';
  const isKnockout = context.eventType === 'knockout';
  const isCheckin = context.eventType === 'checkin';
  if (context.classicMode) {
    const text = buildClassicAnnouncerScript(context);
    if (!process.env.OPENAI_API_KEY) {
      return { text: 'AI announcer is not configured on this server.', aiEnabled: false, preset, voice: presetVoices[preset] };
    }
    const speech = await createSpeech(text, preset);
    return { text, ...speech, aiEnabled: true, preset, voice: presetVoices[preset] };
  }
  const prompt = isTournamentStart
    ? [
        'Write one opening announcement for the start of a poker tournament.',
        `Style preset: ${presetInstructions[preset]}`,
        context.customPrompt ? `Group custom direction: ${context.customPrompt}` : '',
        'Rules: 45 to 75 words. Welcome the players, state the field size, current prize pool, whether re-buys and add-ons are available, first blinds, and wish everyone good luck. This only plays at tournament start, so make it complete but not bloated. No profanity, illegal gambling encouragement, copyrighted catchphrases, or real organization affiliation claims. Never describe blinds as "over" or "slash"; say "small blind is X, big blind is Y."',
        `Tournament: ${context.tournamentName}`,
        context.groupName ? `Group: ${context.groupName}` : '',
        `Players in field: ${getAnnouncedPlayerCount(context)}`,
        `Current prize pool: ${formatMoneyForSpeech(context.prizePool)}`,
        formatAvailabilityFact('Re-buys', context.rebuyEnabled, context.rebuyAmount),
        formatAvailabilityFact('Add-ons', context.addonEnabled, context.addonAmount),
        `First level: ${context.currentLevel}`,
        `Small blind: ${context.smallBlind ?? 0}`,
        `Big blind: ${context.bigBlind ?? 0}`,
        `Ante: ${context.ante ?? 0}`,
      ].filter(Boolean).join('\n')
    : isTimerStatus
    ? [
        'Write one very short poker tournament clock status announcement.',
        `Style preset: ${presetInstructions[preset]}`,
        context.customPrompt ? `Group custom direction: ${context.customPrompt}` : '',
        'Rules: 3 to 8 words. Say only that the tournament clock is paused or resumed. No tournament name, blinds, prize pool, field count, hype, jokes, profanity, or copyrighted catchphrases.',
        `Event: ${context.eventType}`,
      ].filter(Boolean).join('\n')
    : isKnockout
    ? [
        'Write one very short poker knockout announcement.',
        `Style preset: ${presetInstructions[preset]}`,
        context.customPrompt ? `Group custom direction: ${context.customPrompt}` : '',
        'Rules: keep it under 24 words. Use only the provided knockout facts. Do not say the tournament name, group name, level, blinds, ante, remaining players, rebuys, or add-ons. No extra hype, jokes, filler, profanity, illegal gambling encouragement, copyrighted catchphrases, or affiliation claims.',
        context.knockedOutPlayerName ? `Knocked out player: ${context.knockedOutPlayerName}` : '',
        context.knockedOutByName ? `Knocked out by: ${context.knockedOutByName}` : '',
        context.placement ? `Placement: ${context.placement}` : '',
        context.prizeAmount ? `Prize won: $${context.prizeAmount}` : '',
        context.bountyAmount ? `Bounty claimed: $${context.bountyAmount}` : '',
        context.bountyClaimedByName ? `Bounty claimed by: ${context.bountyClaimedByName}` : '',
      ].filter(Boolean).join('\n')
    : isCheckin
      ? [
          'Write one very short poker player check-in greeting.',
          `Style preset: ${presetInstructions[preset]}`,
          context.customPrompt ? `Group custom direction: ${context.customPrompt}` : '',
          'Rules: keep it under 14 words. Welcome the player by name and wish them luck. Do not mention blinds, levels, tournament context, illegal gambling, copyrighted catchphrases, or real organizations.',
          context.playerName ? `Player: ${context.playerName}` : 'Player: Player',
        ].filter(Boolean).join('\n')
    : [
        'Write one short poker tournament announcer line.',
        `Style preset: ${presetInstructions[preset]}`,
        context.customPrompt ? `Group custom direction: ${context.customPrompt}` : '',
        'Rules: keep it under 38 words, no profanity, no illegal gambling encouragement, no copyrighted catchphrases, and do not claim affiliation with WWE, NFL, WSOP, or any real organization. Never describe blinds as "over" or "slash"; say "small blind is X, big blind is Y."',
        context.eventType === 'five_minute_warning' || context.eventType === 'one_minute_warning' ? 'This is a clock warning. Keep it direct and do not mention tournament name, prize pool, field movement, rebuys, add-ons, or player counts unless this is a rebuy cutoff warning.' : '',
        context.rebuyCutoffWarning ? 'This is a rebuy cutoff warning. Keep it direct and mention the rebuy deadline only.' : '',
        context.isBreak ? 'This level is a break. Announce the break note and duration. Do not mention blinds.' : '',
        context.rebuyClosed ? 'Rebuys just closed. Say that re-buys are officially closed.' : '',
        `Tournament: ${context.tournamentName}`,
        context.groupName ? `Group: ${context.groupName}` : '',
        `Event: ${context.eventType}`,
        `Current level: ${context.currentLevel}`,
        context.previousLevel ? `Previous level: ${context.previousLevel}` : '',
        context.breakLabel ? `Break note: ${context.breakLabel}` : '',
        context.breakMinutes ? `Break minutes: ${context.breakMinutes}` : '',
        `Small blind: ${context.smallBlind ?? 0}`,
        `Big blind: ${context.bigBlind ?? 0}`,
        `Ante: ${context.ante ?? 0}`,
        (context.eventType === 'rebuy' || context.eventType === 'addon' || context.eventType === 'checkin') && context.playerName ? `Player: ${context.playerName}` : '',
        `Remaining players: ${context.remainingPlayers} of ${context.checkedInPlayers}`,
        `Players knocked out during prior level: ${context.knockedOutDuringPriorLevel}`,
        `Total rebuys so far: ${context.totalRebuys}`,
        `Add-ons so far: ${context.totalAddons} (${context.addOnPercent}% of checked-in field)`,
      ].filter(Boolean).join('\n');

  if (!process.env.OPENAI_API_KEY) {
    return { text: 'AI announcer is not configured on this server.', aiEnabled: false };
  }
  let text: string;
  try {
    text = await createText(prompt);
  } catch {
    text = buildFallbackAnnouncerScript(context);
  }
  const speech = await createSpeech(text, preset);
  return { text, ...speech, aiEnabled: true, preset, voice: presetVoices[preset] };
}

function buildClassicAnnouncerScript(context: AnnouncerContext): string {
  const smallBlind = Number(context.smallBlind ?? 0).toLocaleString();
  const bigBlind = Number(context.bigBlind ?? 0).toLocaleString();
  if (context.eventType === 'tournament_start') return buildTournamentStartScript(context);
  if (context.eventType === 'timer_paused') return 'Tournament clock paused.';
  if (context.eventType === 'timer_resumed') return 'Tournament clock resumed.';
  if (context.rebuyCutoffWarning === 'five_minute_warning') return 'Five minutes left in the final level for re-buys.';
  if (context.rebuyCutoffWarning === 'one_minute_warning') return 'One minute left to get your re-buys in.';
  if (context.isBreak) return `${context.breakLabel || 'Break'}. ${Number(context.breakMinutes ?? 0)} minute break.`;
  if (context.eventType === 'level_up') {
    return `Level ${context.currentLevel}. Small blind is ${smallBlind}, big blind is ${bigBlind}.${context.rebuyClosed ? ' Re-buys officially closed.' : ''}`;
  }
  if (context.eventType === 'five_minute_warning') return 'Five minutes remaining in this level.';
  if (context.eventType === 'one_minute_warning') return 'One minute remaining in this level.';
  if (context.eventType === 'checkin') return `Welcome, ${context.playerName || 'player'}. Good luck.`;
  if (context.eventType === 'rebuy') return `${context.playerName || 'Player'} has taken a rebuy.`;
  if (context.eventType === 'addon') return `${context.playerName || 'Player'} has taken an add-on.`;
  return buildFallbackAnnouncerScript(context);
}

function buildFallbackAnnouncerScript(context: AnnouncerContext): string {
  const smallBlind = Number(context.smallBlind ?? 0).toLocaleString();
  const bigBlind = Number(context.bigBlind ?? 0).toLocaleString();
  const blinds = `small blind is ${smallBlind}, big blind is ${bigBlind}`;
  if (context.eventType === 'tournament_start') return buildTournamentStartScript(context);
  if (context.eventType === 'timer_paused') return 'Tournament clock paused.';
  if (context.eventType === 'timer_resumed') return 'Tournament clock resumed.';
  if (context.rebuyCutoffWarning === 'five_minute_warning') return 'Five minutes left in the final level for re-buys.';
  if (context.rebuyCutoffWarning === 'one_minute_warning') return 'One minute left to get your re-buys in.';
  if (context.isBreak) return `${context.breakLabel || 'Break'}. ${Number(context.breakMinutes ?? 0)} minute break.`;
  if (context.eventType === 'knockout') {
    const player = context.knockedOutPlayerName || 'A player';
    const placement = context.placement ? ` in ${ordinal(context.placement)} place` : '';
    const by = context.knockedOutByName ? `, knocked out by ${context.knockedOutByName}` : '';
    const prize = Number(context.prizeAmount ?? 0) > 0 ? ` They win $${Number(context.prizeAmount).toFixed(0)}.` : '';
    const bounty = Number(context.bountyAmount ?? 0) > 0
      ? ` ${context.bountyClaimedByName || context.knockedOutByName || 'Someone'} claims a $${Number(context.bountyAmount).toFixed(0)} bounty.`
      : '';
    return `${player} has been eliminated${placement}${by}.${prize}${bounty}`;
  }
  if (context.eventType === 'five_minute_warning') {
    return `Five minutes remain in level ${context.currentLevel}.`;
  }
  if (context.eventType === 'one_minute_warning') {
    return `One minute left in level ${context.currentLevel}. Finish the hand and get ready.`;
  }
  if (context.eventType === 'checkin') return `Welcome, ${context.playerName || 'player'}. Good luck.`;
  const priorLosses = Number(context.knockedOutDuringPriorLevel ?? 0);
  const action = priorLosses > 0
    ? `Last level claimed ${priorLosses} player${priorLosses === 1 ? '' : 's'}`
    : 'The field is still battling';
  return `Level ${context.currentLevel} is live. ${blinds}. ${context.rebuyClosed ? 'Re-buys are officially closed. ' : ''}${action}, with ${context.remainingPlayers} players remaining.`;
}

function buildTournamentStartScript(context: AnnouncerContext): string {
  const smallBlind = Number(context.smallBlind ?? 0).toLocaleString();
  const bigBlind = Number(context.bigBlind ?? 0).toLocaleString();
  const fieldCount = getAnnouncedPlayerCount(context);
  const prizePool = formatMoneyForSpeech(context.prizePool);
  const rebuy = formatAvailabilitySentence('Re-buys', context.rebuyEnabled, context.rebuyAmount);
  const addon = formatAvailabilitySentence('Add-ons', context.addonEnabled, context.addonAmount);
  return `Welcome to ${context.tournamentName}. We have ${fieldCount} player${fieldCount === 1 ? '' : 's'} in the field and a current prize pool of ${prizePool}. ${rebuy} ${addon} Level one starts now: small blind is ${smallBlind}, big blind is ${bigBlind}. Good luck, players.`;
}

function formatAvailabilityFact(label: string, enabled: boolean | null | undefined, amount: number | null | undefined): string {
  if (!enabled) return `${label}: not available`;
  const numericAmount = Number(amount ?? 0);
  return `${label}: available${numericAmount > 0 ? ` for ${formatMoneyForSpeech(numericAmount)}` : ''}`;
}

function formatAvailabilitySentence(label: string, enabled: boolean | null | undefined, amount: number | null | undefined): string {
  if (!enabled) return `${label} are not available.`;
  const numericAmount = Number(amount ?? 0);
  return `${label} are available${numericAmount > 0 ? ` for ${formatMoneyForSpeech(numericAmount)}` : ''}.`;
}

function formatMoneyForSpeech(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '$0';
  return `$${numericValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function getAnnouncedPlayerCount(context: AnnouncerContext): number {
  const explicitCount = Number(context.playerCount ?? 0);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return explicitCount;
  return Number(context.checkedInPlayers || context.remainingPlayers || 0);
}

function ordinal(value: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const mod100 = value % 100;
  return `${value}${suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0]}`;
}

export async function analyzePokerHand(context: HandAnalysisContext): Promise<{ analysis: string; aiEnabled: boolean }> {
  const preset = sanitizePreset(context.preset);
  const prompt = [
    'You are a professional tournament poker coaching analyst. Review the described prior hand like a serious training product, not casual table chat.',
    'Focus on decision quality, ranges, pot odds, stack depth, ICM or payout pressure when relevant, and practical tournament adjustments.',
    'Do not encourage gambling. Do not use slang-heavy hype. Be crisp, objective, and coach-like.',
    'If one or two details would materially change the advice, ask those questions in the Questions section. If the hand is clear enough, say "None" there.',
    'Return plain text with exactly these section labels: Verdict, Key Factors, Recommended Line, Questions, Coaching Takeaway.',
    'Keep the total answer under 220 words.',
    `Voice style context for phrasing only: ${presetInstructions[preset]}`,
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
