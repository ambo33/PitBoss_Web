import { Link } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Menu, Mic2, Play, QrCode, Sparkles, Trophy, Users, UserCircle, Volume2 } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';

const features = [
  {
    title: 'Tournament clock',
    body: 'Run levels, breaks, blind changes, warnings, and TV-friendly timer views from one clean control surface.',
    icon: Clock3,
    stat: '25/50',
  },
  {
    title: 'Player flow',
    body: 'Players can register, check in, see seats, use the lobby, and report knockouts without crowding the host.',
    icon: Users,
    stat: '18 in',
  },
  {
    title: 'Room display',
    body: 'Put the timer, QR codes, payouts, field stats, and table assignments on a big screen for the whole room.',
    icon: QrCode,
    stat: 'TV',
  },
  {
    title: 'Voice director',
    body: 'Set a group voice style and let level changes announce the action with game-aware context and personality.',
    icon: Mic2,
    stat: 'Voice',
  },
];

const steps = [
  'Create a group and schedule the game.',
  'Build blinds, payouts, seating, and player rules.',
  'Run the clock, display the board, and let the room follow along.',
];

const playerTrackingHighlights = [
  {
    title: 'Entries and finishes stay organized',
    body: 'Track who entered, checked in, rebought, added on, busted, and placed without turning the host into a spreadsheet clerk.',
    stat: '13 players',
  },
  {
    title: 'Placement medals build history',
    body: 'Registered players can carry first, second, and third-place counts with them, so regulars earn a little visible status over time.',
    stat: '1st x2',
  },
  {
    title: 'Challenge coins make it social',
    body: 'Groups can award fun coins for table stories, running jokes, streaks, bounties, and custom achievements that make each room feel like its own club.',
    stat: 'Coins',
  },
];

type VoiceClip = {
  style: string;
  label: string;
  src?: string;
  text: string;
  sampleText?: string;
};

const cannedVoiceStyles: VoiceClip[] = [
  {
    style: 'velvet_dealer',
    label: 'Velvet Dealer',
    text: 'Cool female casino host for upscale intros and player welcomes.',
  },
  {
    style: 'all_in_alex',
    label: 'All-In Alex',
    text: 'Fast Vegas poker announcer for intros, level increases, and final table moments.',
  },
  {
    style: 'royal_rumble_riley',
    label: 'Royal Rumble Riley',
    text: 'Sports arena energy for knockouts, champion reveals, and shuffle-up moments.',
  },
  {
    style: 'chipstorm',
    label: 'Chipstorm',
    text: 'Hyper esports caster for turbo tournaments and fast blind warnings.',
  },
  {
    style: 'queen_of_spades',
    label: 'Queen of Spades',
    text: 'Fast confident female announcer for premium modern poker rooms.',
  },
  {
    style: 'the_pit_boss',
    label: 'The Pit Boss',
    text: 'Gruff casino-floor authority for level-ups, warnings, and rebuy deadlines.',
  },
  {
    style: 'british_high_roller',
    label: 'British High Roller',
    text: 'Fast luxury British host for premium high roller themes.',
  },
  {
    style: 'turbo_tony',
    label: 'Turbo Tony',
    text: 'Fast-talking New York poker room chaos for rowdy home games.',
  },
  {
    style: 'midnight_mayhem',
    label: 'Midnight Mayhem',
    text: 'Dark cinematic narrator for bounty events and final tables.',
  },
  {
    style: 'sunny_stacks',
    label: 'Sunny Stacks',
    text: 'Friendly upbeat host for casual clubs and beginner nights.',
  },
];

type VoiceManifestEntry = {
  style?: string;
  label?: string;
  text?: string;
  url?: string;
};

export default function LandingPage() {
  const [voiceError, setVoiceError] = useState('');
  const [voiceClips, setVoiceClips] = useState<VoiceClip[]>(cannedVoiceStyles);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { threshold: 0.22 }
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch('/sounds/ai-demo/custom/manifest.json')
      .then((response) => {
        if (!response.ok) throw new Error('No saved voice manifest.');
        return response.json() as Promise<VoiceManifestEntry[]>;
      })
      .then((manifest) => {
        const savedByStyle = new Map(
          manifest
            .filter((entry) => entry.style && entry.label && entry.text && entry.url)
            .map((entry) => [entry.style!, entry])
        );
        setVoiceClips(cannedVoiceStyles.map((style) => {
          const saved = savedByStyle.get(style.style);
          return saved
            ? {
                ...style,
                label: saved.label ?? style.label,
                sampleText: saved.text,
                src: saved.url!,
              }
            : style;
        }));
      })
      .catch(() => {});
  }, []);

  async function playVoicePreview(index: number) {
    const clip = voiceClips[index];
    if (!clip) return;
    setVoiceError('');
    audioRef.current?.pause();
    if (!clip.src) {
      setVoiceError(`${clip.label} does not have a saved MP3 preview yet.`);
      return;
    }
    try {
      audioRef.current = new Audio(clip.src);
      await audioRef.current.play();
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Stored voice preview clip is not available yet.');
    }
  }

  const selectedVoiceClip = voiceClips[selectedVoiceIndex] ?? voiceClips[0] ?? cannedVoiceStyles[0];
  const selectAdjacentVoice = (direction: -1 | 1) => {
    setSelectedVoiceIndex((current) => {
      const total = voiceClips.length || cannedVoiceStyles.length;
      return (current + direction + total) % total;
    });
    setVoiceError('');
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-pit-bg text-white">
      <style>{`
        @keyframes pp-meter {
          0% { transform: translateX(-55%); }
          100% { transform: translateX(155%); }
        }
        @keyframes pp-pulse-ring {
          0%, 100% { opacity: 0.35; transform: scale(0.92); }
          50% { opacity: 0.9; transform: scale(1.04); }
        }
        [data-reveal] {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 680ms ease, transform 680ms ease, border-color 680ms ease;
        }
        [data-reveal].is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        @media (prefers-reduced-motion: reduce) {
          [data-reveal] { opacity: 1; transform: none; transition: none; }
          .pp-meter-bar, .pp-ring { animation: none !important; }
        }
      `}</style>

      <section className="relative overflow-hidden border-b border-pit-border bg-[#111113]">
        <div className="absolute inset-0 opacity-70">
          <div className="h-full w-full bg-[radial-gradient(circle_at_30%_12%,rgba(14,165,165,0.20),transparent_30%),radial-gradient(circle_at_78%_8%,rgba(240,165,0,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_58%)]" />
        </div>

        <div className="relative mx-auto flex max-w-7xl flex-col px-5 pb-4 pt-5 sm:min-h-[92vh] sm:px-8 sm:pb-5 lg:px-10">
          <header className="-mx-5 -mt-5 border-b border-pit-teal/20 bg-[#122E30]/95 px-4 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.22)] backdrop-blur sm:-mx-8 sm:rounded-b-2xl sm:px-8 sm:py-4 lg:-mx-10 lg:px-10">
            <div className="flex h-12 items-center justify-between gap-3 sm:h-auto">
            <Link to="/landing" className="flex min-w-0 items-center gap-2" aria-label="ThePokerPlanner home">
              <img
                src="/branding/the-poker-planner-logo-192.png"
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/15 sm:h-10 sm:w-10"
              />
              <span className="truncate text-base font-extrabold leading-none text-white sm:text-base">ThePokerPlanner</span>
            </Link>

            <nav className="hidden shrink-0 items-center gap-2 sm:flex">
              <Link className="btn h-10 whitespace-nowrap border-white/15 bg-white/5 px-3 text-sm text-white hover:bg-white/10" to="/blind-timer">
                <Clock3 size={14} />
                Blind timer
              </Link>
              <Link className="btn h-10 whitespace-nowrap border-white/15 bg-white/5 px-3 text-sm text-white hover:bg-white/10" to="/login">Sign in</Link>
              <Link className="btn h-10 whitespace-nowrap bg-pit-teal px-3 text-sm text-white shadow-[0_10px_30px_rgba(0,0,0,0.20)] hover:bg-pit-teal-hover" to="/login?mode=register">Create account</Link>
            </nav>

            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white sm:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu size={20} />
            </button>
            </div>

            {mobileMenuOpen && (
              <div className="grid gap-2 border-t border-white/10 pt-3 sm:hidden">
                <Link className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white" to="/login" onClick={() => setMobileMenuOpen(false)}>
                  <UserCircle size={16} />
                  Sign in
                </Link>
                <Link className="flex items-center gap-2 rounded-lg border border-pit-teal/30 bg-pit-teal/15 px-3 py-2 text-sm font-semibold text-pit-teal" to="/login?mode=register" onClick={() => setMobileMenuOpen(false)}>
                  <Users size={16} />
                  Create account
                </Link>
                <Link className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white" to="/blind-timer" onClick={() => setMobileMenuOpen(false)}>
                  <Clock3 size={16} />
                  Free blind timer
                </Link>
              </div>
            )}
          </header>

          <div data-reveal className="mt-5 hidden rounded-xl border border-pit-teal/25 bg-pit-teal/10 px-4 py-3 text-sm text-pit-text shadow-[0_18px_60px_rgba(0,0,0,0.25)] sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <span className="font-semibold text-white">ThePokerPlanner is live!</span>
              <span className="ml-1">Help us build and shape for all hosting needs!</span>
            </div>
            <Link className="mt-3 inline-flex text-sm font-semibold text-pit-teal hover:text-pit-teal/80 sm:mt-0" to="/login?mode=register">
              Create your account
            </Link>
          </div>

          <div className="grid items-start gap-3 py-3 sm:flex-1 sm:gap-10 sm:py-12 xl:grid-cols-[minmax(0,0.9fr)_minmax(560px,1.1fr)] xl:items-center xl:py-16">
            <div data-reveal className="mx-auto max-w-2xl text-center xl:mx-0 xl:text-left">
              <p className="mb-2 inline-flex rounded-full border border-pit-teal/30 bg-pit-teal/10 px-3 py-1 text-[10px] font-semibold uppercase text-pit-teal sm:mb-4 sm:text-xs">
                Poker nights, organized
              </p>
              <h1 className="whitespace-nowrap text-[clamp(1.62rem,6.9vw,2rem)] font-black leading-none text-white sm:whitespace-normal sm:text-6xl sm:leading-[0.98] lg:text-7xl">
                Run Better Poker Nights
              </h1>
              <p className="mx-auto mt-2 max-w-[20rem] text-[13px] leading-[1.45] text-pit-text sm:mt-6 sm:max-w-xl sm:text-lg sm:leading-8 xl:mx-0">
                Schedule your tournaments, seat your players, run the clock, display the room board, manage your players, and give every group its own personality.
              </p>
              <div className="mt-8 hidden flex-wrap gap-3 sm:flex">
                <Link className="btn-primary justify-center px-3 py-2.5 text-sm sm:px-5 sm:py-3 sm:text-base" to="/login?mode=register">Start hosting</Link>
                <Link className="btn-ghost justify-center px-3 py-2.5 text-sm sm:px-5 sm:py-3 sm:text-base" to="/blind-timer">
                  <Clock3 size={16} />
                  Blind timer
                </Link>
                <button className="btn-ghost justify-center px-5 py-3 text-base" type="button" onClick={() => playVoicePreview(selectedVoiceIndex)}>
                  <Volume2 size={16} />
                  Preview voice
                </button>
              </div>
              <div className="mt-8 hidden max-w-lg gap-2 text-sm text-pit-text sm:grid sm:grid-cols-3">
                {steps.map((step, index) => (
                  <div key={step} className="rounded-lg border border-pit-border bg-pit-surface/55 p-3">
                    <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-pit-teal/15 text-xs font-bold text-pit-teal">
                      {index + 1}
                    </span>
                    <p>{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div data-reveal className="sm:hidden">
              <MobileHeroPreview />
            </div>

            <div data-reveal className="hidden sm:block">
              <HeroBoard />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <div data-reveal className="mb-8">
          <p className="text-sm font-semibold uppercase text-pit-teal">Screen views</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Designed for hosts, players, and the room.</h2>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <ProductShot
            title="Run Tournament"
            eyebrow="Host command center"
            caption="Large timer, current blinds, payout rail, QR access, and fast player actions from one screen."
          >
            <RunTournamentMock />
          </ProductShot>
          <ProductShot
            title="Player Lobby"
            eyebrow="Phone friendly"
            caption="Players can see their seat, clock, registration status, payout info, and report when they bust."
          >
            <PlayerLobbyMock />
          </ProductShot>
          <ProductShot
            title="Pocket Admin"
            eyebrow="Mobile control"
            caption="Hosts can control the timer and handle quick actions while walking the room."
          >
            <PocketAdminMock />
          </ProductShot>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <div data-reveal className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase text-pit-teal">Built for live games</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">A better rhythm for every part of tournament night.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-pit-text">
            ThePokerPlanner keeps the host focused on decisions instead of explanations: clear state, fast actions, and screens that make sense from across the room.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                data-reveal
                style={{ transitionDelay: `${index * 80}ms` }}
                className="group relative overflow-hidden rounded-xl border border-pit-border bg-pit-card p-5 transition-colors hover:border-pit-teal/45"
              >
                <div className="absolute inset-x-0 top-0 h-px overflow-hidden bg-pit-border">
                  <span className="pp-meter-bar block h-px w-1/2 bg-pit-teal" style={{ animation: 'pp-meter 2.8s linear infinite' }} />
                </div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-pit-teal/25 bg-pit-teal/10 text-pit-teal">
                    <Icon size={22} />
                  </div>
                  <span className="rounded-lg border border-pit-border bg-pit-bg px-2 py-1 font-mono text-xs text-pit-text">{feature.stat}</span>
                </div>
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-pit-text">{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="voice-director" className="overflow-hidden border-y border-pit-border bg-pit-surface/30">
        <div className="mx-auto grid max-w-7xl min-w-0 gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:px-10">
          <div data-reveal className="min-w-0 lg:sticky lg:top-8 lg:self-start">
            <p className="text-sm font-semibold uppercase text-pit-teal">Voice director</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Your game can sound like your game.</h2>
            <p className="mt-4 text-sm leading-6 text-pit-text">
              Pick a voice style for each group and let tournament announcements match the room: polished, chaotic, cinematic, friendly, or full sports-arena hype.
            </p>
            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-pit-border bg-pit-bg/60 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-pit-teal" />
                  <h3 className="text-sm font-semibold text-white">Context when it matters</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-pit-text">
                  Classic mode keeps announcements short and clean. When a group wants more color, level changes can include live tournament context like field movement, rebuys, add-ons, and bounty pressure.
                </p>
              </div>
              <div className="grid gap-2 text-sm text-pit-text sm:grid-cols-2 lg:grid-cols-1">
                {['Group-level voice preset', 'Custom prompt flavor', 'Concise clock, pause, knockout, rebuy, and add-on calls', 'Preview styles before game night'].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg border border-pit-border bg-pit-bg/60 px-3 py-2">
                    <CheckCircle2 size={15} className="text-pit-teal" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div data-reveal className="min-w-0 overflow-hidden rounded-xl border border-pit-border bg-pit-card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-pit-muted">Voice preview</p>
                <h3 className="mt-1 text-xl font-bold text-white">Hear the table personalities</h3>
              </div>
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-pit-teal/30 bg-pit-teal/10">
                <span className="pp-ring absolute inset-1 rounded-full border border-pit-teal/40" style={{ animation: 'pp-pulse-ring 1.8s ease-in-out infinite' }} />
                <Bot size={22} className="relative text-pit-teal" />
              </div>
            </div>

            <div className="mb-4 flex items-center gap-3 sm:hidden">
              <button
                type="button"
                aria-label="Previous voice"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pit-border bg-pit-bg/70 text-pit-text"
                onClick={() => selectAdjacentVoice(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-0 flex-1 rounded-full border border-pit-teal/30 bg-pit-teal/10 px-3 py-2 text-center">
                <p className="truncate text-sm font-semibold text-white">{selectedVoiceClip.label}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-pit-teal">
                  {selectedVoiceIndex + 1} of {voiceClips.length}
                </p>
              </div>
              <button
                type="button"
                aria-label="Next voice"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pit-border bg-pit-bg/70 text-pit-text"
                onClick={() => selectAdjacentVoice(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="-mx-1 mb-4 hidden max-w-full gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden">
              {voiceClips.map((clip, index) => (
                <button
                  key={clip.style}
                  type="button"
                  onClick={() => {
                    setSelectedVoiceIndex(index);
                    setVoiceError('');
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    index === selectedVoiceIndex
                      ? 'border-pit-teal bg-pit-teal/15 text-pit-teal'
                      : 'border-pit-border bg-pit-bg/70 text-pit-muted hover:text-white'
                  }`}
                >
                  {clip.label}
                </button>
              ))}
            </div>

            <div className="min-w-0 rounded-xl border border-pit-teal/30 bg-pit-teal/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-pit-teal">Now previewing</p>
                  <h4 className="mt-1 text-2xl font-bold text-white">{selectedVoiceClip.label}</h4>
                  <p className="mt-2 text-sm leading-6 text-pit-text">{selectedVoiceClip.text}</p>
                </div>
                <button
                  type="button"
                  className="btn-primary w-full shrink-0 px-4 py-2 text-sm sm:w-auto"
                  onClick={() => playVoicePreview(selectedVoiceIndex)}
                >
                  <Play size={15} />
                  Play clip
                </button>
              </div>
              <div className="mt-4 rounded-lg border border-pit-border bg-pit-bg/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-pit-muted">Sample line</p>
                <p className="mt-1 break-words text-sm leading-6 text-white">
                  {selectedVoiceClip.sampleText ?? (selectedVoiceClip.src ? 'Saved MP3 preview is ready.' : 'No saved MP3 preview yet.')}
                </p>
              </div>
            </div>

            {voiceError && (
              <p className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
                {voiceError}
              </p>
            )}

          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div data-reveal>
            <p className="text-sm font-semibold uppercase text-pit-teal">Player tracking</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Track the game without losing the night.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-pit-text">
              ThePokerPlanner keeps the useful history: entries, check-ins, knockouts, payouts, placement medals, and group challenge coins. The point is not to make poker night feel like work. It is to let the app quietly handle the record keeping while the group focuses on the table talk, rivalries, and stories people actually remember.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {playerTrackingHighlights.map((item, index) => (
                <article
                  key={item.title}
                  data-reveal
                  style={{ transitionDelay: `${index * 80}ms` }}
                  className="rounded-xl border border-pit-border bg-pit-card p-4"
                >
                  <div className="mb-3 inline-flex rounded-lg border border-pit-teal/25 bg-pit-teal/10 px-2 py-1 font-mono text-xs font-semibold text-pit-teal">
                    {item.stat}
                  </div>
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-pit-text">{item.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div data-reveal className="rounded-xl border border-pit-border bg-pit-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-pit-muted">Group pride</p>
                <h3 className="mt-1 text-xl font-bold text-white">Coins, medals, and bragging rights</h3>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-yellow-200/25 bg-yellow-200/10 text-yellow-200">
                <Trophy size={22} />
              </div>
            </div>
            <PlayerTrackingMock />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <div data-reveal className="rounded-xl border border-pit-border bg-pit-card p-6 sm:p-8 lg:flex lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white">Ready for the next poker night?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-pit-text">
              Beta access is open: run real games with the full feature set and help shape what comes next.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 lg:mt-0">
            <Link className="btn-primary px-5 py-3" to="/login?mode=register">Create account</Link>
            <Link className="btn-ghost px-5 py-3" to="/login">Sign in</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroBoard() {
  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="rounded-xl border border-white/10 bg-pit-card p-3 shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        <div className="rounded-lg border border-pit-border bg-[#151519] p-3">
          <div className="mb-3 flex items-center justify-between border-b border-pit-border pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-pit-muted">Tournament Display</p>
              <h2 className="text-lg font-bold text-white">Saturday Championship</h2>
            </div>
            <BrandLockup compact showSlogan={false} className="scale-90" />
          </div>
          <div className="grid gap-3 xl:grid-cols-[150px_minmax(0,1fr)_150px]">
            <MiniStructure />
            <div className="rounded-xl border border-pit-border bg-black/25 p-4 text-center">
              <p className="text-xs font-semibold uppercase text-pit-text">Level 4 of 12</p>
              <p className="mt-3 font-mono text-6xl font-black leading-none text-white md:text-7xl">18:42</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MiniBlind label="Current" value="300 / 600" />
                <MiniBlind label="Next" value="500 / 1K" />
              </div>
            </div>
            <MiniPayout />
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileHeroPreview() {
  return (
    <div className="mx-auto w-full max-w-[23rem] overflow-hidden rounded-xl border border-white/10 bg-[#111114] shadow-[0_22px_60px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between border-b border-pit-border bg-pit-card px-3 py-2">
        <div className="min-w-0">
          <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-pit-muted">Tournament Display</p>
          <p className="truncate text-xs font-bold text-white">Saturday Championship</p>
        </div>
        <span className="rounded-md border border-pit-teal/30 bg-pit-teal/10 px-2 py-1 text-[9px] font-semibold text-pit-teal">
          TV 478381
        </span>
      </div>
      <div className="grid grid-cols-[0.62fr_1fr] gap-2 p-2">
        <div className="rounded-lg border border-pit-border bg-black/25 p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase text-white">Blinds</p>
            <span className="text-[8px] text-pit-muted">12</span>
          </div>
          {['100 / 200', '150 / 300', '200 / 400', '300 / 600'].map((level, index) => (
            <div
              key={level}
              className={`mt-1 flex justify-between rounded px-1.5 py-1 text-[9px] ${
                index === 3 ? 'bg-yellow-200/80 text-yellow-950' : 'bg-pit-bg/70 text-pit-text'
              }`}
            >
              <span>{index + 1}</span>
              <span>{level}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-pit-border bg-black/30 p-3 text-center">
          <p className="text-[9px] font-semibold uppercase text-pit-text">Level 4 of 12</p>
          <p className="mt-2 font-mono text-5xl font-black leading-none text-white">18:42</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-pit-border bg-pit-bg/70 p-2">
              <p className="text-[8px] uppercase text-pit-muted">Current</p>
              <p className="mt-0.5 text-sm font-bold text-white">300/600</p>
            </div>
            <div className="rounded-md border border-pit-border bg-pit-bg/70 p-2">
              <p className="text-[8px] uppercase text-pit-muted">Players</p>
              <p className="mt-0.5 text-sm font-bold text-white">18 in</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStructure() {
  const levels = ['100 / 200', '150 / 300', '200 / 400', '300 / 600', '500 / 1K'];
  return (
    <div className="rounded-xl border border-pit-border bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase text-white">Structure</p>
        <span className="text-[10px] text-pit-muted">12 levels</span>
      </div>
      <div className="space-y-1">
        {levels.map((level, index) => (
          <div key={level} className={`flex justify-between rounded-md px-2 py-1 text-xs ${index === 3 ? 'bg-yellow-200/80 text-yellow-950' : 'bg-pit-bg/70 text-pit-text'}`}>
            <span>{index + 1}</span>
            <span>{level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniBlind({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-bg/70 p-3">
      <p className="text-[10px] uppercase text-pit-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function MiniPayout() {
  return (
    <div className="rounded-xl border border-pit-border bg-black/25 p-3">
      <p className="text-xs font-bold uppercase text-white">Payouts</p>
      <p className="mt-2 text-sm text-pit-teal">$860 pool</p>
      {['1st $430', '2nd $258', '3rd $172'].map((row) => (
        <div key={row} className="mt-2 rounded-md border border-pit-border bg-pit-bg/70 px-2 py-1 text-xs text-white">
          {row}
        </div>
      ))}
    </div>
  );
}

function PlayerTrackingMock() {
  const rows = [
    {
      name: 'Ambo',
      detail: 'Checked in - Table 2 Seat 4',
      medals: '1st x2  2nd x1',
      coins: ['/challenge-coins/defaults/big-stack.svg', '/challenge-coins/defaults/royal-highness.svg', '/challenge-coins/defaults/table-talker.svg'],
    },
    {
      name: 'Steve',
      detail: 'Finished 2nd - Paid',
      medals: '2nd x3  3rd x1',
      coins: ['/challenge-coins/defaults/lockdown.svg', '/challenge-coins/defaults/lucky-dog.svg'],
    },
    {
      name: 'Rob',
      detail: 'Bounty claimed',
      medals: '3rd x2',
      coins: ['/challenge-coins/defaults/bounty-hunter.svg', '/challenge-coins/defaults/hot-streak.svg'],
    },
  ];

  return (
    <div className="space-y-3 rounded-xl border border-pit-border bg-pit-bg/70 p-3">
      {rows.map((row) => (
        <div key={row.name} className="rounded-lg border border-pit-border bg-pit-card/80 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{row.name}</p>
              <p className="mt-1 text-xs text-pit-muted">{row.detail}</p>
            </div>
            <span className="shrink-0 rounded-full border border-yellow-200/30 bg-yellow-200/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-200">
              {row.medals}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {row.coins.map((coin) => (
              <img
                key={coin}
                src={coin}
                alt=""
                className="h-9 w-9 rounded-full border border-white/10 bg-pit-bg object-cover shadow"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductShot({
  title,
  eyebrow,
  caption,
  children,
}: {
  title: string;
  eyebrow: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <article data-reveal className="overflow-hidden rounded-xl border border-pit-border bg-pit-card">
      <div className="border-b border-pit-border p-4">
        <p className="text-xs font-semibold uppercase text-pit-teal">{eyebrow}</p>
        <h3 className="mt-1 text-xl font-bold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-pit-text">{caption}</p>
      </div>
      <div className="bg-[#111113] p-4">{children}</div>
    </article>
  );
}

function RunTournamentMock() {
  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-md border border-pit-border px-2 py-1 text-xs text-pit-text">TV 478381</span>
        <span className="rounded-md bg-pit-teal px-2 py-1 text-xs font-semibold text-white">Start</span>
      </div>
      <div className="rounded-lg border border-pit-border bg-black/25 p-4 text-center">
        <p className="text-xs uppercase text-pit-text">Level 3 of 9</p>
        <p className="font-mono text-5xl font-black text-white">19:07</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniBlind label="Current" value="75 / 150" />
          <MiniBlind label="Next" value="125 / 250" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {['3 left', '4 rebuys', '$155 pot'].map((item) => (
          <div key={item} className="rounded-md border border-pit-border bg-pit-card p-2 text-center text-xs text-white">{item}</div>
        ))}
      </div>
    </div>
  );
}

function PlayerLobbyMock() {
  return (
    <div className="mx-auto max-w-[250px] rounded-[1.75rem] border border-pit-border bg-pit-bg p-3">
      <div className="mb-3 text-center">
        <p className="text-sm font-bold text-white">June Tournament</p>
        <p className="mt-1 text-[11px] text-pit-teal">TABLE 4 SEAT 6</p>
      </div>
      <div className="rounded-lg border border-pit-border bg-black/25 p-3 text-center">
        <p className="font-mono text-4xl font-black text-white">08:54</p>
        <p className="mt-1 text-xs text-pit-text">300 / 600</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <LobbyPill label="Registered" value="Yes" />
        <LobbyPill label="Checked In" value="Yes" />
      </div>
      <button className="mt-3 w-full rounded-lg bg-red-600/25 px-3 py-2 text-xs font-bold text-red-300">I Have Been Knocked Out</button>
    </div>
  );
}

function LobbyPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-card p-2 text-center">
      <p className="text-[10px] uppercase text-pit-muted">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function PocketAdminMock() {
  return (
    <div className="mx-auto max-w-[250px] rounded-xl border border-pit-border bg-pit-bg p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase text-pit-muted">Pocket Admin</p>
          <p className="text-sm font-bold text-white">June Tournament</p>
        </div>
        <span className="rounded-md border border-yellow-300/50 px-2 py-1 text-[10px] text-yellow-200">Awake</span>
      </div>
      <div className="rounded-lg border border-pit-border bg-black/25 p-3 text-center">
        <p className="font-mono text-4xl font-black text-white">20:00</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {['Start', '+ Rebuy', '+ Add-On', 'Next'].map((item) => (
          <button key={item} className="rounded-lg border border-pit-border bg-pit-card px-2 py-2 text-xs font-semibold text-white">{item}</button>
        ))}
      </div>
    </div>
  );
}
