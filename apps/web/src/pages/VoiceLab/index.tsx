import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Download, Loader2, Play, Save, Wand2 } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import { api, AdminVoiceLabStyle } from '../../api/client';
import { useAuthStore } from '../../store/auth';

const styles = [
  {
    id: 'football',
    label: 'Football Announcer',
    sample: "Welcome to Johnny's Saturday Night Game!",
    brief: 'A stadium-style intro for a home poker tournament called Johnny’s Saturday Night Game.',
  },
  {
    id: 'british_dealer',
    label: 'British Dealer',
    sample: 'The blinds will start at 25/50 and our next break will be in 90 minutes. Good luck players!',
    brief: 'A classy dealer announcement for starting blinds and a scheduled break.',
  },
  {
    id: 'series_director',
    label: 'Tournament Director',
    sample: 'Players, level two is now underway. Blinds are 50 and 100.',
    brief: 'A clean tournament director level-up announcement for a serious poker room.',
  },
  {
    id: 'hype_host',
    label: 'Hype Host',
    sample: 'Cards are in the air, the clock is live, and tonight’s bragging rights are officially on the table.',
    brief: 'A polished hype line for the hero section of PokerPlanner.',
  },
  {
    id: 'minimalist',
    label: 'Minimalist',
    sample: 'Level three. Blinds 100 and 200. Fifteen minutes on the clock.',
    brief: 'A short and clean tournament timer announcement.',
  },
  {
    id: 'roaster',
    label: 'Roaster',
    sample: 'Level four is here. Time to find out who studied charts and who just liked the group chat.',
    brief: 'A playful roast for a casual home game, friendly but not mean.',
  },
];

void styles;

const voiceStyles = [
  {
    id: 'all_in_alex',
    label: 'All-In Alex',
    sample: "Welcome to Johnny's Saturday Night Game. Cards are in the air and the room is live.",
    brief: "A fast Vegas poker announcer intro for Johnny's Saturday Night Game.",
  },
  {
    id: 'royal_rumble_riley',
    label: 'Royal Rumble Riley',
    sample: 'Another player hits the rail and this final table just got louder.',
    brief: 'A sports arena knockout announcement for a big player elimination.',
  },
  {
    id: 'velvet_dealer',
    label: 'Velvet Dealer',
    sample: 'Welcome players. Blinds begin at 25 and 50, and your first break arrives in 90 minutes.',
    brief: 'A smooth casino host welcome for starting blinds and the first break.',
  },
  {
    id: 'chipstorm',
    label: 'Chipstorm',
    sample: 'Five minutes remain, stacks are moving, and this turbo level is about to explode.',
    brief: 'A hyper esports-style five-minute warning for a turbo poker tournament.',
  },
  {
    id: 'queen_of_spades',
    label: 'Queen of Spades',
    sample: 'Level four is live. Blinds are 200 and 400, and the payout race is heating up.',
    brief: 'A fast confident female announcer level-up with blinds and payout energy.',
  },
  {
    id: 'the_pit_boss',
    label: 'The Pit Boss',
    sample: 'Rebuys close in one minute. Get your chips right and keep the game moving.',
    brief: 'A gruff casino floor manager warning that rebuys are about to close.',
  },
  {
    id: 'british_high_roller',
    label: 'British High Roller',
    sample: 'The high roller clock is running. Blinds are 500 and 1,000, with pressure building quickly.',
    brief: 'A luxury British host announcing a premium high roller level.',
  },
  {
    id: 'turbo_tony',
    label: 'Turbo Tony',
    sample: 'Move it, players. Level five is here and those short stacks are officially sweating.',
    brief: 'A fast-talking New York poker room level-up for a chaotic home game.',
  },
  {
    id: 'midnight_mayhem',
    label: 'Midnight Mayhem',
    sample: 'The final table begins now. Every chip matters, and every decision echoes.',
    brief: 'A dark cinematic final table intro for a bounty event.',
  },
  {
    id: 'sunny_stacks',
    label: 'Sunny Stacks',
    sample: 'Welcome everyone. The clock is live, the blinds are friendly, and the fun starts now.',
    brief: 'A friendly upbeat intro for a casual beginner-friendly poker night.',
  },
];

type GeneratedClip = {
  url: string;
  filename: string;
  bytes: number;
  text: string;
  label: string;
};

export default function VoiceLabPage() {
  const user = useAuthStore((s) => s.user);
  const [style, setStyle] = useState(voiceStyles[0].id);
  const selectedStyle = useMemo(() => voiceStyles.find((item) => item.id === style) ?? voiceStyles[0], [style]);
  const [brief, setBrief] = useState(selectedStyle.brief);
  const [script, setScript] = useState(selectedStyle.sample);
  const [savedStyles, setSavedStyles] = useState<Record<string, AdminVoiceLabStyle['savedClip']>>({});
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [busy, setBusy] = useState<'script' | 'clip' | null>(null);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState<GeneratedClip | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const savedClip = savedStyles[style] ?? null;

  useEffect(() => {
    if (!user?.issuperadmin) return;
    api.getAdminVoiceLabStyles()
      .then((result) => {
        setSavedStyles(Object.fromEntries(result.styles.map((item) => [item.id, item.savedClip])));
      })
      .catch(() => {});
  }, [user?.issuperadmin]);

  if (!user?.issuperadmin) {
    return <Navigate to="/" replace />;
  }

  function chooseStyle(nextStyle: string) {
    const next = voiceStyles.find((item) => item.id === nextStyle) ?? voiceStyles[0];
    setStyle(next.id);
    setBrief(next.brief);
    setScript(savedStyles[next.id]?.text || next.sample);
    setConfirmOverwrite(false);
    setGenerated(null);
    setError('');
  }

  async function generateScript() {
    setError('');
    setBusy('script');
    try {
      const result = await api.generateAdminVoiceLabScript({ style, brief });
      setScript(result.script);
      setConfirmOverwrite(false);
      if (savedClip) {
        setError(`${selectedStyle.label} already has a saved landing clip. Review the new script, then confirm overwrite before creating the MP3.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate script.');
    } finally {
      setBusy(null);
    }
  }

  async function generateClip() {
    setError('');
    if (savedClip && !confirmOverwrite) {
      setError(`${selectedStyle.label} already has a saved landing clip. Confirm overwrite to replace the MP3 and landing-page script.`);
      return;
    }
    setBusy('clip');
    setGenerated(null);
    try {
      const result = await api.generateAdminVoiceLabClip({ style, text: script, overwrite: confirmOverwrite });
      setGenerated(result);
      setSavedStyles((current) => ({ ...current, [style]: result }));
      setConfirmOverwrite(false);
      audioRef.current?.pause();
      audioRef.current = new Audio(`${result.url}?t=${Date.now()}`);
      await audioRef.current.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate clip.');
    } finally {
      setBusy(null);
    }
  }

  async function playGenerated() {
    if (!generated) return;
    audioRef.current?.pause();
    audioRef.current = new Audio(`${generated.url}?t=${Date.now()}`);
    await audioRef.current.play();
  }

  async function playSavedClip() {
    if (!savedClip) return;
    audioRef.current?.pause();
    audioRef.current = new Audio(`${savedClip.url}?t=${Date.now()}`);
    await audioRef.current.play();
  }

  return (
    <main className="min-h-screen bg-pit-bg text-white">
      <header className="border-b border-pit-border bg-pit-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link className="btn-ghost px-3 py-2" to="/">
              <ArrowLeft size={16} />
              Back
            </Link>
            <BrandLockup compact />
          </div>
          <span className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase text-red-200">
            Superadmin Voice Lab
          </span>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-pit-border bg-pit-card p-4">
          <p className="text-xs font-semibold uppercase text-pit-muted">Canned Styles</p>
          <div className="mt-3 grid gap-2">
            {voiceStyles.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseStyle(item.id)}
                className={`rounded-lg border px-3 py-3 text-left transition ${
                  style === item.id
                    ? 'border-pit-teal bg-pit-teal/10 text-white'
                    : 'border-pit-border bg-pit-bg/70 text-pit-text hover:border-pit-muted'
                }`}
              >
                <span className="text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs leading-5 text-pit-muted">{item.sample}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-yellow-300/20 bg-yellow-300/10 p-3 text-xs leading-5 text-yellow-100">
            These are saved as static MP3 files, so the landing page can reuse them without spending voice credits per visitor.
          </div>
        </aside>

        <section className="rounded-xl border border-pit-border bg-pit-card p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 border-b border-pit-border pb-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold uppercase text-pit-teal">Generate Landing Audio</p>
              <h1 className="mt-1 text-2xl font-bold">Voice Clip Lab</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-pit-text">
                Use this for one-off marketing clips. Generate the script, tweak it, then create a reusable MP3.
              </p>
            </div>
            <div className="rounded-lg border border-pit-border bg-pit-bg px-3 py-2 text-right">
              <p className="text-[10px] uppercase text-pit-muted">Current style</p>
              <p className="text-sm font-bold text-white">{selectedStyle.label}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="text-sm font-semibold text-white">Brief</span>
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-lg border border-pit-border bg-pit-bg p-3 text-sm text-white outline-none focus:border-pit-teal"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost px-4 py-2" type="button" onClick={generateScript} disabled={busy !== null}>
                {busy === 'script' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                Generate script
              </button>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-white">Script</span>
              <textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                rows={5}
                maxLength={420}
                className="mt-2 w-full rounded-lg border border-pit-border bg-pit-bg p-3 text-sm text-white outline-none focus:border-pit-teal"
              />
              <span className="mt-1 block text-right text-xs text-pit-muted">{script.length}/420</span>
            </label>

            {savedClip && (
              <div className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-yellow-100">
                      <AlertTriangle size={16} />
                      <p className="text-sm font-bold">Saved {selectedStyle.label} clip exists</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-yellow-50/85">
                      The landing page is currently using <span className="font-mono">{savedClip.filename}</span>. Overwriting replaces both the MP3 and the script shown on the landing page.
                    </p>
                    {savedClip.text && (
                      <p className="mt-3 rounded-lg border border-yellow-300/20 bg-pit-bg/60 p-3 text-sm leading-6 text-pit-text">
                        "{savedClip.text}"
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-yellow-300/30 px-3 py-2 text-sm font-semibold text-yellow-100 hover:bg-yellow-300/10"
                      onClick={playSavedClip}
                    >
                      <Play size={15} className="inline-block align-[-2px]" />
                      <span className="ml-1">Play saved</span>
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                        confirmOverwrite
                          ? 'border-red-300/40 bg-red-500/20 text-red-100'
                          : 'border-yellow-300/30 text-yellow-100 hover:bg-yellow-300/10'
                      }`}
                      onClick={() => setConfirmOverwrite((value) => !value)}
                    >
                      {confirmOverwrite ? 'Overwrite confirmed' : 'Confirm overwrite'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-pit-border bg-pit-bg/70 px-3 py-2 text-xs text-pit-muted">
              Landing asset: <span className="text-pit-text">{selectedStyle.label} saved MP3</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn-primary px-4 py-2" type="button" onClick={generateClip} disabled={busy !== null || !script.trim()}>
                {busy === 'clip' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {savedClip ? 'Overwrite MP3' : 'Generate MP3'}
              </button>
              {generated && (
                <button className="btn-ghost px-4 py-2" type="button" onClick={playGenerated}>
                  <Play size={16} />
                  Play saved clip
                </button>
              )}
            </div>

            {error && (
              <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>
            )}

            {generated && (
              <div className="rounded-xl border border-pit-teal/25 bg-pit-teal/10 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-bold text-white">Saved {generated.filename}</p>
                    <p className="mt-1 text-xs text-pit-text">{Math.round(generated.bytes / 1024)} KB at {generated.url}</p>
                  </div>
                  <a className="btn-ghost px-4 py-2" href={generated.url} download>
                    <Download size={16} />
                    Download
                  </a>
                </div>
                <p className="mt-3 rounded-lg border border-pit-border bg-pit-bg/70 p-3 text-sm leading-6 text-pit-text">
                  {generated.text}
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
