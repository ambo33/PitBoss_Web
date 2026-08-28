import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock3, Pause, Play, RotateCcw, SkipBack, SkipForward, Trophy, Users } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import type { BlindLevel } from '../../api/client';
import { loadQuickStartRun } from './session';

type RunLevel = Omit<BlindLevel, 'id'>;

export default function QuickStartRunPage() {
  const navigate = useNavigate();
  const payload = useMemo(() => loadQuickStartRun(), []);
  const levels = useMemo(() => payload?.generatedStructure ?? [], [payload]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSecs, setRemainingSecs] = useState(() => levelSeconds(levels[0]));
  const [running, setRunning] = useState(false);
  const currentLevel = levels[currentIndex];
  const nextLevel = levels[currentIndex + 1];
  const playLevels = levels.filter((level) => !isBreakLevel(level)).length;
  const totalMinutes = levels.reduce((sum, level) => sum + Number(level.minutes || 0), 0);

  useEffect(() => {
    setRemainingSecs(levelSeconds(levels[currentIndex]));
  }, [currentIndex, levels]);

  useEffect(() => {
    if (!running || levels.length === 0) return;
    const interval = window.setInterval(() => {
      setRemainingSecs((current) => {
        if (current > 1) return current - 1;
        if (currentIndex < levels.length - 1) {
          setCurrentIndex((index) => Math.min(index + 1, levels.length - 1));
          return 0;
        }
        setRunning(false);
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [currentIndex, levels.length, running]);

  if (!payload || levels.length === 0) {
    return (
      <div className="min-h-screen bg-pit-bg px-4 py-6 text-white">
        <div className="mx-auto max-w-xl rounded-xl border border-pit-border bg-pit-surface p-5 text-center">
          <h1 className="text-2xl font-black">No quick-start tournament found</h1>
          <p className="mt-2 text-sm leading-6 text-pit-text">Build a tournament first, then choose run without saving.</p>
          <button type="button" className="btn-primary mt-5" onClick={() => navigate('/quick-start')}>Build tournament</button>
        </div>
      </div>
    );
  }

  function moveLevel(delta: number) {
    setRunning(false);
    setCurrentIndex((index) => Math.min(Math.max(index + delta, 0), levels.length - 1));
  }

  function resetLevel() {
    setRunning(false);
    setRemainingSecs(levelSeconds(currentLevel));
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-pit-bg text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="ThePokerPlanner home">
          <BrandLockup compact showSlogan={false} />
        </Link>
        <Link className="btn-ghost min-h-10 gap-2 px-3 text-sm" to="/quick-start">
          <ArrowLeft size={16} />Edit setup
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <section className="rounded-xl border border-pit-border bg-pit-surface/86 p-4 sm:p-5">
          <h1 className="text-3xl font-black tracking-tight">{payload.tournamentConfig.name || 'Quick Start Tournament'}</h1>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric icon={<Users size={18} />} label="Players" value={String(payload.wizardInput.players)} />
            <Metric icon={<Clock3 size={18} />} label="Duration" value={formatDuration(totalMinutes)} />
            <Metric icon={<Trophy size={18} />} label="Levels" value={String(playLevels)} />
            <Metric icon={<RotateCcw size={18} />} label="Rows" value={String(levels.length)} />
          </div>

          <div className="mt-5 rounded-xl border border-pit-border bg-[#0b0f12] p-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-pit-muted">
              {isBreakLevel(currentLevel) ? currentLevel.label : `Level ${currentLevel?.level ?? 1}`}
            </p>
            <p className="mt-2 font-mono text-6xl font-black tabular-nums sm:text-8xl">{formatTime(remainingSecs)}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <TimerStat label="Small blind" value={isBreakLevel(currentLevel) ? 'Break' : formatNumber(currentLevel?.smallblind)} />
              <TimerStat label="Big blind" value={isBreakLevel(currentLevel) ? 'Break' : formatNumber(currentLevel?.bigblind)} />
              <TimerStat label="Ante" value={currentLevel?.ante ? formatNumber(currentLevel.ante) : '-'} />
            </div>
            {nextLevel && (
              <p className="mt-4 text-sm text-pit-text">
                Next: {isBreakLevel(nextLevel) ? nextLevel.label : `${formatNumber(nextLevel.smallblind)} / ${formatNumber(nextLevel.bigblind)}`}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-ghost min-h-11 gap-2" onClick={() => moveLevel(-1)} disabled={currentIndex === 0}>
              <SkipBack size={17} />Prev
            </button>
            <button type="button" className="btn-primary min-h-11 min-w-28 gap-2" onClick={() => setRunning((value) => !value)}>
              {running ? <Pause size={18} /> : <Play size={18} />}{running ? 'Pause' : 'Start'}
            </button>
            <button type="button" className="btn-ghost min-h-11 gap-2" onClick={() => moveLevel(1)} disabled={currentIndex >= levels.length - 1}>
              <SkipForward size={17} />Next
            </button>
            <button type="button" className="btn-ghost min-h-11 gap-2" onClick={resetLevel}>
              <RotateCcw size={17} />Reset
            </button>
          </div>
        </section>

        <aside className="rounded-xl border border-pit-border bg-pit-surface/82 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-pit-teal">Structure</p>
          <div className="mt-4 divide-y divide-pit-border overflow-hidden rounded-xl border border-pit-border">
            {levels.map((level, index) => {
              const active = index === currentIndex;
              const breakRow = isBreakLevel(level);
              return (
                <button
                  key={`${level.level}-${level.label}`}
                  type="button"
                  className={`grid min-h-12 w-full grid-cols-[52px_minmax(0,1fr)_64px] items-center gap-2 px-3 py-2 text-left text-sm transition ${active ? 'bg-pit-teal/18 text-white' : breakRow ? 'bg-amber-300/[0.06] text-amber-100 hover:bg-white/[0.04]' : 'text-pit-text hover:bg-white/[0.04]'}`}
                  onClick={() => {
                    setRunning(false);
                    setCurrentIndex(index);
                  }}
                >
                  <span className="font-mono text-pit-muted">{level.level}</span>
                  <span className="min-w-0 truncate font-bold">
                    {breakRow ? level.label : `${formatNumber(level.smallblind)} / ${formatNumber(level.bigblind)}${level.ante ? ` / ${formatNumber(level.ante)}` : ''}`}
                  </span>
                  <span className="text-right">{level.minutes ? `${level.minutes}m` : '-'}</span>
                </button>
              );
            })}
          </div>
        </aside>
      </main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-pit-border bg-pit-bg/55 p-3">
      <div className="text-pit-teal">{icon}</div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-pit-muted">{label}</p>
      <p className="mt-1 truncate text-base font-black text-white">{value}</p>
    </div>
  );
}

function TimerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg/70 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-pit-muted">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function levelSeconds(level?: RunLevel) {
  return Math.max(0, Number(level?.minutes ?? 0)) * 60;
}

function isBreakLevel(level?: RunLevel) {
  return Boolean(level && Number(level.smallblind) === 0 && Number(level.bigblind) === 0);
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function formatNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : '-';
}

function formatDuration(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
}
