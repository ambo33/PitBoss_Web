import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  Check,
  ChevronRight,
  Clock3,
  Music4,
  Play,
  RefreshCw,
  Search,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  CINEMATIC_DEMO_DURATION_MS,
  CINEMATIC_DEMO_POSTER_TIME_MS,
  CINEMATIC_DEMO_SCENES,
  cinematicDemoTournament,
  getCinematicDemoScene,
} from '../demoTournament';
import './cinematic-demo.css';

export interface CinematicDemoProps {
  variant?: 'embedded' | 'standalone';
  autoplay?: boolean;
  controls?: boolean;
}

interface DemoSceneProps {
  sceneElapsedMs: number;
}

interface TimelineOptions {
  shouldPlay: boolean;
  canAdvance: boolean;
  reducedMotion: boolean;
  runKey: number;
}

const FRAME_PUBLISH_INTERVAL_MS = 66;

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return reducedMotion;
}

function useDocumentVisible() {
  const [visible, setVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  ));

  useEffect(() => {
    const onVisibilityChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return visible;
}

function useElementInView(ref: RefObject<HTMLElement>) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio > 0.05),
      { rootMargin: '80px 0px', threshold: [0, 0.05, 0.35] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return inView;
}

function useCinematicTimeline({
  shouldPlay,
  canAdvance,
  reducedMotion,
  runKey,
}: TimelineOptions) {
  const initialElapsed = reducedMotion ? CINEMATIC_DEMO_POSTER_TIME_MS : 0;
  const [elapsedMs, setElapsedMs] = useState(initialElapsed);
  const elapsedRef = useRef(initialElapsed);
  const frameRef = useRef<number | null>(null);
  const segmentRef = useRef<{ startedAt: number; elapsedAtStart: number } | null>(null);

  useEffect(() => {
    if (frameRef.current != null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    segmentRef.current = null;
    const resetElapsed = reducedMotion ? CINEMATIC_DEMO_POSTER_TIME_MS : 0;
    elapsedRef.current = resetElapsed;
    setElapsedMs(resetElapsed);
  }, [reducedMotion, runKey]);

  useEffect(() => {
    if (frameRef.current != null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    segmentRef.current = null;

    if (reducedMotion || !shouldPlay || !canAdvance || elapsedRef.current >= CINEMATIC_DEMO_DURATION_MS) {
      return;
    }

    const segment = {
      startedAt: window.performance.now(),
      elapsedAtStart: elapsedRef.current,
    };
    segmentRef.current = segment;
    let lastPublishedAt = segment.startedAt;

    const tick = (now: number) => {
      const nextElapsed = Math.min(
        CINEMATIC_DEMO_DURATION_MS,
        segment.elapsedAtStart + now - segment.startedAt,
      );
      elapsedRef.current = nextElapsed;

      if (
        nextElapsed >= CINEMATIC_DEMO_DURATION_MS
        || now - lastPublishedAt >= FRAME_PUBLISH_INTERVAL_MS
      ) {
        lastPublishedAt = now;
        setElapsedMs(nextElapsed);
      }

      if (nextElapsed < CINEMATIC_DEMO_DURATION_MS) {
        frameRef.current = window.requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
        segmentRef.current = null;
      }
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (segmentRef.current) {
        const now = window.performance.now();
        elapsedRef.current = Math.min(
          CINEMATIC_DEMO_DURATION_MS,
          segmentRef.current.elapsedAtStart + now - segmentRef.current.startedAt,
        );
      }
      segmentRef.current = null;
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [canAdvance, reducedMotion, runKey, shouldPlay]);

  return elapsedMs;
}

function formatClock(totalSeconds: number) {
  const boundedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(boundedSeconds / 60);
  const seconds = boundedSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function BuildScene({ sceneElapsedMs }: DemoSceneProps) {
  const fields = [
    { label: 'Tournament name', value: cinematicDemoTournament.name, revealAt: 350 },
    { label: 'Players', value: String(cinematicDemoTournament.playerCount), revealAt: 950 },
    { label: 'Starting stack', value: cinematicDemoTournament.startingStack.toLocaleString(), revealAt: 1_550 },
    { label: 'Blind structure', value: cinematicDemoTournament.blindStructure, revealAt: 2_150 },
  ];
  const ready = sceneElapsedMs >= 3_050;

  return (
    <div className="cinematic-demo__scene cinematic-demo__scene--build">
      <div className="cinematic-demo__wizard">
        <div className="cinematic-demo__panel-heading">
          <div>
            <span>NEW TOURNAMENT</span>
            <h3>Build your game</h3>
          </div>
          <span className="cinematic-demo__step-count">Step 1 of 4</span>
        </div>
        <div className="cinematic-demo__field-grid">
          {fields.map((field) => {
            const revealed = sceneElapsedMs >= field.revealAt;
            return (
              <div className={'cinematic-demo__field' + (revealed ? ' is-filled' : '')} key={field.label}>
                <span>{field.label}</span>
                <strong>{revealed ? field.value : '—'}</strong>
              </div>
            );
          })}
        </div>
        <div className={'cinematic-demo__ready' + (ready ? ' is-visible' : '')}>
          <Check aria-hidden="true" />
          <span><strong>Tournament ready</strong> Everything is set for Saturday night.</span>
        </div>
      </div>
      <aside className="cinematic-demo__build-summary" aria-label="Tournament setup summary">
        <span className="cinematic-demo__micro-label">GAME PLAN</span>
        <strong>{cinematicDemoTournament.name}</strong>
        <div><Users aria-hidden="true" /><span>{cinematicDemoTournament.playerCount} players</span></div>
        <div><Clock3 aria-hidden="true" /><span>20 minute levels</span></div>
        <div><Trophy aria-hidden="true" /><span>{'$' + cinematicDemoTournament.prizePool.toLocaleString()} prize pool</span></div>
      </aside>
      <SceneWord word="BUILD." />
    </div>
  );
}

function RunScene({ sceneElapsedMs }: DemoSceneProps) {
  const laterState = sceneElapsedMs >= 2_800;
  const timerSeconds = laterState
    ? 18 * 60 + 42
    : 20 * 60 - Math.floor(sceneElapsedMs / 1_000);
  const level = laterState ? cinematicDemoTournament.liveLevel : cinematicDemoTournament.earlyLevel;
  const playersRemaining = laterState
    ? cinematicDemoTournament.playersRemaining
    : cinematicDemoTournament.playerCount;
  const showRebuy = sceneElapsedMs >= 4_100 && sceneElapsedMs < 5_550;

  return (
    <div className="cinematic-demo__scene cinematic-demo__scene--run">
      <aside className="cinematic-demo__structure-rail" aria-label="Blind structure preview">
        <span className="cinematic-demo__micro-label">BLIND STRUCTURE</span>
        {cinematicDemoTournament.blindLevels.map((blind) => (
          <div className={blind.level === level.number ? 'is-active' : ''} key={blind.level}>
            <span>{blind.level}</span>
            <strong>{blind.blinds}</strong>
          </div>
        ))}
      </aside>
      <div className="cinematic-demo__clock">
        <div className="cinematic-demo__clock-status"><Play aria-hidden="true" /> RUNNING</div>
        <span>LEVEL {level.number}</span>
        <strong>{formatClock(timerSeconds)}</strong>
        <div className="cinematic-demo__blind-value">
          {level.smallBlind.toLocaleString()} / {level.bigBlind.toLocaleString()}
        </div>
        <div className="cinematic-demo__clock-stats">
          <div><strong>{playersRemaining}</strong><span>Players</span></div>
          <div><strong>24.5K</strong><span>Avg stack</span></div>
          <div><strong>{'$' + cinematicDemoTournament.firstPrize.toLocaleString()}</strong><span>First prize</span></div>
        </div>
      </div>
      <aside className="cinematic-demo__payout-rail" aria-label="Payout preview">
        <span className="cinematic-demo__micro-label">PAYOUTS</span>
        {cinematicDemoTournament.payouts.map((payout) => (
          <div key={payout.place}><span>{payout.place}</span><strong>{payout.amount}</strong></div>
        ))}
      </aside>
      <div className={'cinematic-demo__toast cinematic-demo__toast--rebuy' + (showRebuy ? ' is-visible' : '')}>
        <RefreshCw aria-hidden="true" />
        <span><strong>Chris rebuy +1</strong> Player count and prize pool updated.</span>
      </div>
      <SceneWord word="RUN." />
    </div>
  );
}

function ManageScene({ sceneElapsedMs }: DemoSceneProps) {
  const visibleActivityCount = Math.min(
    cinematicDemoTournament.activity.length,
    Math.max(1, Math.floor(sceneElapsedMs / 850) + 1),
  );

  return (
    <div className="cinematic-demo__scene cinematic-demo__scene--manage">
      <section className="cinematic-demo__player-table" aria-label="Player management preview">
        <div className="cinematic-demo__panel-heading">
          <div>
            <span>PLAYER MANAGEMENT</span>
            <h3>Keep the field organized</h3>
          </div>
          <span className="cinematic-demo__player-count">{cinematicDemoTournament.playersRemaining} active</span>
        </div>
        <div className="cinematic-demo__player-table-header">
          <span>Player</span><span>Stack</span><span>Status</span>
        </div>
        {cinematicDemoTournament.players.map((player) => (
          <div className={'cinematic-demo__player-row' + (player.name === 'Jordan' ? ' is-eliminated' : '')} key={player.name}>
            <strong>{player.name}</strong><span>{player.stack}</span><span>{player.status}</span>
          </div>
        ))}
      </section>
      <aside className="cinematic-demo__activity" aria-label="Live player activity">
        <span className="cinematic-demo__micro-label">LIVE ACTIVITY</span>
        {cinematicDemoTournament.activity.slice(0, visibleActivityCount).map((item) => (
          <div className={'cinematic-demo__activity-item cinematic-demo__activity-item--' + item.kind} key={item.player}>
            <UserPlus aria-hidden="true" />
            <span><strong>{item.player}</strong>{item.detail}</span>
            <Check aria-hidden="true" />
          </div>
        ))}
      </aside>
      <SceneWord word="MANAGE." />
    </div>
  );
}

function MusicScene({ sceneElapsedMs }: DemoSceneProps) {
  const queryTarget = cinematicDemoTournament.requestedTrack.title;
  const queryLength = Math.max(0, Math.min(
    queryTarget.length,
    Math.floor((sceneElapsedMs - 250) / 70),
  ));
  const query = queryTarget.slice(0, queryLength);
  const showResult = sceneElapsedMs >= 1_050;
  const requested = sceneElapsedMs >= 1_900;
  const queued = sceneElapsedMs >= 2_600;
  const showNowPlaying = sceneElapsedMs >= 3_450;

  return (
    <div className="cinematic-demo__scene cinematic-demo__scene--music">
      <section className="cinematic-demo__phone" aria-label="Player Lobby music request preview">
        <div className="cinematic-demo__phone-bar"><span>PLAYER LOBBY</span><span>9:41</span></div>
        <div className="cinematic-demo__phone-title">
          <Music4 aria-hidden="true" />
          <div><span>MUSIC REQUESTS</span><strong>Pick the next song</strong></div>
        </div>
        <div className="cinematic-demo__search">
          <Search aria-hidden="true" />
          <span>{query || 'Search songs'}</span>
          <i />
        </div>
        <div className={'cinematic-demo__track-result' + (showResult ? ' is-visible' : '')}>
          <span className="cinematic-demo__album-art"><Music4 aria-hidden="true" /></span>
          <span>
            <strong>{cinematicDemoTournament.requestedTrack.title}</strong>
            <small>{cinematicDemoTournament.requestedTrack.artist}</small>
          </span>
          <span className={'cinematic-demo__request-action' + (queued ? ' is-queued' : '')}>
            {queued ? <Check aria-hidden="true" /> : null}
            {queued ? 'Queued' : requested ? 'Request sent' : 'Request song'}
          </span>
        </div>
        <p className={'cinematic-demo__queue-confirmation' + (queued ? ' is-visible' : '')}>
          <Check aria-hidden="true" /> Added to the host's request queue
        </p>
      </section>
      <div className="cinematic-demo__music-connection" aria-hidden="true">
        <span />
        <ChevronRight />
      </div>
      <section className="cinematic-demo__host-music" aria-label="Host music queue preview">
        <div className="cinematic-demo__panel-heading">
          <div><span>HOST MUSIC</span><h3>Requests</h3></div>
          <span className="cinematic-demo__request-count">1 queued</span>
        </div>
        <div className={'cinematic-demo__host-request' + (queued ? ' is-visible' : '')}>
          <span className="cinematic-demo__album-art"><Music4 aria-hidden="true" /></span>
          <span>
            <strong>{cinematicDemoTournament.requestedTrack.title}</strong>
            <small>{cinematicDemoTournament.requestedTrack.artist}</small>
            <em>Requested by {cinematicDemoTournament.requestedTrack.requestedBy}</em>
          </span>
          <span className="cinematic-demo__queued-badge"><Check aria-hidden="true" />Queued</span>
        </div>
        <div className={'cinematic-demo__now-playing' + (showNowPlaying ? ' is-visible' : '')}>
          <div className="cinematic-demo__equalizer" aria-hidden="true">
            <i /><i /><i /><i />
          </div>
          <span>
            <small>NOW PLAYING</small>
            <strong>{cinematicDemoTournament.currentTrack.title}</strong>
            <em>{cinematicDemoTournament.currentTrack.artist}</em>
          </span>
        </div>
      </section>
      <SceneWord word="LET THE TABLE PICK THE SOUNDTRACK." compact />
    </div>
  );
}

function WinScene({ sceneElapsedMs }: DemoSceneProps) {
  const revealWinner = sceneElapsedMs >= 700;
  const revealPrize = sceneElapsedMs >= 1_450;

  return (
    <div className="cinematic-demo__scene cinematic-demo__scene--win">
      <div className="cinematic-demo__winner-glow" aria-hidden="true" />
      <section className={'cinematic-demo__winner-card' + (revealWinner ? ' is-visible' : '')}>
        <span className="cinematic-demo__winner-chip"><Trophy aria-hidden="true" /></span>
        <span>SATURDAY CHAMPIONSHIP</span>
        <small>WINNER</small>
        <strong>{cinematicDemoTournament.winner.name}</strong>
        <b className={revealPrize ? 'is-visible' : ''}>{cinematicDemoTournament.winner.prize}</b>
        <p>Final result and payouts are ready to share.</p>
      </section>
      <SceneWord word="WIN." />
    </div>
  );
}

function FinaleScene() {
  return (
    <div className="cinematic-demo__scene cinematic-demo__scene--finale">
      <div className="cinematic-demo__finale-mark">
        <img src="/branding/thepokerplanner-spade-logo-192.png" alt="" />
        <span>THEPOKERPLANNER</span>
      </div>
      <h3>Your poker night.<br /><strong>Completely organized.</strong></h3>
      <div className="cinematic-demo__finale-rule" aria-hidden="true" />
      <p>Build the tournament. Run the room. Let the table pick the soundtrack.</p>
      <span className="cinematic-demo__finale-cta" aria-hidden="true">
        Create Your Tournament <ChevronRight />
      </span>
    </div>
  );
}

function SceneWord({ word, compact = false }: { word: string; compact?: boolean }) {
  return (
    <div className={'cinematic-demo__scene-word' + (compact ? ' cinematic-demo__scene-word--compact' : '')} aria-hidden="true">
      {word}
    </div>
  );
}

function ActiveScene({
  sceneId,
  sceneElapsedMs,
}: {
  sceneId: ReturnType<typeof getCinematicDemoScene>['id'];
  sceneElapsedMs: number;
}) {
  switch (sceneId) {
    case 'build':
      return <BuildScene sceneElapsedMs={sceneElapsedMs} />;
    case 'run':
      return <RunScene sceneElapsedMs={sceneElapsedMs} />;
    case 'manage':
      return <ManageScene sceneElapsedMs={sceneElapsedMs} />;
    case 'music':
      return <MusicScene sceneElapsedMs={sceneElapsedMs} />;
    case 'win':
      return <WinScene sceneElapsedMs={sceneElapsedMs} />;
    case 'finale':
      return <FinaleScene />;
  }
}

export default function CinematicDemo({
  variant = 'embedded',
  autoplay = true,
  controls,
}: CinematicDemoProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [runKey, setRunKey] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const documentVisible = useDocumentVisible();
  const inView = useElementInView(rootRef);
  const resolvedControls = controls ?? variant === 'standalone';
  const isDevelopment = (
    (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true
  );
  const shouldPlay = autoplay || runKey > 0;
  const canAdvance = inView && documentVisible;
  const elapsedMs = useCinematicTimeline({
    shouldPlay,
    canAdvance,
    reducedMotion,
    runKey,
  });
  const scene = getCinematicDemoScene(elapsedMs);
  const sceneElapsedMs = Math.max(0, elapsedMs - scene.startMs);
  const progress = Math.min(1, elapsedMs / CINEMATIC_DEMO_DURATION_MS);
  const progressStyle = {
    '--cinematic-demo-progress': String(progress * 100) + '%',
  } as CSSProperties;
  const paused = !reducedMotion && (!shouldPlay || !canAdvance);

  return (
    <section
      ref={rootRef}
      className={[
        'cinematic-demo',
        'cinematic-demo--' + variant,
        'cinematic-demo--scene-' + scene.id,
        paused ? 'is-paused' : '',
        reducedMotion ? 'is-reduced-motion' : '',
      ].filter(Boolean).join(' ')}
      data-scene={scene.id}
      aria-label="ThePokerPlanner automated product demonstration"
    >
      <p className="cinematic-demo__screen-reader-summary">
        A presentation of tournament setup, live clock management, player activity, player music requests, payouts, and winner results.
      </p>
      <div className="cinematic-demo__frame">
        <div className="cinematic-demo__browser-bar" aria-hidden="true">
          <span className="cinematic-demo__window-dots"><i /><i /><i /></span>
          <span className="cinematic-demo__browser-title">
            <img src="/branding/thepokerplanner-spade-logo-192.png" alt="" />
            ThePokerPlanner
          </span>
          <span className="cinematic-demo__live-pill"><i /> PRODUCT DEMO</span>
        </div>
        <div className="cinematic-demo__timeline" style={progressStyle} aria-hidden="true">
          <span />
        </div>
        <div className="cinematic-demo__stage-header">
          <span>SEE YOUR POKER NIGHT COME ALIVE</span>
          <ol aria-label="Demo scenes">
            {CINEMATIC_DEMO_SCENES.map((item) => (
              <li
                className={
                  item.id === scene.id
                    ? 'is-active'
                    : elapsedMs >= item.endMs
                      ? 'is-complete'
                      : ''
                }
                key={item.id}
                aria-current={item.id === scene.id ? 'step' : undefined}
              >
                {item.label}
              </li>
            ))}
          </ol>
        </div>
        <div
          className="cinematic-demo__viewport"
          key={String(runKey) + '-' + scene.id}
          aria-hidden="true"
        >
          <ActiveScene sceneId={scene.id} sceneElapsedMs={sceneElapsedMs} />
        </div>
      </div>
      {isDevelopment && resolvedControls ? (
        <button
          type="button"
          className="cinematic-demo__restart"
          onClick={() => setRunKey((current) => current + 1)}
        >
          <RefreshCw aria-hidden="true" />
          Restart Demo
        </button>
      ) : null}
    </section>
  );
}
