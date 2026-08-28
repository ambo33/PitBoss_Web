import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Layers3,
  Menu,
  Play,
  ShieldCheck,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import { featureFlags } from '../../features';
import './marketing.css';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type MarketingArtName = 'calendar' | 'players' | 'timer' | 'blinds' | 'trophy' | 'medallion';

type FeatureSplash = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  benefits: string[];
  art: MarketingArtName;
  icon: IconComponent;
};

const FEATURE_CARDS: FeatureSplash[] = [
  {
    id: 'schedule',
    eyebrow: 'Set the night',
    title: 'Schedule tournaments',
    description: 'Create the game, share it with your group, and keep every RSVP in one place.',
    benefits: ['Shared game calendar', 'Group and league RSVPs', 'Automatic reminders'],
    art: 'calendar',
    icon: CalendarDays,
  },
  {
    id: 'players',
    eyebrow: 'Run the room',
    title: 'Manage players',
    description: 'Track arrivals, seating, rebuys, add-ons, knockouts, and results without a side spreadsheet.',
    benefits: ['QR check-in', 'Live seat assignments', 'Player history'],
    art: 'players',
    icon: Users,
  },
  {
    id: 'clock',
    eyebrow: 'Keep it moving',
    title: 'Run the clock',
    description: 'A synchronized tournament timer keeps the host, players, and TV board on the same level.',
    benefits: ['Blind-level timer', 'Break and chip-up markers', 'Room announcements'],
    art: 'timer',
    icon: Clock3,
  },
  {
    id: 'payouts',
    eyebrow: 'Finish cleanly',
    title: 'Payouts made easy',
    description: 'Set the paid places up front and let the prize pool update as the field checks in.',
    benefits: ['Flexible payout splits', 'Bounty tracking', 'Shareable recaps'],
    art: 'trophy',
    icon: Trophy,
  },
];

const SPLASHES: FeatureSplash[] = [
  FEATURE_CARDS[0],
  FEATURE_CARDS[1],
  FEATURE_CARDS[2],
  {
    id: 'blinds',
    eyebrow: 'Build the structure',
    title: 'Blinds that fit the night',
    description: 'Create a blind schedule around your field, chip set, target duration, and break plan.',
    benefits: ['Guided blind calculator', 'Saved group structures', 'Chip-up planning'],
    art: 'blinds',
    icon: Layers3,
  },
  FEATURE_CARDS[3],
  {
    id: 'command-center',
    eyebrow: 'See the whole season',
    title: 'One command center',
    description: 'Upcoming games, groups, leagues, player stories, and results stay connected after the cards are put away.',
    benefits: ['Groups and leagues', 'Standings and history', 'Device alerts'],
    art: 'medallion',
    icon: ShieldCheck,
  },
];

function MarketingArt({
  name,
  alt,
  className = '',
  eager = false,
}: {
  name: MarketingArtName;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      src={`/marketing/${name}-512.webp`}
      srcSet={`/marketing/${name}-256.webp 256w, /marketing/${name}-512.webp 512w, /marketing/${name}-768.webp 768w`}
      sizes="(max-width: 767px) 220px, (max-width: 1023px) 320px, 420px"
      width="768"
      height="768"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
      alt={alt}
    />
  );
}

function TournamentPreview() {
  const blindLevels = [
    ['1', '100 / 200'],
    ['2', '150 / 300'],
    ['3', '200 / 400'],
    ['4', '300 / 600'],
    ['5', '400 / 800'],
  ];
  const payouts = [
    ['1st', '$1,250'],
    ['2nd', '$750'],
    ['3rd', '$450'],
    ['4th', '$300'],
    ['5th', '$200'],
  ];

  return (
    <div className="marketing-preview-wrap" aria-label="Example tournament control board">
      <div className="marketing-preview">
        <header className="marketing-preview__header">
          <div>
            <span>TOURNAMENT DISPLAY</span>
            <strong>Saturday Championship</strong>
          </div>
          <span className="marketing-preview__code">TV 478381</span>
        </header>

        <div className="marketing-preview__body">
          <section className="marketing-preview__rail" aria-label="Blind structure preview">
            <div className="marketing-preview__section-title">BLIND STRUCTURE</div>
            {blindLevels.map(([level, blinds]) => (
              <div className={`marketing-preview__row${level === '4' ? ' is-active' : ''}`} key={level}>
                <span>{level}</span>
                <span>{blinds}</span>
              </div>
            ))}
          </section>

          <section className="marketing-preview__clock" aria-label="Tournament timer preview">
            <span className="marketing-preview__running">RUNNING</span>
            <strong className="marketing-preview__time">18:42</strong>
            <div className="marketing-preview__clock-stats">
              <div><span>CURRENT BLINDS</span><strong>300 / 600</strong></div>
              <div><span>PLAYERS LEFT</span><strong>18 / 54</strong></div>
            </div>
            <div className="marketing-preview__controls" aria-hidden="true">
              <span>Pause</span><span>Next level</span><span>Adjust timer</span>
            </div>
          </section>

          <section className="marketing-preview__rail marketing-preview__payouts" aria-label="Payout preview">
            <div className="marketing-preview__section-title">PAYOUTS</div>
            {payouts.map(([place, amount]) => (
              <div className="marketing-preview__row" key={place}>
                <strong>{place}</strong><span>{amount}</span>
              </div>
            ))}
          </section>
        </div>

        <div className="marketing-preview__metrics" aria-label="Tournament status preview">
          <div><strong>18</strong><span>Players left</span></div>
          <div><strong>5</strong><span>Rebuys</span></div>
          <div><strong>2</strong><span>Add-ons</span></div>
          <div><strong>24.5K</strong><span>Avg stack</span></div>
        </div>
      </div>
      <MarketingArt name="trophy" alt="" className="marketing-preview__trophy" eager />
      <MarketingArt name="medallion" alt="" className="marketing-preview__chip" eager />
    </div>
  );
}

function FeatureSplashSection({ feature, index }: { feature: FeatureSplash; index: number }) {
  const Icon = feature.icon;
  return (
    <article id={feature.id} className={`marketing-splash${index % 2 ? ' marketing-splash--reverse' : ''}`}>
      <div className="marketing-splash__art" aria-hidden="true">
        <MarketingArt name={feature.art} alt="" />
      </div>
      <div className="marketing-splash__copy">
        <span className="marketing-eyebrow">{feature.eyebrow}</span>
        <h3>{feature.title}</h3>
        <p>{feature.description}</p>
        <ul>
          {feature.benefits.map((benefit) => (
            <li key={benefit}><Check aria-hidden="true" />{benefit}</li>
          ))}
        </ul>
        <div className="marketing-splash__icon" aria-hidden="true"><Icon /></div>
      </div>
    </article>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const startPath = featureFlags.deferredAuthQuickStart ? '/quick-start' : '/login?mode=register';
  const startLabel = featureFlags.deferredAuthQuickStart ? 'Quick Tournament' : 'Get started';

  useEffect(() => {
    if (!menuOpen) return;
    closeButtonRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="marketing-page">
      <header className="marketing-header">
        <Link to="/landing" className="marketing-header__brand" aria-label="ThePokerPlanner home">
          <BrandLockup compact showSlogan={false} />
        </Link>
        <nav className="marketing-header__nav" aria-label="Marketing navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#capabilities">Product</a>
        </nav>
        <div className="marketing-header__actions">
          <Link to="/login" className="marketing-button marketing-button--quiet">Log in</Link>
          <Link to={startPath} className="marketing-button marketing-button--primary">{startLabel}</Link>
        </div>
        <button
          type="button"
          className="marketing-header__menu"
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>
      </header>

      {menuOpen && (
        <div className="marketing-menu-backdrop" role="presentation" onMouseDown={closeMenu}>
          <aside
            className="marketing-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="marketing-menu__top">
              <BrandLockup compact showSlogan={false} />
              <button ref={closeButtonRef} type="button" aria-label="Close navigation" onClick={closeMenu}><X aria-hidden="true" /></button>
            </div>
            <a href="#features" onClick={closeMenu}>Features<ChevronRight aria-hidden="true" /></a>
            <a href="#how-it-works" onClick={closeMenu}>How it works<ChevronRight aria-hidden="true" /></a>
            <a href="#capabilities" onClick={closeMenu}>Product<ChevronRight aria-hidden="true" /></a>
            <Link to="/login" onClick={closeMenu}>Log in<ChevronRight aria-hidden="true" /></Link>
            <Link to={startPath} className="marketing-button marketing-button--primary" onClick={closeMenu}>{startLabel}</Link>
          </aside>
        </div>
      )}

      <main>
        <section className="marketing-hero">
          <div className="marketing-hero__copy">
            <span className="marketing-eyebrow">POKER NIGHTS, ORGANIZED</span>
            <h1>
              <span className="marketing-hero__line marketing-hero__line--light">Build.</span>
              <span className="marketing-hero__line marketing-hero__line--light">Run.</span>
              <span className="marketing-hero__line">Win.</span>
            </h1>
            <p>Create tournaments in minutes, run the clock with confidence, and pay out winners <strong>stress free.</strong></p>
            {featureFlags.deferredAuthQuickStart && (
              <p className="marketing-hero__subcopy">No account needed to start. Ready in under a minute.</p>
            )}
            <div className="marketing-hero__actions">
              <Link to={startPath} className="marketing-button marketing-button--primary marketing-button--hero">
                <Zap aria-hidden="true" />{featureFlags.deferredAuthQuickStart ? 'Quick Tournament' : 'Create Tournament'}
              </Link>
              <Link to="/demo" className="marketing-button marketing-button--secondary marketing-button--hero">
                <Play aria-hidden="true" />Demo Full Experience<ChevronRight aria-hidden="true" />
              </Link>
            </div>
            <div className="marketing-highlight-rail" aria-label="Product highlights">
              <div><CalendarDays aria-hidden="true" /><span>Wizard<strong>in Minutes</strong></span></div>
              <div><Clock3 aria-hidden="true" /><span>Live Timer<strong>with Breaks</strong></span></div>
              <div><Users aria-hidden="true" /><span>Manage<strong>Players</strong></span></div>
              <div><Trophy aria-hidden="true" /><span>Payouts<strong>Made Easy</strong></span></div>
            </div>
          </div>
          <TournamentPreview />
        </section>

        <section id="features" className="marketing-feature-grid" aria-labelledby="features-heading">
          <div className="marketing-section-heading">
            <span className="marketing-eyebrow">One connected night</span>
            <h2 id="features-heading">Everything a host needs at the table</h2>
          </div>
          <div className="marketing-feature-grid__items">
            {FEATURE_CARDS.map((feature) => {
              const Icon = feature.icon;
              return (
                <a href={`#${feature.id}`} className="marketing-feature-card" key={feature.id}>
                  <MarketingArt name={feature.art} alt="" />
                  <div>
                    <span className="marketing-feature-card__icon"><Icon aria-hidden="true" /></span>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                  <ChevronRight aria-hidden="true" />
                </a>
              );
            })}
          </div>
        </section>

        <section id="how-it-works" className="marketing-steps" aria-labelledby="steps-heading">
          <div className="marketing-section-heading">
            <span className="marketing-eyebrow">From invite to winner</span>
            <h2 id="steps-heading">Run the night in three moves</h2>
          </div>
          <div className="marketing-steps__grid">
            <article><span>1</span><CalendarDays aria-hidden="true" /><h3>Set the game</h3><p>Choose the group, date, buy-in, field, and blind structure.</p></article>
            <article><span>2</span><Users aria-hidden="true" /><h3>Check in and seat</h3><p>Confirm the field, settle entries, and create the seating chart.</p></article>
            <article><span>3</span><Trophy aria-hidden="true" /><h3>Run and recap</h3><p>Advance the clock, track results, and share the final finish.</p></article>
          </div>
        </section>

        <section id="capabilities" className="marketing-splashes" aria-labelledby="capabilities-heading">
          <div className="marketing-section-heading">
            <span className="marketing-eyebrow">Made for live poker</span>
            <h2 id="capabilities-heading">The room stays in sync</h2>
          </div>
          {SPLASHES.map((feature, index) => <FeatureSplashSection key={feature.id} feature={feature} index={index} />)}
        </section>

        <section className="marketing-final-cta">
          <MarketingArt name="medallion" alt="" />
          <div>
            <span className="marketing-eyebrow">Your next game starts here</span>
            <h2>Run the night. Enjoy the table.</h2>
            <p>Try a complete tournament without creating an account, or set up your first group when you are ready.</p>
          </div>
          <div className="marketing-final-cta__actions">
            <Link to={startPath} className="marketing-button marketing-button--primary"><Zap aria-hidden="true" />{featureFlags.deferredAuthQuickStart ? 'Quick Tournament' : 'Create account'}</Link>
            <Link to="/demo" className="marketing-button marketing-button--secondary"><Play aria-hidden="true" />Run the demo<ChevronRight aria-hidden="true" /></Link>
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <BrandLockup compact showSlogan={false} />
        <p>Run better poker nights.</p>
        <nav aria-label="Footer navigation">
          <Link to="/login">Log in</Link>
          <Link to={startPath}>{featureFlags.deferredAuthQuickStart ? 'Quick Tournament' : 'Create account'}</Link>
          <a href="/terms/">Terms</a>
        </nav>
      </footer>
    </div>
  );
}
