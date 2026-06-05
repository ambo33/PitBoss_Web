import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Calculator, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Mail, Play, QrCode, UserCheck, Users } from 'lucide-react';

interface FirstRunTutorialProps {
  displayName?: string | null;
  completing?: boolean;
  onComplete: () => void;
}

type TutorialStep = {
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof Users;
  bullets: string[];
  highlight: 'group' | 'invite' | 'details' | 'blinds' | 'checkin' | 'run';
};

const steps: TutorialStep[] = [
  {
    eyebrow: 'Start here',
    title: 'Every game lives inside a group.',
    body: 'Groups are the home base for your players, invites, posts, saved blind structures, voice settings, and every tournament or cash game you host.',
    icon: Users,
    highlight: 'group',
    bullets: [
      'Give the group a clear name.',
      'Use the join code when players are nearby.',
      'Admins can approve members before they see private details.',
    ],
  },
  {
    eyebrow: 'Build the roster',
    title: 'Invite players without making it awkward.',
    body: 'After the group exists, you can email an invite or share a QR/link through text. Players create an account, join the group, and land in the right place.',
    icon: Mail,
    highlight: 'invite',
    bullets: [
      'Email invites work best for registered players.',
      'QR links are easy to text to a home-game thread.',
      'Pending members can be approved from the group page.',
    ],
  },
  {
    eyebrow: 'Host the first game',
    title: 'Set the tournament basics.',
    body: 'The first required pieces are simple: tournament name, schedule, group, buy-in, and player cap. The rest can stay lightweight until your room needs it.',
    icon: Calendar,
    highlight: 'details',
    bullets: [
      'Attach the tournament to the group you just made.',
      'Buy-in and max players drive payouts and planning.',
      'Rebuys, add-ons, and bounties stay optional.',
    ],
  },
  {
    eyebrow: 'Blinds',
    title: 'Use the calculator to shape the night.',
    body: 'The blind calculator builds a structure around your chip set, target duration, starting stack, and breaks. You can tweak levels before saving.',
    icon: Calculator,
    highlight: 'blinds',
    bullets: [
      'Small blind, big blind, ante, and time stay editable.',
      'Chip-up moments can pause the clock when needed.',
      'Saved structures can be reused by the same group.',
    ],
  },
  {
    eyebrow: 'Game night',
    title: 'Check in players as they arrive.',
    body: 'At the start of the event, players settle with the host and get checked in. QR check-in is smoother because it also drops them into the player lobby.',
    icon: QrCode,
    highlight: 'checkin',
    bullets: [
      'Use the Players tab for manual check-ins.',
      'Use the QR flow when players have their phone handy.',
      'Only checked-in players should be seated and counted live.',
    ],
  },
  {
    eyebrow: 'Run the room',
    title: 'Seat players, start the clock, then run it.',
    body: 'Once the field is checked in, use Run Tournament to seat players, open the TV board, start or pause the clock, and record knockouts.',
    icon: Play,
    highlight: 'run',
    bullets: [
      'Re-seat remaining players when tables need balancing.',
      'Start and pause the clock from the Timer view.',
      'Record knockouts so placements, payouts, and stats stay clean.',
    ],
  },
];

export default function FirstRunTutorial({ displayName, completing = false, onComplete }: FirstRunTutorialProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const Icon = step.icon;
  const firstName = useMemo(() => displayName?.trim().split(/\s+/)[0] ?? '', [displayName]);
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-pit-bg">
      <div className="min-h-full bg-[radial-gradient(circle_at_16%_10%,rgba(20,184,181,0.2),transparent_28%),radial-gradient(circle_at_86%_16%,rgba(139,92,246,0.14),transparent_26%),linear-gradient(180deg,rgba(18,46,48,0.52),rgba(8,8,11,0.96)_44%,#08080b)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-6xl flex-col">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/branding/the-poker-planner-logo-192.png" alt="ThePokerPlanner" className="h-10 w-10 rounded-full bg-black object-contain" />
              <div>
                <p className="text-sm font-black text-white">ThePokerPlanner</p>
                <p className="text-xs text-pit-muted">First-run walkthrough</p>
              </div>
            </div>
            <span className="rounded-full border border-pit-border bg-pit-card/80 px-3 py-1 text-xs font-semibold text-pit-text">
              {stepIndex + 1} of {steps.length}
            </span>
          </header>

          <main className="grid flex-1 items-center gap-5 py-6 lg:grid-cols-[0.95fr_1.05fr] lg:py-8">
            <section className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-pit-teal/35 bg-pit-teal/10 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-pit-teal">
                <Icon size={14} />
                {step.eyebrow}
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {stepIndex === 0 && firstName ? `Welcome, ${firstName}. ` : ''}{step.title}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-pit-text sm:text-lg">
                  {step.body}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {step.bullets.map((bullet) => (
                  <div key={bullet} className="rounded-xl border border-pit-border bg-pit-card/75 px-3 py-3 text-sm leading-5 text-pit-text">
                    <CheckCircle2 size={16} className="mb-2 text-pit-teal" />
                    {bullet}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {steps.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    className={`h-2 rounded-full transition-all ${index === stepIndex ? 'w-9 bg-pit-teal' : index < stepIndex ? 'w-4 bg-pit-teal/60' : 'w-4 bg-pit-border'}`}
                    aria-label={`Go to step ${index + 1}`}
                    onClick={() => setStepIndex(index)}
                  />
                ))}
              </div>
            </section>

            <TutorialPreview highlight={step.highlight} />
          </main>

          <footer className="sticky bottom-0 -mx-4 border-t border-pit-border bg-pit-bg/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:bg-pit-card/70">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <button
                type="button"
                className="btn-ghost gap-2 px-3 py-2 disabled:pointer-events-none disabled:opacity-35"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              >
                <ChevronLeft size={16} />
                Back
              </button>
              <div className="hidden text-center text-xs leading-5 text-pit-muted sm:block">
                No groups or tournaments are created during this walkthrough.
              </div>
              {isLast ? (
                <button type="button" className="btn-primary gap-2 px-4 py-2.5" disabled={completing} onClick={onComplete}>
                  {completing ? 'Finishing...' : 'Open Command Center'}
                  <CheckCircle2 size={16} />
                </button>
              ) : (
                <button type="button" className="btn-primary gap-2 px-4 py-2.5" onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}>
                  Next
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function TutorialPreview({ highlight }: { highlight: TutorialStep['highlight'] }) {
  return (
    <section className="rounded-2xl border border-pit-border bg-pit-card/80 p-3 shadow-2xl sm:p-4">
      <div className="rounded-xl border border-pit-border bg-pit-bg/70 p-3">
        <div className="flex items-center justify-between gap-3 border-b border-pit-border pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-pit-muted">Command Center</p>
            <p className="mt-1 text-lg font-black text-white">Your first poker night</p>
          </div>
          <button className={highlightClass(highlight === 'run', 'btn-primary px-3 py-2 text-xs')} type="button">
            + Host Game
          </button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-3">
            <PreviewCard active={highlight === 'group'} icon={<Users size={17} />} title="Group" value="Friday Night Crew" meta="Join code: RIVER24" />
            <PreviewCard active={highlight === 'invite'} icon={<Mail size={17} />} title="Invite options" value="Email invite or QR link" meta="Players can join from their phone." />
            <PreviewCard active={highlight === 'details'} icon={<Calendar size={17} />} title="Tournament details" value="Saturday Championship" meta="$25 buy-in · 24 max · 7:30 PM" />
          </div>

          <div className="space-y-3">
            <div className={highlightClass(highlight === 'blinds', 'rounded-xl border border-pit-border bg-pit-card p-3')}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white">Blind Structure</p>
                <span className="text-xs text-pit-muted">12 levels</span>
              </div>
              <div className="mt-3 grid gap-1 text-xs">
                {[
                  ['1', '25 / 50', '20m'],
                  ['2', '50 / 100', '20m'],
                  ['3', '100 / 200 - 200', '20m'],
                  ['4', 'Break 1', '10m'],
                ].map(([level, blinds, time]) => (
                  <div key={level} className={`grid grid-cols-[2rem_1fr_3rem] rounded-md px-2 py-1.5 ${level === '3' ? 'bg-pit-teal/15 text-white' : 'text-pit-text'}`}>
                    <span>{level}</span>
                    <span>{blinds}</span>
                    <span className="text-right">{time}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <PreviewCard active={highlight === 'checkin'} icon={<QrCode size={17} />} title="Check-in" value="QR or manual" meta="12 registered · 10 checked in" />
              <PreviewCard active={highlight === 'run'} icon={<Clock size={17} />} title="Run Tournament" value="18:42" meta="Seat players, start clock, track KOs" />
            </div>

            <div className={highlightClass(highlight === 'run' || highlight === 'checkin', 'rounded-xl border border-pit-border bg-pit-card p-3')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserCheck size={17} className="text-pit-teal" />
                  <span className="text-sm font-bold text-white">Players checked in</span>
                </div>
                <button type="button" className="btn-primary px-3 py-2 text-xs">
                  <Play size={14} />
                  Start
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {['ambo', 'River Rob', 'Queen Kim', 'Bubble Bob'].map((name, index) => (
                  <div key={name} className="rounded-lg border border-pit-border bg-pit-bg px-2 py-2 text-pit-text">
                    <p className="font-semibold text-white">{name}</p>
                    <p className="mt-1 text-pit-muted">T{index < 2 ? 1 : 2}.S{index + 1}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewCard({
  active,
  icon,
  title,
  value,
  meta,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  value: string;
  meta: string;
}) {
  return (
    <div className={highlightClass(active, 'rounded-xl border border-pit-border bg-pit-card p-3')}>
      <div className="flex items-center gap-2 text-pit-teal">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-[0.18em]">{title}</span>
      </div>
      <p className="mt-2 text-base font-black text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-pit-muted">{meta}</p>
    </div>
  );
}

function highlightClass(active: boolean, base: string) {
  return `${base} ${active ? 'border-pit-teal/80 bg-pit-teal/10 shadow-[0_0_0_1px_rgba(20,184,181,0.55),0_0_34px_rgba(20,184,181,0.16)]' : ''}`;
}
