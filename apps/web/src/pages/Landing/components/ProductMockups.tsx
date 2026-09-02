import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  ListMusic,
  Music4,
  Search,
  Trophy,
  Users,
  UserPlus,
} from 'lucide-react';
import './product-mockups.css';

export type StoryVisualVariant = 'build' | 'run' | 'lobby' | 'music' | 'win';

type MockupProps = {
  className?: string;
};

const structureRows = [
  ['1', '100 / 200', '20m'],
  ['2', '150 / 300', '20m'],
  ['3', '200 / 400', '20m'],
  ['4', '300 / 600', '20m'],
  ['5', '400 / 800', '20m'],
  ['6', 'Break', '10m'],
] as const;

const payoutRows = [
  ['1st', '$1,250'],
  ['2nd', '$750'],
  ['3rd', '$500'],
] as const;

function Equalizer({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`pp-equalizer${compact ? ' pp-equalizer--compact' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function MusicTile({ className = '' }: { className?: string }) {
  return (
    <span className={`pp-music-art ${className}`.trim()}>
      <Music4 size={18} strokeWidth={2.2} />
    </span>
  );
}

function useViewportActivity<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(() => typeof window === 'undefined');

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let inView = true;
    const update = () => setActive(inView && document.visibilityState !== 'hidden');
    const onVisibilityChange = () => update();
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (!('IntersectionObserver' in window)) {
      update();
      return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    }, { rootMargin: '80px 0px', threshold: 0.01 });
    observer.observe(root);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return { ref, active };
}

function useFinePointerParallax(ref: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;

    let bounds: DOMRect | null = null;
    let frame: number | null = null;
    let latestX = 0;
    let latestY = 0;

    const updateTransform = () => {
      frame = null;
      bounds ??= root.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      const x = ((latestX - bounds.left) / bounds.width - 0.5) * 2;
      const y = ((latestY - bounds.top) / bounds.height - 0.5) * 2;
      root.style.setProperty('--pp-tilt-x', `${(-y * 1.8).toFixed(2)}deg`);
      root.style.setProperty('--pp-tilt-y', `${(x * 2.4).toFixed(2)}deg`);
      root.style.setProperty('--pp-shift-x', `${(x * 6).toFixed(2)}px`);
      root.style.setProperty('--pp-shift-y', `${(y * 4).toFixed(2)}px`);
    };

    const cacheBounds = () => {
      bounds = root.getBoundingClientRect();
    };

    const handlePointerMove = (event: PointerEvent) => {
      latestX = event.clientX;
      latestY = event.clientY;
      if (frame == null) frame = window.requestAnimationFrame(updateTransform);
    };

    const reset = () => {
      bounds = null;
      root.style.setProperty('--pp-tilt-x', '0deg');
      root.style.setProperty('--pp-tilt-y', '0deg');
      root.style.setProperty('--pp-shift-x', '0px');
      root.style.setProperty('--pp-shift-y', '0px');
    };

    const invalidateBounds = () => {
      bounds = null;
    };

    root.addEventListener('pointerenter', cacheBounds);
    root.addEventListener('pointermove', handlePointerMove);
    root.addEventListener('pointerleave', reset);
    window.addEventListener('resize', invalidateBounds, { passive: true });
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      root.removeEventListener('pointerenter', cacheBounds);
      root.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerleave', reset);
      window.removeEventListener('resize', invalidateBounds);
    };
  }, [ref]);
}

function ProductWindowHeader({ label }: { label: string }) {
  return (
    <div className="pp-window-bar">
      <span className="pp-window-dots" aria-hidden="true"><i /><i /><i /></span>
      <span>{label}</span>
      <span className="pp-window-live"><i /> Live</span>
    </div>
  );
}

function StructurePanel() {
  return (
    <section className="pp-product-panel pp-structure-panel">
      <div className="pp-panel-title">
        <span>Structure</span>
        <small>12 levels</small>
      </div>
      <div className="pp-structure-head"><span>Lvl</span><span>Blinds</span><span>Time</span></div>
      <div className="pp-structure-list">
        {structureRows.map(([level, blinds, time]) => (
          <div key={level} className={level === '4' ? 'is-current' : ''}>
            <span>{level}</span><strong>{blinds}</strong><span>{time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PayoutPanel() {
  return (
    <section className="pp-product-panel pp-payout-panel">
      <div className="pp-panel-title">
        <span>Payouts</span>
        <small>3 paid</small>
      </div>
      <div className="pp-prize-total"><span>Prize Pool</span><strong>$2,500</strong></div>
      <div className="pp-payout-list">
        {payoutRows.map(([place, amount]) => (
          <div key={place}><strong>{place}</strong><span>{amount}</span></div>
        ))}
      </div>
    </section>
  );
}

function HeroTimerPanel() {
  return (
    <section className="pp-hero-clock">
      <p>Level 4 of 12</p>
      <div className="pp-hero-clock__time" aria-label="18 minutes 42 seconds">
        <span className="pp-time-before">18:43</span>
        <span className="pp-time-after">18:42</span>
      </div>
      <div className="pp-hero-blinds">
        <span><small>Current Blinds</small><strong>300 / 600</strong></span>
        <span><small>Next Blinds</small><strong>400 / 800</strong></span>
      </div>
      <div className="pp-hero-stats">
        <span><Users size={14} /><small>Players</small><strong className="pp-player-count"><i>33 / 72</i><b>34 / 72</b></strong></span>
        <span><Clock3 size={14} /><small>Rebuys</small><strong>12</strong></span>
      </div>
    </section>
  );
}

function HeroMusicRequest() {
  return (
    <div className="pp-hero-request">
      <div className="pp-request-heading">
        <span><ListMusic size={14} /> Music Request</span>
        <span className="pp-request-state"><i>New</i><b><Check size={11} /> Queued</b></span>
      </div>
      <div className="pp-request-track">
        <MusicTile />
        <span><strong>Mr. Brightside</strong><small>The Killers</small></span>
      </div>
      <div className="pp-request-footer">
        <span>Requested by Alex J.</span>
        <span className="pp-request-action"><i>Sending...</i><b><Check size={12} /> Added</b></span>
      </div>
    </div>
  );
}

function NowPlaying({ className = '' }: { className?: string }) {
  return (
    <div className={`pp-now-playing ${className}`.trim()}>
      <Equalizer />
      <span><small>Now Playing</small><strong>Mr. Brightside</strong></span>
      <Music4 size={15} />
    </div>
  );
}

function DesktopHeroTheater() {
  return (
    <div className="pp-theater-desktop">
      <div className="pp-product-window">
        <ProductWindowHeader label="Tournament Display" />
        <div className="pp-product-title">
          <span><small>Saturday</small><strong>Saturday Championship</strong></span>
          <span className="pp-product-status"><i /> Clock running</span>
        </div>
        <div className="pp-product-grid">
          <StructurePanel />
          <HeroTimerPanel />
          <PayoutPanel />
        </div>
      </div>
      <div className="pp-rebuy-toast"><span>+</span><strong>Chris rebuy</strong><small>Player count updated</small></div>
      <HeroMusicRequest />
      <NowPlaying />
    </div>
  );
}

function MobileHeroTheater() {
  return (
    <div className="pp-theater-mobile">
      <div className="pp-mobile-tournament">
        <div className="pp-mobile-tournament__top"><span>Saturday Championship</span><i>Live</i></div>
        <p className="pp-mobile-timer">18:42</p>
        <p className="pp-mobile-blinds"><small>Level 4</small><strong>300 / 600</strong></p>
        <div className="pp-mobile-metrics"><span><strong>34</strong><small>Players</small></span><span><strong>$1,250</strong><small>1st prize</small></span></div>
      </div>
      <div className="pp-mobile-request">
        <div className="pp-request-heading"><span><ListMusic size={14} /> Music Request</span><b><Check size={11} /> Queued</b></div>
        <div className="pp-request-track"><MusicTile /><span><strong>Mr. Brightside</strong><small>The Killers</small></span></div>
        <div className="pp-request-footer"><span>Requested by Alex</span><span className="pp-request-action"><b><Check size={12} /> Added</b></span></div>
      </div>
    </div>
  );
}

export function HeroProductTheater({ className = '' }: MockupProps) {
  const { ref, active } = useViewportActivity<HTMLDivElement>();
  useFinePointerParallax(ref);

  return (
    <div
      ref={ref}
      className={`pp-product-theater ${className}`.trim()}
      data-active={active ? 'true' : 'false'}
      role="img"
      aria-label="ThePokerPlanner tournament display showing level four, 18 minutes 42 seconds, 34 players, first prize of 1,250 dollars, and a player music request added to the queue."
    >
      <div className="pp-product-theater__ambient" aria-hidden="true" />
      <div className="pp-product-theater__stage" aria-hidden="true">
        <DesktopHeroTheater />
        <MobileHeroTheater />
      </div>
    </div>
  );
}

function BuildStory() {
  return (
    <div className="pp-story-card pp-story-build">
      <div className="pp-story-card__bar"><span>Host a Game</span><small>Step 2 of 4</small></div>
      <ol className="pp-wizard-steps">
        {['Basics', 'Details', 'Options', 'Review'].map((step, index) => (
          <li key={step} className={index < 1 ? 'is-complete' : index === 1 ? 'is-active' : ''}>
            <i>{index < 1 ? <Check size={10} /> : index + 1}</i><span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="pp-wizard-heading"><small>Game details</small><strong>Set the night</strong></div>
      <div className="pp-form-grid">
        <label><span>Tournament name</span><strong>Saturday Championship</strong></label>
        <label><span>Players</span><strong>54</strong></label>
        <label><span>Buy-in</span><strong>$50</strong></label>
        <label><span>Date</span><strong>Saturday · 7:00 PM</strong></label>
      </div>
      <div className="pp-ready-row"><span><Check size={14} /> Details saved</span><b>Options <ArrowRight size={13} /></b></div>
    </div>
  );
}

function RunStory() {
  return (
    <div className="pp-story-card pp-story-run">
      <div className="pp-story-card__bar"><span>Saturday Championship</span><small><i /> Clock running</small></div>
      <div className="pp-story-run__body">
        <div className="pp-story-clock"><small>Level 4</small><strong>18:42</strong><span>300 / 600</span></div>
        <div className="pp-story-run__stats"><span><small>Players left</small><strong>34</strong></span><span><small>Rebuys</small><strong>12</strong></span><span><small>Add-ons</small><strong>7</strong></span></div>
      </div>
      <div className="pp-event-stack">
        <span><UserPlus size={14} /><strong>Alex bought in</strong><small>Just now</small></span>
        <span><span className="pp-event-plus">+1</span><strong>Chris rebuy</strong><small>Level 4</small></span>
        <span><Trophy size={14} /><strong>Jordan eliminated</strong><small>8th place</small></span>
      </div>
    </div>
  );
}

function LobbyStory() {
  return (
    <div className="pp-phone-shell">
      <div className="pp-phone-speaker" />
      <div className="pp-phone-content">
        <div className="pp-phone-title"><span><small>Player Lobby</small><strong>Saturday Championship</strong></span><i>AJ</i></div>
        <div className="pp-phone-seat"><Check size={13} /><span>Checked in</span><strong>Table 3 · Seat 6</strong></div>
        <div className="pp-phone-clock"><small>Level 4 of 12</small><strong>18:42</strong><span>SB 300 <i /> BB 600</span></div>
        <div className="pp-phone-stats"><span><strong>34</strong><small>Players</small></span><span><strong>$2,500</strong><small>Prize pool</small></span></div>
        <div className="pp-phone-action"><Music4 size={15} /><span><strong>Song requests are open</strong><small>Pick the next track</small></span><ArrowRight size={14} /></div>
      </div>
    </div>
  );
}

function MusicStory() {
  return (
    <div className="pp-story-music-flow">
      <div className="pp-story-music-search">
        <small>Player Lobby</small>
        <strong>Find a track</strong>
        <div><Search size={13} /><span>Mr. Brightside</span></div>
        <button type="button" tabIndex={-1}><Music4 size={13} /> Request Song</button>
      </div>
      <div className="pp-story-flow-arrow"><span><Check size={13} /></span><small>Queued</small></div>
      <div className="pp-story-queue">
        <small>Poker Jukebox</small>
        <strong>Requests</strong>
        <div><b>1</b><MusicTile /><span><strong>Mr. Brightside</strong><small>The Killers · Alex</small></span><i>Queued</i></div>
        <NowPlaying className="pp-now-playing--story" />
      </div>
    </div>
  );
}

function WinStory() {
  return (
    <div className="pp-story-card pp-story-win">
      <div className="pp-winner-glow" />
      <div className="pp-winner-crown"><Trophy size={25} /></div>
      <small>Tournament Champion</small>
      <strong className="pp-winner-name">Alex</strong>
      <span className="pp-winner-prize">$1,250 <small>for 1st place</small></span>
      <div className="pp-winner-table">
        <span><b>1st</b><strong>Alex</strong><i>$1,250</i></span>
        <span><b>2nd</b><strong>Sam</strong><i>$750</i></span>
        <span><b>3rd</b><strong>Jordan</strong><i>$500</i></span>
      </div>
    </div>
  );
}

const storyLabels: Record<StoryVisualVariant, string> = {
  build: 'Tournament setup wizard with Saturday Championship, 54 players, a 50 dollar buy-in, and a Saturday start time.',
  run: 'Live tournament clock at level four with player, rebuy, add-on, and elimination updates.',
  lobby: 'Mobile Player Lobby showing check-in, seat, tournament clock, prize pool, and open song requests.',
  music: 'A player searches for Mr. Brightside, requests the song, and it appears in the host queue.',
  win: 'Saturday Championship winner Alex receives 1,250 dollars with the final payout results.',
};

export function StoryVisual({ variant, className = '' }: MockupProps & { variant: StoryVisualVariant }) {
  const { ref, active } = useViewportActivity<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`pp-story-visual pp-story-visual--${variant} ${className}`.trim()}
      data-active={active ? 'true' : 'false'}
      role="img"
      aria-label={storyLabels[variant]}
    >
      <div className="pp-story-visual__inner" aria-hidden="true">
        {variant === 'build' && <BuildStory />}
        {variant === 'run' && <RunStory />}
        {variant === 'lobby' && <LobbyStory />}
        {variant === 'music' && <MusicStory />}
        {variant === 'win' && <WinStory />}
      </div>
    </div>
  );
}

export function MusicIntegrationVisual({ className = '' }: MockupProps) {
  const { ref, active } = useViewportActivity<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`pp-music-integration ${className}`.trim()}
      data-active={active ? 'true' : 'false'}
      role="img"
      aria-label="A Player Lobby searches for Mr. Brightside and sends the request to the host Poker Jukebox, where it is queued beside The Nights and a now playing track."
    >
      <div className="pp-music-integration__inner" aria-hidden="true">
        <div className="pp-music-phone">
          <div className="pp-phone-speaker" />
          <div className="pp-music-phone__heading"><small>Player Lobby</small><strong>Request a song</strong></div>
          <div className="pp-music-now"><Equalizer compact /><span><small>Now Playing</small><strong>Sweet Child O' Mine</strong></span></div>
          <label className="pp-music-search"><span>Find a track</span><div><Search size={15} /><strong>Mr. Brightside</strong></div></label>
          <div className="pp-search-result"><MusicTile /><span><strong>Mr. Brightside</strong><small>The Killers</small></span><Check size={14} /></div>
          <button type="button" tabIndex={-1}><Music4 size={14} /> Request Song</button>
          <p><Check size={12} /> Request sent to the host queue</p>
        </div>

        <div className="pp-music-connector"><span><ArrowRight size={18} /></span><small>Player request</small></div>

        <div className="pp-host-queue">
          <div className="pp-host-queue__heading"><span><small>Host controls</small><strong>Poker Jukebox</strong></span><i><b /> Requests on</i></div>
          <div className="pp-host-now"><MusicTile /><span><small>Now Playing</small><strong>Sweet Child O' Mine</strong><em>Guns N' Roses</em></span><Equalizer /></div>
          <div className="pp-host-request-title"><strong>Requests</strong><span>2 queued</span></div>
          <div className="pp-host-request is-featured"><b>1</b><MusicTile /><span><strong>Mr. Brightside</strong><small>The Killers · Alex</small></span><i><Check size={11} /> Queued</i></div>
          <div className="pp-host-request"><b>2</b><MusicTile /><span><strong>The Nights</strong><small>Avicii · Sam</small></span><i>Next</i></div>
          <div className="pp-host-controls"><span>Request limit <strong>1 per 5 min</strong></span><span><i /> On</span></div>
        </div>
      </div>
    </div>
  );
}
