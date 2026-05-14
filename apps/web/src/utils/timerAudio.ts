let audioContext: AudioContext | null = null;
let unlockAttached = false;
let preferredVoice: SpeechSynthesisVoice | null = null;
let speechPrimed = false;
let currentCheckinAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

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
    oscillator.start(startAt);
    oscillator.stop(startAt + step.duration + 0.02);
  }
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

function speak(message: string, fallback?: () => void): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    fallback?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
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

export function announceFiveMinuteWarning(): void {
  speak('There are 5 minutes remaining in the current blind.', playFiveMinuteWarning);
}

export function announceOneMinuteWarning(): void {
  speak('One minute remaining in the current blind.', playOneMinuteWarning);
}

export function announceLevel(level: number, smallBlind: number, bigBlind: number): void {
  speak(`Level ${level}. Small blind ${smallBlind}. Big blind ${bigBlind}.`, playLevelChangeTone);
}

export function announceCheckinGreeting(playerName: string): void {
  const trimmedName = playerName.trim();
  speak(
    `${trimmedName} has checked in to the tournament.`,
    () => {
      void playSequence([
        { frequency: 880, duration: 0.14, gain: 0.05 },
        { frequency: 1174, duration: 0.16, delay: 0.18, gain: 0.05 },
        { frequency: 1568, duration: 0.24, delay: 0.38, gain: 0.06 },
      ]);
    }
  );
}

export function playCheckinGreetingClip(audioDataUrl: string): void {
  if (typeof window === 'undefined') return;
  try {
    currentCheckinAudio?.pause();
    currentCheckinAudio = new Audio(audioDataUrl);
    currentCheckinAudio.currentTime = 0;
    void currentCheckinAudio.play().catch(() => {
      currentCheckinAudio = null;
      playLevelChangeTone();
    });
  } catch {
    currentCheckinAudio = null;
    playLevelChangeTone();
  }
}
