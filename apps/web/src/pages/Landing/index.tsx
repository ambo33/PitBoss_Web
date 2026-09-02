import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Menu,
  Music4,
  Play,
  Sparkles,
  Trophy,
  UsersRound,
  WandSparkles,
  X,
} from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import { featureFlags } from '../../features';
import {
  HeroProductTheater,
  MusicIntegrationVisual,
  StoryVisual,
  type StoryVisualVariant,
} from './components/ProductMockups';
import ScrollReveal from './components/ScrollReveal';
import './marketing.css';

const CinematicDemo = lazy(() => import('./components/CinematicDemo'));
const RecordedCinematicDemo = lazy(() => import('./components/RecordedCinematicDemo'));

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type Story = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
  visual: StoryVisualVariant;
};

const HERO_FEATURES: Array<{ label: string; detail: string; icon: IconComponent }> = [
  { label: 'Wizard', detail: 'in Minutes', icon: WandSparkles },
  { label: 'Live Timer', detail: 'with Breaks', icon: Clock3 },
  { label: 'Manage', detail: 'Players', icon: UsersRound },
  { label: 'Payouts', detail: 'Made Easy', icon: Trophy },
  { label: 'Music', detail: 'Requests', icon: Music4 },
];

const PRODUCT_STORIES: Story[] = [
  {
    id: 'build-it',
    eyebrow: 'Build it',
    title: 'A complete tournament, minus the spreadsheet.',
    description: 'Start with the game details. Set the field, buy-in, and options, then shape the blind structure and payouts before the first hand.',
    details: ['Guided setup', 'Smart blind structures', 'Payout planning'],
    visual: 'build',
  },
  {
    id: 'run-it',
    eyebrow: 'Run it',
    title: 'One clock keeps the whole room moving.',
    description: 'Blinds, breaks, rebuys, add-ons, and eliminations stay organized while you focus on the table—not on tournament admin.',
    details: ['Live blind timer', 'Break reminders', 'Player actions'],
    visual: 'run',
  },
  {
    id: 'bring-everyone-in',
    eyebrow: 'Bring everyone in',
    title: 'Every player gets a front-row seat.',
    description: 'The Player Lobby puts tournament details, the live clock, payouts, and interaction on the phone already in every player’s pocket.',
    details: ['Live tournament details', 'Clock and payouts', 'Mobile-first lobby'],
    visual: 'lobby',
  },
  {
    id: 'control-the-vibe',
    eyebrow: 'Control the vibe',
    title: 'Run the tournament. Let the table pick the soundtrack.',
    description: 'When the host connects Spotify and enables requests, players can search from their lobby and send songs straight into the tournament queue.',
    details: ['Player song search', 'Host-controlled requests', 'Now playing'],
    visual: 'music',
  },
  {
    id: 'finish-strong',
    eyebrow: 'Finish strong',
    title: 'When the final card falls, the finish is ready.',
    description: 'The prize pool, paid places, winner, and final results stay connected from first buy-in through the last hand.',
    details: ['Live prize pool', 'Clear payouts', 'Final results'],
    visual: 'win',
  },
];

function MarketingHeader({ startPath }: { startPath: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const backgroundElements = Array.from(document.querySelectorAll<HTMLElement>(
      '.marketing-page > .marketing-skip-link, .marketing-page > .marketing-header, .marketing-page > main, .marketing-page > footer',
    ));
    const originalBackgroundState = backgroundElements.map((element) => ({
      inert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }));
    backgroundElements.forEach((element) => {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    });
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !menuPanelRef.current) return;
      const focusable = Array.from(
        menuPanelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKeyDown);
      backgroundElements.forEach((element, index) => {
        const originalState = originalBackgroundState[index];
        if (!originalState?.inert) element.removeAttribute('inert');
        if (originalState?.ariaHidden == null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', originalState.ariaHidden);
      });
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className="marketing-header">
        <Link to="/landing" className="marketing-header__brand" aria-label="ThePokerPlanner home">
          <BrandLockup compact showSlogan={false} />
        </Link>
        <nav className="marketing-header__nav" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#product">Product</a>
        </nav>
        <div className="marketing-header__actions">
          <Link to="/login" className="marketing-button marketing-button--quiet">Log in</Link>
          <Link to={startPath} className="marketing-button marketing-button--primary">Get started</Link>
        </div>
        <Link to={startPath} className="marketing-header__mobile-cta">Get started</Link>
        <button
          ref={menuButtonRef}
          type="button"
          className="marketing-header__menu"
          aria-label="Open navigation"
          aria-controls="marketing-mobile-menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>
      </header>

      {menuOpen ? (
        <div className="marketing-menu-backdrop" role="presentation" onMouseDown={closeMenu}>
          <nav
            ref={menuPanelRef}
            id="marketing-mobile-menu"
            className="marketing-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="marketing-menu__top">
              <BrandLockup compact showSlogan={false} />
              <button ref={closeButtonRef} type="button" aria-label="Close navigation" onClick={closeMenu}>
                <X aria-hidden="true" />
              </button>
            </div>
            <a href="#features" onClick={closeMenu}>Features<ChevronRight aria-hidden="true" /></a>
            <a href="#how-it-works" onClick={closeMenu}>How it works<ChevronRight aria-hidden="true" /></a>
            <a href="#product" onClick={closeMenu}>Product<ChevronRight aria-hidden="true" /></a>
            <Link to="/login" onClick={closeMenu}>Log in<ChevronRight aria-hidden="true" /></Link>
            <Link to={startPath} className="marketing-button marketing-button--primary" onClick={closeMenu}>
              Create Tournament<ArrowRight aria-hidden="true" />
            </Link>
          </nav>
        </div>
      ) : null}
    </>
  );
}

function FeatureStrip() {
  return (
    <div className="marketing-feature-strip" role="list" aria-label="Product highlights">
      {HERO_FEATURES.map(({ label, detail, icon: Icon }) => (
        <div key={label} role="listitem">
          <Icon aria-hidden="true" />
          <span><strong>{label}</strong>{detail}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  titleId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  titleId?: string;
}) {
  return (
    <div className="marketing-section-heading">
      <span className="marketing-eyebrow">{eyebrow}</span>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(query).matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const onChange = () => setMatches(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

function LazyCinematicDemo() {
  const slotRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [recordingFailed, setRecordingFailed] = useState(false);
  const useRecording = useMediaQuery('(min-width: 701px)') && !recordingFailed;

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    if (!('IntersectionObserver' in window)) {
      setReady(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || entry.intersectionRatio <= 0) return;
      setReady(true);
      observer.disconnect();
    }, {
      rootMargin: useRecording ? '0px 0px -8% 0px' : '650px 0px',
      threshold: useRecording ? 0.01 : 0,
    });
    observer.observe(slot);
    return () => observer.disconnect();
  }, [useRecording]);

  return (
    <div
      ref={slotRef}
      className={`marketing-cinema__demo-slot${useRecording ? ' marketing-cinema__demo-slot--recorded' : ''}`}
    >
      {ready ? (
        <Suspense fallback={<div className="marketing-cinema__demo-placeholder" aria-hidden="true" />}>
          {useRecording ? (
            <RecordedCinematicDemo onPlaybackError={() => setRecordingFailed(true)} />
          ) : (
            <CinematicDemo variant="embedded" autoplay controls />
          )}
        </Suspense>
      ) : <div className="marketing-cinema__demo-placeholder" aria-hidden="true" />}
    </div>
  );
}

function ProductStory({ story, index }: { story: Story; index: number }) {
  return (
    <ScrollReveal
      as="article"
      className={`marketing-story${index % 2 === 1 ? ' marketing-story--reverse' : ''}`}
    >
      <div className="marketing-story__copy">
        <span className="marketing-story__number" aria-hidden="true">0{index + 1}</span>
        <span className="marketing-eyebrow">{story.eyebrow}</span>
        <h3>{story.title}</h3>
        <p>{story.description}</p>
        <ul aria-label={`${story.eyebrow} highlights`}>
          {story.details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>
      </div>
      <div className="marketing-story__visual">
        <StoryVisual variant={story.visual} />
      </div>
    </ScrollReveal>
  );
}

function MarketingFooter({ startPath }: { startPath: string }) {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer__brand">
        <BrandLockup compact showSlogan={false} />
        <p>Your poker night. Completely organized.</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link to="/login">Log in</Link>
        <Link to={startPath}>Create Tournament</Link>
        <Link to="/demo">Full Demo</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/terms">Terms</Link>
      </nav>
    </footer>
  );
}

export default function LandingPage() {
  const startPath = featureFlags.deferredAuthQuickStart ? '/quick-start' : '/login?mode=register';

  return (
    <div className="marketing-page">
      <a className="marketing-skip-link" href="#marketing-main">Skip to content</a>
      <MarketingHeader startPath={startPath} />

      <main id="marketing-main" tabIndex={-1}>
        <section className="marketing-hero" aria-labelledby="marketing-hero-title">
          <div className="marketing-hero__copy">
            <span className="marketing-eyebrow">Poker nights, organized</span>
            <h1 id="marketing-hero-title"><span>Build.</span><span>Run.</span><span>Win.</span></h1>
            <p>
              Create tournaments in minutes, run the clock with confidence, and keep the table energized with{' '}
              <strong>music requests from players.</strong>
            </p>
            <div className="marketing-hero__actions">
              <Link to={startPath} className="marketing-button marketing-button--primary marketing-button--hero">
                Create Tournament<ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/demo" className="marketing-button marketing-button--secondary marketing-button--hero">
                <Play aria-hidden="true" />Demo Full Experience
              </Link>
            </div>
          </div>

          <div className="marketing-hero__theater">
            <HeroProductTheater />
          </div>

          <FeatureStrip />
        </section>

        <section id="how-it-works" className="marketing-cinema" aria-labelledby="cinema-title">
          <ScrollReveal>
            <SectionHeading
              eyebrow="The full night, in motion"
              title="See your poker night come alive."
              description="From setup to final table, ThePokerPlanner keeps everything moving—and keeps everyone in the moment."
              titleId="cinema-title"
            />
          </ScrollReveal>
          <LazyCinematicDemo />
          <div className="marketing-cinema__footer">
            <span>A complete product walkthrough, recorded from the live showcase.</span>
            <Link to="/demo-showcase?autoplay=true">Open live showcase<ArrowRight aria-hidden="true" /></Link>
          </div>
        </section>

        <ScrollReveal as="section" className="marketing-maturity">
          <div className="marketing-maturity__mark" aria-hidden="true"><span>10</span><small>years</small></div>
          <div>
            <span className="marketing-eyebrow">10 years in the making</span>
            <h2>Built from years of running real poker nights.</h2>
            <p>Not from a weekend feature list.</p>
          </div>
        </ScrollReveal>

        <section id="features" className="marketing-stories" aria-labelledby="stories-title">
          <ScrollReveal>
            <SectionHeading
              eyebrow="One connected tournament"
              title="From first chip to final payout."
              description="The host, the table, and the TV stay connected through every phase of the night."
              titleId="stories-title"
            />
          </ScrollReveal>
          <div className="marketing-stories__list">
            {PRODUCT_STORIES.map((story, index) => <ProductStory key={story.id} story={story} index={index} />)}
          </div>
        </section>

        <section id="product" className="marketing-music" aria-labelledby="music-title">
          <ScrollReveal className="marketing-music__copy">
            <span className="marketing-eyebrow marketing-eyebrow--music"><Music4 aria-hidden="true" />Player Lobby music</span>
            <h2 id="music-title">The table picks the soundtrack.</h2>
            <p>Connect Spotify and give players access to music requests directly from their Player Lobby.</p>
            <p className="marketing-music__support">You stay in control. Players make requests. The tournament keeps moving.</p>
            <ul>
              <li><span>01</span>Host connects Spotify and enables requests</li>
              <li><span>02</span>Players search and request from their lobby</li>
              <li><span>03</span>The queue and Now Playing stay visible</li>
            </ul>
          </ScrollReveal>
          <ScrollReveal className="marketing-music__visual" delay={120}>
            <MusicIntegrationVisual />
          </ScrollReveal>
        </section>

        <section className="marketing-final-cta" aria-labelledby="final-cta-title">
          <div className="marketing-final-cta__glow" aria-hidden="true" />
          <img
            src="/marketing/medallion-512.webp"
            srcSet="/marketing/medallion-256.webp 256w, /marketing/medallion-512.webp 512w, /marketing/medallion-768.webp 768w"
            sizes="(max-width: 699px) 180px, 320px"
            width="768"
            height="768"
            loading="lazy"
            decoding="async"
            alt=""
          />
          <ScrollReveal className="marketing-final-cta__copy">
            <span className="marketing-eyebrow"><Sparkles aria-hidden="true" />Your next poker night</span>
            <h2 id="final-cta-title">Your next poker night starts here.</h2>
            <p>Build your tournament in minutes. Run the whole night with confidence.</p>
            <div className="marketing-final-cta__actions">
              <Link to={startPath} className="marketing-button marketing-button--primary marketing-button--hero">
                Create Tournament<ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/demo" className="marketing-button marketing-button--secondary marketing-button--hero">
                <Play aria-hidden="true" />Try the Demo
              </Link>
            </div>
          </ScrollReveal>
        </section>
      </main>

      <MarketingFooter startPath={startPath} />
    </div>
  );
}
