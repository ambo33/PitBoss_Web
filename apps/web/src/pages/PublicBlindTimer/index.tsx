import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Clock3,
  Copy,
  Mail,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  Wand2,
} from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import { api, type BlindLevel, type PublicBlindTimerState } from '../../api/client';

type DraftLevel = Omit<BlindLevel, 'id'>;

type BuilderSettings = {
  players: string;
  startingStack: string;
  targetHours: string;
  levelMinutes: string;
  startingBigBlind: string;
  chipIncrement: string;
  finishBigBlinds: string;
  breakCount: string;
  breakMinutes: string;
  anteStartLevel: string;
  antePercent: string;
};

const defaultSettings: BuilderSettings = {
  players: '10',
  startingStack: '10000',
  targetHours: '3',
  levelMinutes: '20',
  startingBigBlind: '50',
  chipIncrement: '25',
  finishBigBlinds: '10',
  breakCount: '0',
  breakMinutes: '10',
  anteStartLevel: '0',
  antePercent: '10',
};

const defaultLevels = generateBlindStructure(parseSettings(defaultSettings));

export default function PublicBlindTimerPage() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const [timerName, setTimerName] = useState('Home Game Blind Timer');
  const [lookupCode, setLookupCode] = useState('');
  const [settings, setSettings] = useState<BuilderSettings>(defaultSettings);
  const [levels, setLevels] = useState<DraftLevel[]>(defaultLevels);
  const [timerCode, setTimerCode] = useState(routeCode ?? '');
  const [mode, setMode] = useState<'builder' | 'run'>(routeCode ? 'run' : 'builder');
  const [loading, setLoading] = useState(Boolean(routeCode));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [emailPromptOpen, setEmailPromptOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [promoConsentActive, setPromoConsentActive] = useState(false);
  const [soundAnnouncementsEnabled, setSoundAnnouncementsEnabled] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSecs, setRemainingSecs] = useState(defaultLevels[0].minutes * 60);
  const [running, setRunning] = useState(false);
  const [lastAnnouncementKey, setLastAnnouncementKey] = useState('');
  const currentLevel = levels[currentIndex] ?? levels[0];
  const nextLevel = levels[currentIndex + 1];
  const totalMinutes = useMemo(() => levels.reduce((sum, level) => sum + Number(level.minutes || 0), 0), [levels]);

  useEffect(() => {
    if (!routeCode) return;
    let active = true;
    setLoading(true);
    setError('');
    api.getPublicBlindTimer(routeCode)
      .then(({ timer }) => {
        if (!active) return;
        const normalized = normalizeLevels(timer.levels);
        setTimerName(timer.name);
        setTimerCode(timer.code);
        setLevels(normalized);
        setPromoConsentActive(Boolean(timer.promoconsentactive));
        setSoundAnnouncementsEnabled(Boolean(timer.soundannouncementsenabled));
        if (timer.promoconsentactive && timer.state) {
          setCurrentIndex(Math.min(Math.max(timer.state.currentIndex, 0), normalized.length - 1));
          setRemainingSecs(Math.max(0, timer.state.remainingSecs));
          setRunning(Boolean(timer.state.running));
        } else {
          setCurrentIndex(0);
          setRemainingSecs((normalized[0]?.minutes ?? 20) * 60);
          setRunning(false);
        }
        setMode('run');
        setLookupCode('');
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Blind timer code not found.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [routeCode]);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setRemainingSecs((current) => {
        if (current > 1) return current - 1;
        setCurrentIndex((index) => {
          const nextIndex = Math.min(index + 1, levels.length - 1);
          const nextLevel = levels[nextIndex];
          if (nextIndex === index || !nextLevel) {
            setRunning(false);
            return index;
          }
          window.setTimeout(() => setRemainingSecs(nextLevel.minutes * 60), 0);
          return nextIndex;
        });
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [levels, running]);

  useEffect(() => {
    if (!timerCode) return;
    const payload = JSON.stringify({ currentIndex, remainingSecs, running, updatedAt: Date.now() });
    localStorage.setItem(`pb_public_blind_timer_${timerCode}`, payload);
  }, [currentIndex, remainingSecs, running, timerCode]);

  useEffect(() => {
    if (!timerCode || !promoConsentActive || mode !== 'run') return;
    if (!running || remainingSecs % 15 === 0) {
      void api.updatePublicBlindTimerState(timerCode, getTimerState(currentIndex, remainingSecs, running)).catch(() => {});
    }
  }, [currentIndex, mode, promoConsentActive, remainingSecs, running, timerCode]);

  useEffect(() => {
    if (!timerCode || !promoConsentActive || mode !== 'run') return;
    void api.updatePublicBlindTimerState(timerCode, getTimerState(currentIndex, remainingSecs, running)).catch(() => {});
  }, [currentIndex, mode, promoConsentActive, running, timerCode]);

  useEffect(() => {
    if (!soundAnnouncementsEnabled || !currentLevel || mode !== 'run') return;
    const warning = remainingSecs <= 60 ? 'one-minute' : remainingSecs <= 300 ? 'five-minute' : '';
    const levelKey = `level-${currentIndex}`;
    const warningKey = warning ? `${warning}-${currentIndex}` : '';

    if (lastAnnouncementKey !== levelKey && remainingSecs === currentLevel.minutes * 60) {
      speakAnnouncement(levelAnnouncement(currentLevel));
      setLastAnnouncementKey(levelKey);
      return;
    }
    if (warningKey && lastAnnouncementKey !== warningKey) {
      speakAnnouncement(warning === 'one-minute' ? 'One minute remaining in this level.' : 'Five minutes remaining in this level.');
      setLastAnnouncementKey(warningKey);
    }
  }, [currentIndex, currentLevel, lastAnnouncementKey, mode, remainingSecs, soundAnnouncementsEnabled]);

  function updateSetting(field: keyof BuilderSettings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function generateStructure() {
    const generated = generateBlindStructure(parseSettings(settings));
    setLevels(generated);
    setCurrentIndex(0);
    setRemainingSecs(generated[0].minutes * 60);
  }

  function updateLevel(index: number, field: keyof DraftLevel, value: string | number | boolean) {
    setLevels((current) => current.map((level, levelIndex) => {
      if (levelIndex !== index) return level;
      const numericFields = ['smallblind', 'bigblind', 'ante', 'minutes'];
      return {
        ...level,
        [field]: numericFields.includes(String(field)) ? Math.max(0, Math.round(Number(value) || 0)) : value,
      };
    }).map((level, levelIndex, all) => ({
      ...level,
      level: levelIndex + 1,
      label: isBreakLevel(level) ? level.label || `Break ${levelIndex + 1}` : `Level ${levelIndex + 1}`,
      islastlevel: levelIndex === all.length - 1,
    })));
  }

  function addLevel() {
    setLevels((current) => {
      const previous = current[current.length - 1] ?? defaultLevels[0];
      const nextBigBlind = Math.max(previous.bigblind || 50, 50) * 2;
      return renumberLevels([...current, {
        level: current.length + 1,
        label: `Level ${current.length + 1}`,
        smallblind: Math.round(nextBigBlind / 2),
        bigblind: nextBigBlind,
        ante: previous.ante ?? 0,
        minutes: previous.minutes || 20,
        islastlevel: true,
      }]);
    });
  }

  function addBreak() {
    setLevels((current) => renumberLevels([...current, {
      level: current.length + 1,
      label: `Break ${current.filter(isBreakLevel).length + 1}`,
      smallblind: 0,
      bigblind: 0,
      ante: 0,
      minutes: 10,
      islastlevel: true,
    }]));
  }

  function removeLevel(index: number) {
    setLevels((current) => {
      const next = renumberLevels(current.filter((_level, levelIndex) => levelIndex !== index));
      const safe = next.length > 0 ? next : defaultLevels;
      setCurrentIndex((currentIndexValue) => Math.min(currentIndexValue, safe.length - 1));
      return safe;
    });
  }

  async function runTimer() {
    setSaving(true);
    setError('');
    try {
      const payload = { name: timerName.trim() || 'Poker Timer', levels: normalizeLevels(levels) };
      if (timerCode) {
        const { timer } = await api.updatePublicBlindTimer(timerCode, payload);
        setTimerName(timer.name);
        setLevels(normalizeLevels(timer.levels));
        setPromoConsentActive(Boolean(timer.promoconsentactive));
        setSoundAnnouncementsEnabled(Boolean(timer.soundannouncementsenabled));
        setMode('run');
        navigate(`/blind-timer/${timer.code}`, { replace: true });
      } else {
        const { timer } = await api.createPublicBlindTimer(payload);
        setTimerCode(timer.code);
        setTimerName(timer.name);
        setLevels(normalizeLevels(timer.levels));
        setPromoConsentActive(Boolean(timer.promoconsentactive));
        setSoundAnnouncementsEnabled(Boolean(timer.soundannouncementsenabled));
        setEmailPromptOpen(true);
        navigate(`/blind-timer/${timer.code}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save blind timer.');
    } finally {
      setSaving(false);
    }
  }

  async function sendEmailCode() {
    if (!timerCode) return;
    setEmailMessage('');
    setSaving(true);
    try {
      const { timer } = await api.emailPublicBlindTimerCode(timerCode, {
        email,
        enableSoundAnnouncements: true,
        state: getTimerState(currentIndex, remainingSecs, running),
      });
      setPromoConsentActive(Boolean(timer.promoconsentactive));
      setSoundAnnouncementsEnabled(Boolean(timer.soundannouncementsenabled));
      if (timer.state) {
        setCurrentIndex(timer.state.currentIndex);
        setRemainingSecs(timer.state.remainingSecs);
        setRunning(Boolean(timer.state.running));
      }
      setEmailMessage('Code sent. You are good to run the timer.');
      setMode('run');
      setEmailPromptOpen(false);
    } catch (err) {
      setEmailMessage(err instanceof Error ? err.message : 'Unable to email that code.');
    } finally {
      setSaving(false);
    }
  }

  function skipEmailPrompt() {
    setEmailPromptOpen(false);
    setMode('run');
  }

  function openSaveAndSoundPrompt() {
    setEmailMessage('');
    setEmailPromptOpen(true);
  }

  function goToLookupCode() {
    const cleaned = lookupCode.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) {
      setError('Enter a 6 digit blind timer code.');
      return;
    }
    navigate(`/blind-timer/${cleaned}`);
  }

  function setActiveLevel(index: number) {
    const level = levels[index];
    if (!level) return;
    setCurrentIndex(index);
    setRemainingSecs(level.minutes * 60);
  }

  function shiftLevel(delta: number) {
    setActiveLevel(Math.min(Math.max(currentIndex + delta, 0), levels.length - 1));
  }

  function resetCurrentLevel() {
    setRemainingSecs((currentLevel?.minutes ?? 20) * 60);
    setRunning(false);
  }

  async function copyCode() {
    if (!timerCode) return;
    await navigator.clipboard?.writeText(timerCode);
  }

  return (
    <main className="min-h-screen bg-pit-bg text-white">
      <header className="border-b border-pit-border bg-pit-surface/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link className="min-w-0" to="/landing">
            <BrandLockup compact showSlogan={false} />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link className="btn-ghost px-2 py-2 text-xs sm:px-3 sm:text-sm" to="/landing" aria-label="Back to landing page">
              <ArrowLeft size={15} />
              <span className="hidden sm:inline">Landing</span>
            </Link>
            <Link className="btn-primary px-3 py-2 text-xs sm:text-sm" to="/login?mode=register">
              <span className="hidden sm:inline">Create account</span>
              <span className="sm:hidden">Join</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <p className="inline-flex rounded-full border border-pit-teal/30 bg-pit-teal/10 px-3 py-1 text-xs font-semibold uppercase text-pit-teal">
              Free blind timer
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">Build a quick poker timer.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-pit-text sm:text-base">
              Set up a blind schedule, tweak the levels, then run it right from the browser. Your 6 digit code reopens this timer later, with optional email delivery if you want it saved.
            </p>
          </div>
          <div className="rounded-xl border border-pit-border bg-pit-card p-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-pit-muted">Have a timer code?</label>
            <div className="mt-2 flex gap-2">
              <input
                className="input font-mono"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={lookupCode}
                onChange={(event) => setLookupCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') goToLookupCode();
                }}
              />
              <button className="btn-ghost shrink-0 px-3" type="button" onClick={goToLookupCode} aria-label="Open timer code">
                <Search size={18} />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card text-pit-text">Loading blind timer...</div>
        ) : mode === 'run' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="card overflow-hidden p-0">
              <div className="border-b border-pit-border bg-[#111113] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">Running timer</p>
                    <h2 className="mt-1 text-2xl font-bold">{timerName}</h2>
                  </div>
                  {timerCode && (
                    <button className="chip font-mono text-pit-teal" type="button" onClick={copyCode}>
                      <Copy size={14} />
                      {timerCode}
                    </button>
                  )}
                </div>
                {!promoConsentActive && (
                  <button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-pit-teal/35 bg-pit-teal/10 px-3 py-2 text-sm font-semibold text-pit-teal hover:bg-pit-teal/15" type="button" onClick={openSaveAndSoundPrompt}>
                    <Save size={16} />
                    Save state + enable sound
                  </button>
                )}
                {promoConsentActive && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-pit-text">
                    <span className="chip border-pit-teal/35 bg-pit-teal/10 text-pit-teal">
                      <Save size={14} />
                      State saving on
                    </span>
                    <span className="chip border-pit-teal/35 bg-pit-teal/10 text-pit-teal">
                      <Volume2 size={14} />
                      Sound announcements {soundAnnouncementsEnabled ? 'on' : 'off'}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-5 text-center sm:p-8">
                <div className="mx-auto max-w-3xl rounded-2xl border border-pit-border bg-black/25 p-5">
                  <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-pit-text">
                    <Clock3 size={17} className="text-pit-teal" />
                    <span>{isBreakLevel(currentLevel) ? currentLevel.label : `Level ${currentLevel?.level ?? 1} of ${levels.length}`}</span>
                  </div>
                  <div className="mt-4 font-mono text-7xl font-black leading-none text-white sm:text-8xl">
                    {formatTime(remainingSecs)}
                  </div>
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

                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button className="btn-ghost" type="button" onClick={() => shiftLevel(-1)} disabled={currentIndex === 0}>
                    <SkipBack size={17} />
                    Prev
                  </button>
                  <button className="btn-primary px-6" type="button" onClick={() => setRunning((value) => !value)}>
                    {running ? <Pause size={18} /> : <Play size={18} />}
                    {running ? 'Pause' : 'Start'}
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => shiftLevel(1)} disabled={currentIndex >= levels.length - 1}>
                    <SkipForward size={17} />
                    Next
                  </button>
                  <button className="btn-ghost" type="button" onClick={resetCurrentLevel}>
                    <RotateCcw size={17} />
                    Reset
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => {
                    setRunning(false);
                    setMode('builder');
                  }}>
                    Edit structure
                  </button>
                </div>
              </div>
            </section>

            <StructureRail levels={levels} currentIndex={currentIndex} onSelect={setActiveLevel} totalMinutes={totalMinutes} />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <section className="card space-y-4">
              <div className="flex items-center gap-2 text-white">
                <Calculator size={19} className="text-pit-teal" />
                <h2 className="text-xl font-bold">Calculator</h2>
              </div>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">Timer name</span>
                <input className="input" value={timerName} onChange={(event) => setTimerName(event.target.value)} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <NumberField label="Players" value={settings.players} onChange={(value) => updateSetting('players', value)} />
                <NumberField label="Starting stack" value={settings.startingStack} onChange={(value) => updateSetting('startingStack', value)} />
                <NumberField label="Target hours" value={settings.targetHours} onChange={(value) => updateSetting('targetHours', value)} />
                <NumberField label="Level minutes" value={settings.levelMinutes} onChange={(value) => updateSetting('levelMinutes', value)} />
                <NumberField label="Breaks" value={settings.breakCount} onChange={(value) => updateSetting('breakCount', value)} />
                <NumberField label="Break minutes" value={settings.breakMinutes} onChange={(value) => updateSetting('breakMinutes', value)} />
                <NumberField label="Starting BB" value={settings.startingBigBlind} onChange={(value) => updateSetting('startingBigBlind', value)} />
                <NumberField label="Chip increment" value={settings.chipIncrement} onChange={(value) => updateSetting('chipIncrement', value)} />
                <NumberField label="Finish BBs in play" value={settings.finishBigBlinds} onChange={(value) => updateSetting('finishBigBlinds', value)} />
                <NumberField label="Ante from level" value={settings.anteStartLevel} onChange={(value) => updateSetting('anteStartLevel', value)} />
                <NumberField label="Ante percent of BB" value={settings.antePercent} onChange={(value) => updateSetting('antePercent', value)} />
              </div>
              <button className="btn-ghost w-full" type="button" onClick={generateStructure}>
                <Wand2 size={16} />
                Generate structure
              </button>
            </section>

            <section className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Blind structure</p>
                  <h2 className="mt-1 text-xl font-bold text-white">{levels.length} levels, {totalMinutes} minutes</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-ghost px-3 py-2 text-xs" type="button" onClick={addLevel}>
                    <Plus size={15} />
                    Level
                  </button>
                  <button className="btn-ghost px-3 py-2 text-xs" type="button" onClick={addBreak}>
                    <Plus size={15} />
                    Break
                  </button>
                </div>
              </div>

              {error && <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}

              <div className="space-y-2">
                {levels.map((level, index) => {
                  const breakRow = isBreakLevel(level);
                  return (
                    <div key={`${index}-${level.label}`} className={`rounded-xl border p-3 ${breakRow ? 'border-yellow-300/25 bg-yellow-300/5' : 'border-pit-border bg-pit-bg/60'}`}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{breakRow ? level.label : `Level ${index + 1}`}</p>
                        <button className="text-red-300 hover:text-red-200" type="button" onClick={() => removeLevel(index)} aria-label={`Remove ${breakRow ? level.label : `level ${index + 1}`}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-4">
                        <LevelInput label="SB" value={level.smallblind} disabled={breakRow} onChange={(value) => updateLevel(index, 'smallblind', value)} />
                        <LevelInput label="BB" value={level.bigblind} disabled={breakRow} onChange={(value) => updateLevel(index, 'bigblind', value)} />
                        <LevelInput label="Ante" value={level.ante} disabled={breakRow} onChange={(value) => updateLevel(index, 'ante', value)} />
                        <LevelInput label="Min" value={level.minutes} onChange={(value) => updateLevel(index, 'minutes', Math.max(1, value))} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-pit-border bg-pit-card/95 p-4 backdrop-blur">
                <button className="btn-primary w-full py-3" type="button" onClick={runTimer} disabled={saving || levels.length === 0}>
                  <Play size={17} />
                  {saving ? 'Saving...' : timerCode ? 'Save and Run' : 'Run and Get Code'}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>

      {emailPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-pit-border bg-pit-card p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-pit-teal/25 bg-pit-teal/10 text-pit-teal">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <p className="eyebrow">Timer saved</p>
                <h2 className="mt-1 text-2xl font-bold">{promoConsentActive ? 'Save and sound are enabled' : `Your blind timer code is ${timerCode}`}</h2>
                <p className="mt-2 text-sm leading-6 text-pit-text">
                  Enter your email to save timer progress across sessions and enable level/time-warning sound announcements. This also signs you up for occasional PokerPlanner updates and hosting tips, and every email includes an unsubscribe link.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-pit-border bg-pit-bg/70 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-pit-muted">Email code to myself</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <button className="btn-primary shrink-0" type="button" onClick={sendEmailCode} disabled={saving}>
                  <Mail size={16} />
                  Send
                </button>
              </div>
              {emailMessage && <p className="mt-2 text-sm text-pit-text">{emailMessage}</p>}
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-ghost" type="button" onClick={skipEmailPrompt}>Skip and run timer</button>
              <button className="btn-ghost" type="button" onClick={copyCode}>
                <Copy size={16} />
                Copy code
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-pit-muted">{label}</span>
      <input className="input" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function LevelInput({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-pit-muted">{label}</span>
      <input
        className="input py-2"
        inputMode="numeric"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))}
      />
    </label>
  );
}

function StructureRail({
  levels,
  currentIndex,
  totalMinutes,
  onSelect,
}: {
  levels: DraftLevel[];
  currentIndex: number;
  totalMinutes: number;
  onSelect: (index: number) => void;
}) {
  return (
    <aside className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Structure</p>
          <h3 className="mt-1 text-lg font-bold">{levels.length} levels</h3>
        </div>
        <span className="chip">{totalMinutes} min</span>
      </div>
      <div className="max-h-[650px] space-y-2 overflow-y-auto pr-1">
        {levels.map((level, index) => {
          const active = index === currentIndex;
          const breakRow = isBreakLevel(level);
          return (
            <button
              key={`${level.level}-${level.label}`}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? 'border-pit-teal bg-pit-teal/15'
                  : breakRow
                    ? 'border-yellow-300/20 bg-yellow-300/5 hover:border-yellow-300/45'
                    : 'border-pit-border bg-pit-bg/60 hover:border-pit-teal/35'
              }`}
              type="button"
              onClick={() => onSelect(index)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{breakRow ? level.label : `Level ${level.level}`}</span>
                <span className="text-xs text-pit-muted">{level.minutes} min</span>
              </div>
              <p className="mt-1 text-xs text-pit-text">
                {breakRow ? 'Break' : `${formatNumber(level.smallblind)} / ${formatNumber(level.bigblind)}${level.ante ? ` / ante ${formatNumber(level.ante)}` : ''}`}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function TimerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-pit-border bg-pit-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-pit-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function parseSettings(settings: BuilderSettings) {
  return {
    players: parseSetting(settings.players, 10),
    startingStack: parseSetting(settings.startingStack, 10000),
    targetHours: parseSetting(settings.targetHours, 3),
    levelMinutes: parseSetting(settings.levelMinutes, 20),
    startingBigBlind: parseSetting(settings.startingBigBlind, 50),
    chipIncrement: parseSetting(settings.chipIncrement, 25),
    finishBigBlinds: parseSetting(settings.finishBigBlinds, 10),
    breakCount: Math.max(0, Math.floor(parseSetting(settings.breakCount, 0))),
    breakMinutes: parseSetting(settings.breakMinutes, 10),
    anteStartLevel: parseSetting(settings.anteStartLevel, 0),
    antePercent: parseSetting(settings.antePercent, 0),
  };
}

function parseSetting(value: string, fallback: number) {
  if (value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function generateBlindStructure(settings: ReturnType<typeof parseSettings>): DraftLevel[] {
  const safePlayers = Math.max(settings.players || 0, 2);
  const safeStack = Math.max(settings.startingStack || 0, 100);
  const safeMinutes = Math.max(settings.levelMinutes || 0, 1);
  const safeHours = Math.max(settings.targetHours || 0, 0.5);
  const safeBreakCount = clamp(Math.floor(settings.breakCount || 0), 0, 10);
  const safeBreakMinutes = Math.max(settings.breakMinutes || 0, 1);
  const playMinutes = Math.max((safeHours * 60) - (safeBreakCount * safeBreakMinutes), safeMinutes * 4);
  const increment = Math.max(settings.chipIncrement || 0, 1);
  const startBigBlind = roundTo(Math.max(settings.startingBigBlind || 0, increment), increment);
  const totalChips = safePlayers * safeStack;
  const targetBigBlind = roundTo(Math.max(startBigBlind, totalChips / Math.max(settings.finishBigBlinds || 0, 4)), increment);
  const levelCount = clamp(Math.round(playMinutes / safeMinutes), 4, 30);
  const growthFactor = levelCount <= 1 ? 1 : Math.pow(targetBigBlind / startBigBlind, 1 / (levelCount - 1));

  let previousBigBlind = 0;
  const blindLevels = Array.from({ length: levelCount }, (_unused, index) => {
    const level = index + 1;
    const rawBigBlind = startBigBlind * Math.pow(growthFactor, index);
    let bigblind = roundTo(rawBigBlind, increment);
    if (bigblind <= previousBigBlind) bigblind = previousBigBlind + increment;
    previousBigBlind = bigblind;

    const smallblind = Math.max(increment, roundTo(bigblind / 2, increment));
    const ante = settings.anteStartLevel > 0 && level >= settings.anteStartLevel
      ? roundTo((bigblind * Math.max(settings.antePercent, 0)) / 100, increment)
      : 0;

    return {
      level,
      label: `Level ${level}`,
      smallblind,
      bigblind,
      ante,
      minutes: safeMinutes,
      islastlevel: level === levelCount,
    };
  });

  if (safeBreakCount === 0) return blindLevels;

  const levelsWithBreaks: DraftLevel[] = [];
  const spacing = Math.max(1, Math.floor(levelCount / (safeBreakCount + 1)));
  let breaksAdded = 0;
  blindLevels.forEach((blind, index) => {
    levelsWithBreaks.push(blind);
    const shouldAddBreak = breaksAdded < safeBreakCount
      && index < blindLevels.length - 1
      && (index + 1) >= spacing * (breaksAdded + 1);
    if (shouldAddBreak) {
      levelsWithBreaks.push({
        level: levelsWithBreaks.length + 1,
        label: `Break ${breaksAdded + 1}`,
        smallblind: 0,
        bigblind: 0,
        ante: 0,
        minutes: safeBreakMinutes,
        islastlevel: false,
      });
      breaksAdded += 1;
    }
  });

  return renumberLevels(levelsWithBreaks);
}

function normalizeLevels(levels: Omit<BlindLevel, 'id'>[]): DraftLevel[] {
  return renumberLevels(levels.map((level) => ({
    level: Number(level.level),
    label: level.label,
    smallblind: Number(level.smallblind) || 0,
    bigblind: Number(level.bigblind) || 0,
    ante: Number(level.ante) || 0,
    minutes: Math.max(1, Number(level.minutes) || 1),
    islastlevel: Boolean(level.islastlevel),
  })));
}

function getTimerState(currentIndex: number, remainingSecs: number, running: boolean): PublicBlindTimerState {
  return {
    currentIndex,
    remainingSecs,
    running,
  };
}

function speakAnnouncement(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function levelAnnouncement(level: DraftLevel) {
  if (isBreakLevel(level)) {
    return `${level.label}.`;
  }
  return `Level ${level.level}. Small blind ${formatNumber(level.smallblind)}. Big blind ${formatNumber(level.bigblind)}${level.ante ? `. Ante ${formatNumber(level.ante)}` : ''}.`;
}

function renumberLevels(levels: DraftLevel[]): DraftLevel[] {
  return levels.map((level, index) => ({
    ...level,
    level: index + 1,
    label: isBreakLevel(level) ? level.label || `Break ${index + 1}` : `Level ${index + 1}`,
    islastlevel: index === levels.length - 1,
  }));
}

function roundTo(value: number, increment: number) {
  return Math.max(increment, Math.round(value / increment) * increment);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isBreakLevel(level?: Pick<DraftLevel, 'label' | 'smallblind' | 'bigblind'>): boolean {
  if (!level) return false;
  return /^break\b/i.test(String(level.label ?? '')) || (Number(level.smallblind) === 0 && Number(level.bigblind) === 0);
}

function formatTime(secs: number) {
  const safe = Math.max(0, Math.floor(secs));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatNumber(value?: number) {
  return Number(value ?? 0).toLocaleString();
}
