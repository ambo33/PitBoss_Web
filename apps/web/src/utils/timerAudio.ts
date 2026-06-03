let audioContext: AudioContext | null = null;
let unlockAttached = false;
let preferredVoice: SpeechSynthesisVoice | null = null;
let speechPrimed = false;
let currentCheckinAudio: HTMLAudioElement | null = null;
let currentEventAudio: HTMLAudioElement | null = null;
const activeOscillators = new Set<OscillatorNode>();
let audioUnlocked = false;

export const DEFAULT_FIVE_MINUTE_ANNOUNCEMENT = 'Five minutes remaining in this level.';
export const DEFAULT_ONE_MINUTE_ANNOUNCEMENT = 'One minute remaining in this level.';
export const DEFAULT_LEVEL_UP_ANNOUNCEMENT = 'Level {BlindLevel}. Small blind {SB}. Big blind {BB}.';

export interface AnnouncementTokens {
  BlindLevel: number;
  SB: number;
  BB: number;
  Ante?: number;
}

function notifyAudioUnlocked(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pb-audio-unlocked'));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }
  return audioContext;
}

function getPreferredVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (preferredVoice) return preferredVoice;

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const preferredPatterns = [
    /jenny/i,
    /aria/i,
    /zira/i,
    /samantha/i,
    /ava/i,
    /victoria/i,
    /allison/i,
    /google us english/i,
  ];

  preferredVoice =
    voices.find((voice) => preferredPatterns.some((pattern) => pattern.test(voice.name))) ??
    voices.find((voice) => /en[-_]?us|english/i.test(voice.lang) && voice.localService) ??
    voices.find((voice) => /english/i.test(voice.lang)) ??
    voices[0] ??
    null;

  return preferredVoice;
}

async function resumeAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      // ignore; browser may require a gesture first
    }
  }
}

async function playUnlockTone(ctx: AudioContext): Promise<void> {
  if (ctx.state !== 'running') return;
  const silentSource = ctx.createBufferSource();
  silentSource.buffer = ctx.createBuffer(1, 1, 22050);
  silentSource.connect(ctx.destination);
  silentSource.start(0);

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const now = ctx.currentTime;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(660, now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.035, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.16);
}

export function isTimerAudioUnlocked(): boolean {
  const ctx = audioContext;
  return audioUnlocked || Boolean(ctx && ctx.state === 'running');
}

export async function unlockTimerAudio(options: { announce?: boolean } = {}): Promise<boolean> {
  const ctx = getAudioContext();
  if (ctx) {
    await resumeAudio();
    await playUnlockTone(ctx);
  }

  getPreferredVoice();
  if (options.announce && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('Sound enabled.');
      utterance.voice = getPreferredVoice();
      utterance.rate = 1;
      utterance.pitch = 1.08;
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
      speechPrimed = true;
    } catch {
      // Web Audio tone above is the fallback.
    }
  } else {
    primeSpeech();
  }

  audioUnlocked = Boolean(ctx ? ctx.state === 'running' : typeof window !== 'undefined' && 'speechSynthesis' in window);
  if (audioUnlocked) notifyAudioUnlocked();
  return audioUnlocked;
}

export function primeTimerAudio(): void {
  if (typeof window === 'undefined' || unlockAttached) return;
  unlockAttached = true;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      preferredVoice = null;
      getPreferredVoice();
    };
    getPreferredVoice();
  }

  const unlock = () => {
    void unlockTimerAudio().then((unlocked) => {
      const ctx = getAudioContext();
      if (unlocked || !ctx || ctx.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
        unlockAttached = false;
      }
    });
    if (isTimerAudioUnlocked()) {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
      unlockAttached = false;
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });
}

function primeSpeech(): void {
  if (speechPrimed || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(' ');
    utterance.volume = 0;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.voice = getPreferredVoice();
    speechPrimed = true;
    window.speechSynthesis.speak(utterance);
    window.setTimeout(() => {
      window.speechSynthesis.cancel();
    }, 0);
  } catch {
    // Safari can be picky; if priming fails we still try later.
  }
}

async function playSequence(steps: Array<{ frequency: number; duration: number; delay?: number; gain?: number }>): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  await resumeAudio();
  if (ctx.state !== 'running') return;

  stopActiveEventAudio();
  const now = ctx.currentTime;

  for (const step of steps) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const startAt = now + (step.delay ?? 0);
    const gain = step.gain ?? 0.05;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(step.frequency, startAt);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(gain, startAt + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + step.duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    activeOscillators.add(oscillator);
    oscillator.onended = () => activeOscillators.delete(oscillator);
    oscillator.start(startAt);
    oscillator.stop(startAt + step.duration + 0.02);
  }
}

function stopActiveEventAudio(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  if (currentEventAudio) {
    try {
      currentEventAudio.pause();
      currentEventAudio.currentTime = 0;
    } catch {
      // ignore
    }
    currentEventAudio = null;
  }
  if (currentCheckinAudio) {
    try {
      currentCheckinAudio.pause();
      currentCheckinAudio.currentTime = 0;
    } catch {
      // ignore
    }
    currentCheckinAudio = null;
  }
  for (const oscillator of activeOscillators) {
    try {
      oscillator.stop();
    } catch {
      // already stopped
    }
  }
  activeOscillators.clear();
}

export function playFiveMinuteWarning(): void {
  void playSequence([
    { frequency: 880, duration: 0.14, gain: 0.04 },
    { frequency: 880, duration: 0.14, delay: 0.22, gain: 0.04 },
  ]);
}

export function playOneMinuteWarning(): void {
  void playSequence([
    { frequency: 988, duration: 0.16, gain: 0.06 },
    { frequency: 988, duration: 0.16, delay: 0.22, gain: 0.06 },
    { frequency: 1174, duration: 0.22, delay: 0.44, gain: 0.07 },
  ]);
}

export function playLevelChangeTone(): void {
  void playSequence([
    { frequency: 784, duration: 0.14, gain: 0.05 },
    { frequency: 988, duration: 0.16, delay: 0.18, gain: 0.05 },
    { frequency: 1318, duration: 0.24, delay: 0.38, gain: 0.06 },
  ]);
}

export function playAirhornHype(): void {
  void playSequence([
    { frequency: 220, duration: 0.34, gain: 0.08 },
    { frequency: 196, duration: 0.36, delay: 0.08, gain: 0.08 },
    { frequency: 247, duration: 0.42, delay: 0.48, gain: 0.09 },
    { frequency: 220, duration: 0.46, delay: 0.58, gain: 0.08 },
  ]);
}

function renderAnnouncementTemplate(template: string | null | undefined, tokens: AnnouncementTokens): string {
  const values: Record<string, string> = {
    BlindLevel: String(tokens.BlindLevel),
    SB: String(tokens.SB),
    BB: String(tokens.BB),
    Ante: String(tokens.Ante ?? 0),
  };
  return String(template ?? '')
    .replace(/\{(BlindLevel|SB|BB|Ante)\}/g, (_match, key: string) => values[key] ?? '')
    .trim();
}

function speak(message: string, fallback?: () => void): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    fallback?.();
    return;
  }
  try {
    stopActiveEventAudio();
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.voice = getPreferredVoice();
    utterance.rate = 1.03;
    utterance.pitch = 1.14;
    utterance.volume = 0.88;
    window.speechSynthesis.speak(utterance);
  } catch {
    fallback?.();
  }
}

export function announceFiveMinuteWarning(template?: string | null, tokens?: AnnouncementTokens): void {
  const message = tokens ? renderAnnouncementTemplate(template, tokens) : '';
  speak(message || DEFAULT_FIVE_MINUTE_ANNOUNCEMENT, playFiveMinuteWarning);
}

export function announceOneMinuteWarning(template?: string | null, tokens?: AnnouncementTokens): void {
  const message = tokens ? renderAnnouncementTemplate(template, tokens) : '';
  speak(message || DEFAULT_ONE_MINUTE_ANNOUNCEMENT, playOneMinuteWarning);
}

export function announceMessage(message: string): void {
  speak(message);
}

export function announceLevel(level: number, smallBlind: number, bigBlind: number, template?: string | null, ante = 0): void {
  const message = renderAnnouncementTemplate(template || DEFAULT_LEVEL_UP_ANNOUNCEMENT, {
    BlindLevel: level,
    SB: smallBlind,
    BB: bigBlind,
    Ante: ante,
  });
  speak(message || `Level ${level}. Small blind ${smallBlind}. Big blind ${bigBlind}.`, playLevelChangeTone);
}

export function announceTimerStarted(): void {
  speak('Timer started.', () => {
    void playSequence([
      { frequency: 660, duration: 0.1, gain: 0.045 },
      { frequency: 880, duration: 0.14, delay: 0.14, gain: 0.055 },
    ]);
  });
}

export function announceTimerPaused(): void {
  speak('Timer paused.', () => {
    void playSequence([
      { frequency: 523, duration: 0.14, gain: 0.055 },
      { frequency: 392, duration: 0.16, delay: 0.18, gain: 0.045 },
    ]);
  });
}

export function announceCheckinGreeting(playerName: string): void {
  const trimmedName = playerName.trim();
  speak(
    `Good luck, ${trimmedName}.`,
    () => {
      void playSequence([
        { frequency: 880, duration: 0.14, gain: 0.05 },
        { frequency: 1174, duration: 0.16, delay: 0.18, gain: 0.05 },
        { frequency: 1568, duration: 0.24, delay: 0.38, gain: 0.06 },
      ]);
    }
  );
}

export function playCheckinGreetingClip(audioDataUrl: string, fallbackName?: string): void {
  if (typeof window === 'undefined') return;
  try {
    stopActiveEventAudio();
    currentCheckinAudio = new Audio(audioDataUrl);
    currentCheckinAudio.currentTime = 0;
    void currentCheckinAudio.play().catch(() => {
      currentCheckinAudio = null;
      if (fallbackName) announceCheckinGreeting(fallbackName);
      else playLevelChangeTone();
    });
  } catch {
    currentCheckinAudio = null;
    if (fallbackName) announceCheckinGreeting(fallbackName);
    else playLevelChangeTone();
  }
}

export function playGeneratedSpeech(audioBase64: string, mimeType = 'audio/mpeg', fallback?: () => void): void {
  if (typeof window === 'undefined') return;
  try {
    stopActiveEventAudio();
    const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
    currentEventAudio = audio;
    audio.volume = 0.95;
    audio.onended = () => {
      if (currentEventAudio === audio) currentEventAudio = null;
    };
    void audio.play().catch(() => fallback?.());
  } catch {
    fallback?.();
  }
}

export function playStoredSpeech(src: string, fallback?: () => void): void {
  if (typeof window === 'undefined') return;
  try {
    stopActiveEventAudio();
    const audio = new Audio(src);
    currentEventAudio = audio;
    audio.volume = 0.95;
    audio.onended = () => {
      if (currentEventAudio === audio) currentEventAudio = null;
    };
    void audio.play().catch(() => fallback?.());
  } catch {
    fallback?.();
  }
}

export function playKachingSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const audio = new Audio('/sounds/ka-ching.mp3');
    audio.volume = 0.95;
    void audio.play().catch(() => {
      void playSequence([
        { frequency: 988, duration: 0.08, gain: 0.06 },
        { frequency: 1318, duration: 0.1, delay: 0.1, gain: 0.07 },
        { frequency: 1760, duration: 0.14, delay: 0.22, gain: 0.06 },
      ]);
    });
  } catch {
    void playSequence([
      { frequency: 988, duration: 0.08, gain: 0.06 },
      { frequency: 1318, duration: 0.1, delay: 0.1, gain: 0.07 },
      { frequency: 1760, duration: 0.14, delay: 0.22, gain: 0.06 },
    ]);
  }
}
