import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BadgeCheck, Clock3, Crown, LockKeyhole, Sparkles, Users } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';

const hostFeatures = [
  'Blind timer',
  'Blind calculator & 1 saved structure',
  'TV display and player lobby',
  'Basic payouts for 1, 2, or 3 places',
  'Basic QR actions for check-in and lobby access',
  'Rebuy/Add-on tracking',
  '1 hosted group',
  '1 upcoming hosted tournament',
  'Future public tier keeps casual hosting approachable',
];

const clubFeatures = [
  'Everything in Host',
  'Player avatars and entrance songs',
  'Player-level rebuy and add-on tracking',
  'Knockout tracking by player',
  'Player history, stats, standings, and game history',
  'Advanced payout structures',
  'Multiple saved blind structures',
  'Custom run/TV branding and colors',
  'Priority email support',
];

const proFeatures = [
  'Season ranges and leaderboards',
  'Multi-club operations',
  'Advanced league administration',
  'Expanded branding controls',
  'More automation for recurring games',
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-pit-bg text-white">
      <section className="relative overflow-hidden border-b border-pit-border">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_8%,rgba(14,165,165,0.18),transparent_30%),radial-gradient(circle_at_78%_12%,rgba(240,165,0,0.10),transparent_24%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <Link to="/" aria-label="ThePokerPlanner home">
              <BrandLockup compact />
            </Link>
            <nav className="flex items-center gap-2">
              <Link className="hidden px-3 py-2 text-sm font-medium text-pit-text transition-colors hover:text-white sm:inline-flex" to="/landing">Overview</Link>
              <Link className="btn-ghost px-3 py-2 text-xs sm:text-sm" to="/login">Sign in</Link>
              <Link className="btn-primary px-3 py-2 text-xs sm:text-sm" to="/login?mode=register">Create account</Link>
            </nav>
          </header>

          <div className="mx-auto max-w-4xl py-16 text-center sm:py-20">
            <p className="mb-4 inline-flex rounded-full border border-pit-teal/30 bg-pit-teal/10 px-3 py-1 text-xs font-semibold uppercase text-pit-teal">
              Beta Access
            </p>
            <h1 className="text-4xl font-black leading-tight text-white sm:text-6xl">
              Every feature is free during beta.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-pit-text sm:text-lg">
              Help us shape ThePokerPlanner while it is in beta. If paid tiers happen later, beta users will receive discounted rates as a thank-you for testing early.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-10">
        <div className="mb-8 rounded-2xl border border-pit-teal/30 bg-pit-teal/10 p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-pit-teal">
                <Sparkles size={18} />
                <p className="text-sm font-semibold uppercase">Beta promise</p>
              </div>
              <h2 className="text-2xl font-bold text-white">No beta paywalls. No surprise lockouts.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-pit-text">
                During beta, Host, Club, and Pro-style features are available so real poker nights can test the full product. Future paid tiers are shown as a roadmap, not a current checkout.
              </p>
            </div>
            <Link className="btn-primary shrink-0 px-5 py-3" to="/login?mode=register">Join the beta</Link>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <PlanCard
            name="Host"
            eyebrow="Beta included"
            price="Free"
            cadence="during beta"
            icon={<Users size={22} />}
            description="Host is the future entry tier for casual games. In beta, these limits are relaxed so testers can run real events."
            features={hostFeatures}
            cta="Join beta"
            ctaHref="/login?mode=register"
          />

          <PlanCard
            name="Club"
            eyebrow="Beta included"
            price="Free"
            cadence="during beta"
            secondaryPrice="Future target: $2.99/mo annually or $4.99 monthly"
            icon={<Crown size={22} />}
            featured
            description="Club is where recurring groups get smoother: player histories, detailed tracking, deeper payout tools, and more identity for your players."
            features={clubFeatures}
            cta="Use Club features"
            ctaHref="/login?mode=register"
          />

          <PlanCard
            name="Pro"
            eyebrow="In Development"
            price="Contact Us"
            cadence="for larger leagues"
            icon={<LockKeyhole size={22} />}
            description="Pro is reserved for bigger league and multi-group workflows. Beta feedback will help decide what belongs here."
            features={proFeatures}
            comingSoon
          />
        </div>
      </section>

      <section className="border-y border-pit-border bg-pit-surface/30">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold uppercase text-pit-teal">Future tiers</p>
            <h2 className="mt-2 text-3xl font-bold text-white">The roadmap is useful, but beta access is wide open.</h2>
            <p className="mt-3 text-sm leading-6 text-pit-text">
              We still think Host and Club are the right shape long term. For beta, every tester gets the full set so we can learn what actually matters at a table.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ComparisonCard
              icon={<Clock3 size={20} />}
              title="Host keeps game night moving"
              body="Use the clock, TV display, QR check-in flow, basic payouts, and simple tournament-level rebuy/add-on counters. You can still run a clean game without tracking every action to a specific player."
            />
            <ComparisonCard
              icon={<BadgeCheck size={20} />}
              title="Club tracks the people behind the game"
              body="Club adds player-level rebuys, add-ons, knockouts, avatars, entrance songs, stats, history, standings, advanced payouts, group posts, polls, and more saved structures for groups that play regularly."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <div className="rounded-2xl border border-pit-border bg-pit-card p-6 text-center sm:p-8">
          <h2 className="text-3xl font-bold text-white">Beta testers help decide what this becomes.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-pit-text">
            Run real games, send feedback, and tell us what feels missing. Beta users will receive discounted rates if paid tiers launch later.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link className="btn-primary px-5 py-3" to="/login?mode=register">Create account</Link>
            <Link className="btn-ghost px-5 py-3" to="/landing">See the product</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function PlanCard({
  name,
  eyebrow,
  price,
  cadence,
  secondaryPrice,
  icon,
  description,
  features,
  cta,
  ctaHref,
  featured = false,
  comingSoon = false,
}: {
  name: string;
  eyebrow: string;
  price: string;
  cadence: string;
  secondaryPrice?: string;
  icon: ReactNode;
  description: string;
  features: string[];
  cta?: string;
  ctaHref?: string;
  featured?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <article className={`relative rounded-2xl border p-5 ${featured ? 'border-pit-teal bg-pit-card shadow-[0_0_42px_rgba(14,165,165,0.16)]' : 'border-pit-border bg-pit-card'}`}>
      {featured && (
        <div className="absolute right-4 top-4 rounded-full bg-pit-teal px-3 py-1 text-xs font-bold uppercase text-white">
          Most hosts
        </div>
      )}
      <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl border ${featured ? 'border-pit-teal/40 bg-pit-teal/15 text-pit-teal' : 'border-pit-border bg-pit-bg text-pit-text'}`}>
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase text-pit-teal">{eyebrow}</p>
      <h3 className="mt-1 text-3xl font-black text-white">{name}</h3>
      <div className="mt-5">
        <p className="text-4xl font-black text-white">{price}</p>
        <p className="mt-1 text-sm text-pit-text">{cadence}</p>
        {secondaryPrice && <p className="mt-1 text-xs text-pit-muted">{secondaryPrice}</p>}
      </div>
      <p className="mt-5 text-sm leading-6 text-pit-text">{description}</p>
      <ul className="mt-5 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm leading-5 text-pit-text">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pit-teal" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {ctaHref && (
        <Link className={`${featured ? 'btn-primary' : 'btn-ghost'} mt-6 w-full py-2.5 ${comingSoon ? 'opacity-80' : ''}`} to={ctaHref}>
          {cta ?? 'Learn more'}
        </Link>
      )}
    </article>
  );
}

function ComparisonCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-xl border border-pit-border bg-pit-card p-5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-pit-teal/25 bg-pit-teal/10 text-pit-teal">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-pit-text">{body}</p>
    </article>
  );
}
