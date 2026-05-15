import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Clock3, QrCode, Users } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';

const features = [
  {
    title: 'Run the room',
    body: 'A clean tournament command center for blinds, payouts, field counts, QR flows, and player actions.',
    icon: Clock3,
  },
  {
    title: 'Move players faster',
    body: 'Hosts can check players in, handle guests, add rebuys, assign seats, and keep the table moving.',
    icon: Users,
  },
  {
    title: 'Put it on any screen',
    body: 'Use a TV board, player lobby, and Pocket Admin so the tournament state is visible where it matters.',
    icon: QrCode,
  },
];

const steps = [
  'Create a group and schedule a tournament.',
  'Build the blind structure and payout plan.',
  'Display the board, scan players in, and run the night.',
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-pit-bg text-white">
      <section className="relative overflow-hidden border-b border-pit-border bg-[#111113]">
        <div className="absolute inset-0 opacity-70">
          <div className="h-full w-full bg-[radial-gradient(circle_at_28%_12%,rgba(14,165,165,0.20),transparent_30%),radial-gradient(circle_at_78%_8%,rgba(240,165,0,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_58%)]" />
        </div>

        <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <BrandLockup compact />
            <nav className="flex items-center gap-2">
              <Link className="hidden px-3 py-2 text-sm font-medium text-pit-text transition-colors hover:text-white sm:inline-flex" to="/pricing">Pricing</Link>
              <Link className="btn-ghost px-3 py-2 text-xs sm:text-sm" to="/login">Sign in</Link>
              <Link className="btn-primary px-3 py-2 text-xs sm:text-sm" to="/login?mode=register">Create account</Link>
            </nav>
          </header>

          <div className="mt-5 rounded-2xl border border-pit-teal/25 bg-pit-teal/10 px-4 py-3 text-sm text-pit-text shadow-[0_18px_60px_rgba(0,0,0,0.25)] sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <span className="font-semibold text-white">PokerPlanner.bet is getting ready for launch.</span>
              <span className="ml-1">Beta is live with every feature free for testers.</span>
            </div>
            <Link className="mt-3 inline-flex text-sm font-semibold text-pit-teal hover:text-pit-teal/80 sm:mt-0" to="/pricing">
              See beta access
            </Link>
          </div>

          <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(560px,1.1fr)] lg:py-16">
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex rounded-full border border-pit-teal/30 bg-pit-teal/10 px-3 py-1 text-xs font-semibold uppercase text-pit-teal">
                Poker nights, organized
              </p>
              <h1 className="text-5xl font-black leading-[0.98] text-white sm:text-6xl lg:text-7xl">
                Run Better Poker Nights
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-pit-text">
                PokerPlanner.bet gives home-game hosts the tools to plan tournaments, check players in, run the clock, show the TV board, and keep everyone on the same page.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="btn-primary px-5 py-3" to="/login?mode=register">Start hosting</Link>
                <Link className="btn-ghost px-5 py-3" to="/pricing">Beta access</Link>
                <Link className="btn-ghost px-5 py-3" to="/login">I already have an account</Link>
              </div>
              <div className="mt-8 grid max-w-lg gap-2 text-sm text-pit-text sm:grid-cols-3">
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

            <HeroBoard />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase text-pit-teal">Built for live games</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Everything the host touches, fewer things to explain.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-pit-text">
            The app is designed around tournament night: quick decisions, visible information, and player-facing QR flows that keep people from crowding the host.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="rounded-xl border border-pit-border bg-pit-card p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-pit-teal/25 bg-pit-teal/10 text-pit-teal">
                  <Icon size={22} />
                </div>
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-pit-text">{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-pit-border bg-pit-surface/30">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="mb-8">
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
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <div className="rounded-2xl border border-pit-border bg-pit-card p-6 sm:p-8 lg:flex lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white">Ready for the next poker night?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-pit-text">
              Beta access is open: run real games with the full feature set and help shape what comes next.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 lg:mt-0">
            <Link className="btn-primary px-5 py-3" to="/login?mode=register">Create account</Link>
            <Link className="btn-ghost px-5 py-3" to="/pricing">Beta details</Link>
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
      <div className="rounded-2xl border border-white/10 bg-pit-card p-3 shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        <div className="rounded-xl border border-pit-border bg-[#151519] p-3">
          <div className="mb-3 flex items-center justify-between border-b border-pit-border pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-pit-muted">Tournament Display</p>
              <h2 className="text-lg font-bold text-white">Saturday Championship</h2>
            </div>
            <BrandLockup compact showSlogan={false} className="scale-90" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[150px_minmax(0,1fr)_150px]">
            <MiniStructure />
            <div className="rounded-xl border border-pit-border bg-black/25 p-4 text-center">
              <p className="text-xs font-semibold uppercase text-pit-text">Level 4 of 12</p>
              <p className="mt-3 font-mono text-6xl font-black leading-none text-white sm:text-7xl">18:42</p>
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
    <article className="overflow-hidden rounded-2xl border border-pit-border bg-pit-card">
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
