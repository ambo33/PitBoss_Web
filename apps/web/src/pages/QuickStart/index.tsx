import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, Clock3, Coffee, Layers3, LogIn, LockKeyhole, Mail, Minus, Play, Plus, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Trophy, Users } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import Modal from '../../components/Modal';
import { api, BlindLevel, QuickStartWizardInput, TournamentDraftConfig, TournamentDraftPayload } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import {
  DEFAULT_CHIP_DENOMINATIONS,
  DEFAULT_COLOR_UPS,
  generateBlindStructure,
  parseChipDenominations,
} from '../../utils/blindCalculator';
import { trackEvent } from '../../utils/analytics';
import { saveQuickStartRun } from './session';

type DurationBucket = QuickStartWizardInput['durationBucket'];
type Phase = 'wizard' | 'preview';
type AuthMode = 'create' | 'login';
type CreateStep = 'email' | 'password';

const DRAFT_STORAGE_KEY = 'pp_quick_start_draft_id';
const DEFAULT_PLAYERS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export default function QuickStartTournamentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const logout = useAuthStore((state) => state.logout);
  const [phase, setPhase] = useState<Phase>('wizard');
  const [draftId, setDraftId] = useState(() => localStorage.getItem(DRAFT_STORAGE_KEY) ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'restored' | 'expired'>('idle');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('create');
  const [createStep, setCreateStep] = useState<CreateStep>('email');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [demoTokenPresent, setDemoTokenPresent] = useState(() => hasDemoToken());
  const [form, setForm] = useState<QuickStartWizardInput>({
    players: DEFAULT_PLAYERS,
    durationBucket: '3h',
    startingStack: 10000,
    targetHours: 3,
    levelMinutes: 20,
    startingBigBlind: 50,
    chipDenominations: DEFAULT_CHIP_DENOMINATIONS,
    finishBigBlinds: 14,
    breakCount: 1,
    breakMinutes: 10,
    anteStartLevel: 0,
    colorUps: DEFAULT_COLOR_UPS,
    rebuysEnabled: false,
    addonsEnabled: false,
    rebuyChips: 10000,
    addonChips: 15000,
  });

  const generatedStructure = useMemo(
    () => generateBlindStructure({
      players: form.players,
      startingStack: form.startingStack,
      targetHours: resolvedHours(form),
      levelMinutes: form.levelMinutes,
      startingBigBlind: form.startingBigBlind,
      chipDenominations: form.chipDenominations,
      finishBigBlinds: form.finishBigBlinds,
      breakCount: form.breakCount,
      breakMinutes: form.breakMinutes,
      anteStartLevel: form.anteStartLevel,
      expectedRebuys: form.rebuysEnabled ? Math.round(form.players * 0.35) : 0,
      expectedAddons: form.addonsEnabled ? Math.round(form.players * 0.5) : 0,
      rebuyChips: form.rebuysEnabled ? form.rebuyChips : 0,
      addonChips: form.addonsEnabled ? form.addonChips : 0,
      colorUps: form.colorUps,
    }),
    [form]
  );
  const config = useMemo(() => buildTournamentConfig(form), [form]);
  const payload = useMemo<TournamentDraftPayload>(() => ({
    wizardInput: { ...form, targetHours: resolvedHours(form) },
    generatedStructure: generatedStructure.map(toDraftBlindLevel),
    tournamentConfig: config,
  }), [config, form, generatedStructure]);
  const summary = useMemo(() => buildSummary(payload), [payload]);
  const demoAuthActive = Boolean(user?.isdemo || demoTokenPresent);
  const canClaimWithCurrentAuth = Boolean(token && !demoAuthActive);

  const saveDraftMutation = useMutation({
    mutationFn: async (data: TournamentDraftPayload) => {
      setSaveStatus('saving');
      return draftId
        ? api.updateTournamentDraft(draftId, data)
        : api.createTournamentDraft(data);
    },
    onSuccess: (draft) => {
      setDraftId(draft.id);
      localStorage.setItem(DRAFT_STORAGE_KEY, draft.id);
      setSaveStatus('saved');
      trackEvent('quick_start_generation_succeeded', {
        player_count_bucket: bucketPlayers(form.players),
        duration_bucket: form.durationBucket,
        authenticated: canClaimWithCurrentAuth,
      });
    },
    onError: () => setSaveStatus('error'),
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const draft = draftId ? await api.updateTournamentDraft(draftId, payload) : await api.createTournamentDraft(payload);
      setDraftId(draft.id);
      localStorage.setItem(DRAFT_STORAGE_KEY, draft.id);
      return api.claimTournamentDraft(draft.id);
    },
    onSuccess: ({ tournamentid }) => {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      trackEvent('draft_claim_succeeded', { authenticated: true });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      navigate(`/tournament/${tournamentid}`);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not save tournament.';
      setClaimError(message);
      trackEvent('draft_claim_failed', { failure_category: message.slice(0, 40) });
    },
  });

  useEffect(() => {
    const demoToken = sessionStorage.getItem('pb_demo_token');
    if (!user?.isdemo && !demoToken) {
      if (demoTokenPresent) setDemoTokenPresent(false);
      return;
    }
    sessionStorage.removeItem('pb_demo_token');
    setDemoTokenPresent(false);
    if (user?.isdemo || token === demoToken) {
      logout();
      queryClient.clear();
    }
  }, [demoTokenPresent, logout, queryClient, token, user?.isdemo]);

  useEffect(() => {
    if (!draftId) {
      trackEvent('quick_start_started', { authenticated: Boolean(token) });
      return;
    }
    let cancelled = false;
    api.getTournamentDraft(draftId)
      .then((draft) => {
        if (cancelled) return;
        if (draft.status === 'expired') {
          setSaveStatus('expired');
          return;
        }
        setForm((current) => ({ ...current, ...draft.wizardInput }));
        setPhase('preview');
        setSaveStatus('restored');
      })
      .catch(() => {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        setDraftId('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'preview' || !draftId) return;
    const timeout = window.setTimeout(() => {
      saveDraftMutation.mutate(payload);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [payload, phase, draftId]);

  function updateForm(updates: Partial<QuickStartWizardInput>) {
    setForm((current) => ({ ...current, ...updates }));
  }

  function chooseDuration(durationBucket: DurationBucket) {
    const hours = durationBucket === '2h' ? 2 : durationBucket === '4h' ? 4 : 3;
    updateForm({
      durationBucket,
      targetHours: hours,
      levelMinutes: durationBucket === '2h' ? 15 : 20,
      breakCount: durationBucket === '2h' ? 0 : durationBucket === '4h' ? 2 : 1,
    });
    trackEvent('quick_start_duration_selected', { duration_bucket: durationBucket });
  }

  function buildPreview() {
    if (form.players < 2) return;
    setClaimError('');
    setPhase('preview');
    trackEvent('quick_start_generation_requested', {
      player_count_bucket: bucketPlayers(form.players),
      duration_bucket: form.durationBucket,
      authenticated: canClaimWithCurrentAuth,
    });
    saveDraftMutation.mutate(payload);
  }

  function startOver() {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraftId('');
    setPhase('wizard');
    setSaveStatus('idle');
    setAdvancedOpen(false);
    setForm((current) => ({ ...current, players: DEFAULT_PLAYERS, durationBucket: '3h', targetHours: 3, levelMinutes: 20, breakCount: 1 }));
  }

  async function saveAndRun() {
    setClaimError('');
    trackEvent('save_and_run_clicked', { authenticated: canClaimWithCurrentAuth, demo_auth_active: demoAuthActive });
    if (canClaimWithCurrentAuth) {
      trackEvent('draft_claim_started', { authenticated: true });
      claimMutation.mutate();
      return;
    }
    setAuthOpen(true);
    setAuthMode('create');
    setCreateStep('email');
    setAuthError('');
    trackEvent('auth_prompt_opened', { authenticated: false });
  }

  function runWithoutSaving() {
    setClaimError('');
    saveQuickStartRun(payload);
    setAuthOpen(false);
    trackEvent('quick_start_run_without_saving', {
      player_count_bucket: bucketPlayers(form.players),
      duration_bucket: form.durationBucket,
      demo_auth_active: demoAuthActive,
    });
    navigate('/quick-start/run');
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthError('');
    const email = authEmail.trim();
    if (!isValidEmail(email)) {
      setAuthError('Enter a valid email address.');
      setCreateStep('email');
      return;
    }
    if (authMode === 'create' && createStep === 'email') {
      setCreateStep('password');
      trackEvent('auth_create_email_submitted');
      return;
    }
    if (authMode === 'create' && authPassword.length < MIN_PASSWORD_LENGTH) {
      setAuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (authMode === 'create' && authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    if (authMode === 'create' && !acceptTerms) {
      setAuthError('You must agree to the Terms of Service to create an account.');
      return;
    }
    setAuthPending(true);
    try {
      const { token: nextToken } = authMode === 'login'
        ? await api.login({ email, password: authPassword })
        : await api.register({
            email,
            password: authPassword,
            name: nameFromEmail(email),
            displayname: nameFromEmail(email),
            acceptterms: acceptTerms,
            returnpath: '/quick-start',
            quickstartsession: true,
          });
      if (!nextToken) throw new Error('Could not start your account session.');
      sessionStorage.removeItem('pb_demo_token');
      setDemoTokenPresent(false);
      localStorage.setItem('pb_token', nextToken);
      queryClient.clear();
      const user = await api.me();
      setAuth(nextToken, user);
      setAuthOpen(false);
      trackEvent('auth_succeeded', { auth_method: authMode });
      claimMutation.mutate();
    } catch (err) {
      const message = err instanceof Error ? err.message : authMode === 'login' ? 'Sign in failed.' : 'Could not create account.';
      setAuthError(message);
      trackEvent('auth_failed', { auth_method: authMode, failure_category: message.slice(0, 40) });
    } finally {
      setAuthPending(false);
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-pit-bg text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="ThePokerPlanner home">
          <BrandLockup compact showSlogan={false} />
        </Link>
        <Link to="/login" className="btn-ghost min-h-10 px-3 text-sm">Log in</Link>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        {phase === 'wizard' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.8fr)]">
            <section className="rounded-xl border border-pit-border bg-pit-surface/80 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.24)] sm:p-5">
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-4xl">Build your poker night</h1>
              <p className="mt-1 text-sm leading-5 text-pit-muted sm:mt-2 sm:leading-6">Tell us the size and pace. We will build the structure.</p>

              <div className="mt-3 space-y-3 sm:mt-5 sm:space-y-5">
                <section>
                  <h2 className="text-sm font-black text-white">How many players?</h2>
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-pit-border bg-pit-bg/55 p-2 sm:mt-3 sm:gap-3 sm:p-3">
                    <button type="button" className="btn-ghost h-11 w-11 px-0" aria-label="Decrease players" onClick={() => updateForm({ players: Math.max(2, form.players - 1) })}><Minus size={18} /></button>
                    <input
                      className="input h-11 min-w-0 flex-1 text-center text-2xl font-black tabular-nums sm:h-12"
                      type="number"
                      min="2"
                      max="500"
                      value={form.players}
                      onChange={(event) => updateForm({ players: Math.max(2, Math.min(500, Math.round(Number(event.target.value) || DEFAULT_PLAYERS))) })}
                      onBlur={() => trackEvent('quick_start_player_count_changed', { player_count_bucket: bucketPlayers(form.players) })}
                    />
                    <button type="button" className="btn-ghost h-11 w-11 px-0" aria-label="Increase players" onClick={() => updateForm({ players: Math.min(500, form.players + 1) })}><Plus size={18} /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {[6, 10, 16, 24].map((count) => (
                      <button key={count} type="button" className={`min-h-10 rounded-lg border px-2 text-sm font-bold ${form.players === count ? 'border-pit-teal bg-pit-teal text-[#071315]' : 'border-pit-border bg-pit-bg/45 text-pit-text'}`} onClick={() => updateForm({ players: count })}>
                        {count}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-black text-white">How long should the tournament run?</h2>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
                    {[
                      ['2h', 'About 2 hours'],
                      ['3h', 'About 3 hours'],
                      ['4h', 'About 4 hours'],
                      ['recommend', 'Recommend one for me'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`flex min-h-12 items-center justify-between rounded-xl border px-3 text-left text-xs font-black transition sm:min-h-14 sm:text-sm ${form.durationBucket === value ? 'border-pit-teal bg-pit-teal/12 text-white' : 'border-pit-border bg-pit-bg/45 text-pit-text hover:border-white/25'}`}
                        onClick={() => chooseDuration(value as DurationBucket)}
                      >
                        {label}
                        {form.durationBucket === value && <Check className="text-pit-teal" size={17} />}
                      </button>
                    ))}
                  </div>
                </section>

                <AdvancedOptions open={advancedOpen} form={form} onToggle={() => {
                  setAdvancedOpen((value) => !value);
                  if (!advancedOpen) trackEvent('quick_start_advanced_opened');
                }} onChange={updateForm} />
              </div>
            </section>

            <div className="lg:hidden">
              <PreviewCard summary={summary} levels={payload.generatedStructure} />
            </div>

            <aside className="hidden lg:block">
              <PreviewCard summary={summary} levels={payload.generatedStructure} />
            </aside>
          </div>
        ) : (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(340px,0.62fr)]">
            <div className="rounded-xl border border-pit-border bg-pit-surface/86 p-4 sm:p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-pit-teal">Generated tournament preview</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Your tournament is ready</h1>
              <p className="mt-2 text-sm leading-6 text-pit-muted">We built a complete blind structure around your game.</p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric icon={<Users size={18} />} label="Players" value={String(form.players)} />
                <Metric icon={<Clock3 size={18} />} label="Duration" value={summary.durationText} />
                <Metric icon={<Layers3 size={18} />} label="Levels" value={String(summary.playLevels)} />
                <Metric icon={<Coffee size={18} />} label="Breaks" value={String(summary.breaks)} />
              </div>

              <div className="mt-4 lg:hidden">
                <PreviewActions
                  claimError={claimError}
                  claimPending={claimMutation.isPending}
                  saveStatus={saveStatus}
                  onAdjust={() => { setPhase('wizard'); setAdvancedOpen(true); }}
                  onRunWithoutSaving={runWithoutSaving}
                  onSave={saveAndRun}
                  onStartOver={startOver}
                />
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-pit-border">
                <StructureList levels={payload.generatedStructure} flush />
              </div>
            </div>

            <aside className="hidden lg:block">
              <PreviewActions
                claimError={claimError}
                claimPending={claimMutation.isPending}
                saveStatus={saveStatus}
                onAdjust={() => { setPhase('wizard'); setAdvancedOpen(true); }}
                onRunWithoutSaving={runWithoutSaving}
                onSave={saveAndRun}
                onStartOver={startOver}
              />
            </aside>
          </section>
        )}
      </main>

      {phase === 'wizard' && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-pit-border bg-pit-bg/96 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6 lg:hidden">
          <button type="button" className="btn-primary h-12 w-full gap-2" onClick={buildPreview} disabled={saveDraftMutation.isPending || generatedStructure.length === 0}>
            <Trophy size={18} />{saveDraftMutation.isPending ? 'Building...' : 'Quick Tournament'}
          </button>
        </div>
      )}
      {phase === 'wizard' && (
        <div className="mx-auto hidden max-w-6xl px-4 pb-8 sm:px-6 lg:block">
          <button type="button" className="btn-primary mt-5 h-12 min-w-64 gap-2" onClick={buildPreview} disabled={saveDraftMutation.isPending || generatedStructure.length === 0}>
            <Trophy size={18} />{saveDraftMutation.isPending ? 'Building...' : 'Quick Tournament'}
          </button>
        </div>
      )}

      <Modal title="Save & Run" open={authOpen} onClose={() => setAuthOpen(false)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-pit-border bg-pit-bg/50 p-1">
            <button
              type="button"
              className={`flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-black transition ${authMode === 'create' ? 'bg-pit-teal text-[#071315]' : 'text-pit-text hover:bg-white/[0.04] hover:text-white'}`}
              onClick={() => { setAuthMode('create'); setCreateStep('email'); setAuthError(''); trackEvent('auth_method_selected', { auth_method: 'create' }); }}
            >
              <Mail size={16} />Create
            </button>
            <button
              type="button"
              className={`flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-black transition ${authMode === 'login' ? 'bg-pit-teal text-[#071315]' : 'text-pit-text hover:bg-white/[0.04] hover:text-white'}`}
              onClick={() => { setAuthMode('login'); setAuthError(''); trackEvent('auth_method_selected', { auth_method: 'login' }); }}
            >
              <LogIn size={16} />Sign in
            </button>
          </div>
          <form className="space-y-3" onSubmit={submitAuth}>
            {authError && <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200">{authError}</p>}
            {(authMode === 'login' || createStep === 'email') && (
              <input className="input min-h-12" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email address" required autoFocus />
            )}
            {authMode === 'login' && (
              <input className="input min-h-12" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password" required />
            )}
            {authMode === 'create' && createStep === 'password' && (
              <>
                <input className="input min-h-12" type="password" minLength={MIN_PASSWORD_LENGTH} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password" required autoFocus />
                <input className="input min-h-12" type="password" minLength={MIN_PASSWORD_LENGTH} value={authConfirmPassword} onChange={(event) => setAuthConfirmPassword(event.target.value)} placeholder="Confirm password" required />
                <label className="flex items-start gap-3 rounded-lg border border-pit-border bg-pit-bg/45 p-3 text-xs leading-5 text-pit-text">
                  <input className="mt-1 accent-pit-teal" type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} required />
                  <span>I agree to the <Link className="font-semibold text-pit-teal" to="/terms" target="_blank">Terms of Service</Link>.</span>
                </label>
              </>
            )}
            <button
              type="submit"
              className="btn-primary min-h-12 w-full"
              disabled={
                !isValidEmail(authEmail)
                || (authMode === 'login' && !authPassword)
                || (authMode === 'create' && createStep === 'password' && (!authPassword || !authConfirmPassword || !acceptTerms))
                || authPending
                || claimMutation.isPending
              }
            >
              {authPending || claimMutation.isPending ? 'Saving...' : authMode === 'login' ? 'Sign In & Save' : createStep === 'email' ? 'Next' : 'Create Account & Save'}
            </button>
            {authMode === 'create' && createStep === 'password' && (
              <button type="button" className="flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-pit-muted hover:text-white" onClick={() => { setCreateStep('email'); setAuthError(''); }}>
                <ArrowLeft size={15} />Back
              </button>
            )}
          </form>
        </div>
      </Modal>
    </div>
  );
}

function PreviewActions({ claimError, claimPending, saveStatus, onAdjust, onRunWithoutSaving, onSave, onStartOver }: {
  claimError: string;
  claimPending: boolean;
  saveStatus: string;
  onAdjust: () => void;
  onRunWithoutSaving: () => void;
  onSave: () => void;
  onStartOver: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-pit-teal/30 bg-pit-teal/[0.07] p-4">
        <h2 className="text-base font-black text-white">Ready to keep it?</h2>
        <p className="mt-1 text-sm leading-6 text-pit-text">Save it to your account, or run this one tournament locally without saving.</p>
        <button type="button" className="btn-primary mt-4 min-h-12 w-full gap-2" onClick={onSave} disabled={claimPending}>
          <Save size={18} />{claimPending ? 'Saving...' : 'Save & Run Tournament'}
        </button>
        <button type="button" className="btn-ghost mt-2 min-h-11 w-full gap-2" onClick={onRunWithoutSaving} disabled={claimPending}>
          <Play size={17} />Run Without Saving
        </button>
        <button type="button" className="btn-ghost mt-2 min-h-11 w-full gap-2" onClick={onAdjust}>
          <SlidersHorizontal size={17} />Adjust Structure
        </button>
        <button type="button" className="mt-3 flex w-full items-center justify-center gap-2 text-sm font-semibold text-pit-muted hover:text-white" onClick={onStartOver}>
          <RotateCcw size={15} />Start over
        </button>
      </div>
      {claimError && <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200">{claimError}</p>}
      <SaveStatus status={saveStatus} />
    </div>
  );
}

function AdvancedOptions({ open, form, onToggle, onChange }: { open: boolean; form: QuickStartWizardInput; onToggle: () => void; onChange: (updates: Partial<QuickStartWizardInput>) => void }) {
  return (
    <section className="rounded-xl border border-pit-border bg-pit-bg/45">
      <button type="button" className="flex min-h-12 w-full items-center justify-between px-3 text-left text-sm font-black text-white" onClick={onToggle} aria-expanded={open}>
        <span className="flex items-center gap-2"><SlidersHorizontal className="text-pit-teal" size={17} />Advanced options</span>
        <ChevronDown className={`text-pit-muted transition ${open ? 'rotate-180' : ''}`} size={17} />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-pit-border p-3 sm:grid-cols-2">
          <NumberField label="Starting stack" value={form.startingStack} min={100} step={100} onChange={(startingStack) => onChange({ startingStack })} />
          <NumberField label="Level minutes" value={form.levelMinutes} min={1} onChange={(levelMinutes) => onChange({ levelMinutes })} />
          <NumberField label="Starting big blind" value={form.startingBigBlind} min={1} onChange={(startingBigBlind) => onChange({ startingBigBlind })} />
          <NumberField label="Breaks" value={form.breakCount} min={0} onChange={(breakCount) => onChange({ breakCount })} />
          <NumberField label="Break minutes" value={form.breakMinutes} min={1} onChange={(breakMinutes) => onChange({ breakMinutes })} />
          <NumberField label="Start ante at level" value={form.anteStartLevel} min={0} onChange={(anteStartLevel) => onChange({ anteStartLevel })} />
          <TextField label="Chip denominations" value={form.chipDenominations} onChange={(chipDenominations) => {
            const available = parseChipDenominations(chipDenominations);
            onChange({ chipDenominations, colorUps: selectedChipUps(form.colorUps, available).join(',') });
          }} />
          <ChipUpSelector denominations={parseChipDenominations(form.chipDenominations)} value={form.colorUps} onChange={(colorUps) => onChange({ colorUps })} />
        </div>
      )}
    </section>
  );
}

function NumberField({ label, value, min, step = 1, onChange }: { label: string; value: number; min: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-pit-text">{label}</span>
      <input className="input min-h-11" type="number" min={min} step={step} value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))} />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-1 block text-xs font-semibold text-pit-text">{label}</span>
      <input className="input min-h-11" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ChipUpSelector({ denominations, value, onChange }: { denominations: number[]; value: string; onChange: (value: string) => void }) {
  const selected = selectedChipUps(value, denominations);
  function toggleChip(denomination: number) {
    const next = selected.includes(denomination)
      ? selected.filter((chip) => chip !== denomination)
      : [...selected, denomination].sort((a, b) => a - b);
    onChange(next.join(','));
  }

  return (
    <div className="block sm:col-span-2">
      <span className="mb-2 block text-xs font-semibold text-pit-text">Chip-up chips</span>
      <div className="flex flex-wrap gap-2">
        {denominations.map((denomination) => {
          const active = selected.includes(denomination);
          return (
            <button
              key={denomination}
              type="button"
              className={`min-h-10 rounded-full border px-3 text-sm font-black transition ${active ? 'border-pit-teal bg-pit-teal text-[#071315]' : 'border-pit-border bg-pit-bg/45 text-pit-text hover:border-white/25 hover:text-white'}`}
              onClick={() => toggleChip(denomination)}
              aria-pressed={active}
            >
              {denomination.toLocaleString()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewCard({ summary, levels }: { summary: ReturnType<typeof buildSummary>; levels: Omit<BlindLevel, 'id'>[] }) {
  return (
    <div className="rounded-xl border border-pit-border bg-pit-surface/82 p-3 sm:p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-pit-teal">Live preview</p>
      <h2 className="mt-1 text-lg font-black text-white sm:mt-2 sm:text-xl">Structure shape</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric icon={<Clock3 size={17} />} label="Duration" value={summary.durationText} />
        <Metric icon={<Layers3 size={17} />} label="Levels" value={String(summary.playLevels)} />
      </div>
      <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-pit-border lg:max-h-[30rem]">
        <StructureList levels={levels} flush />
      </div>
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

function StructureList({ levels, limit, flush = false }: { levels: Omit<BlindLevel, 'id'>[]; limit?: number; flush?: boolean }) {
  const visible = typeof limit === 'number' ? levels.slice(0, limit) : levels;
  return (
    <div className={`${flush ? '' : 'mt-4'} divide-y divide-pit-border`}>
      {visible.map((level) => {
        const isBreak = level.smallblind === 0 && level.bigblind === 0;
        return (
          <div key={`${level.level}-${level.label}`} className={`grid min-h-12 grid-cols-[52px_minmax(0,1fr)_72px] items-center gap-3 px-3 py-2 text-sm ${isBreak ? 'bg-amber-300/[0.06]' : ''}`}>
            <span className="font-mono text-pit-muted">{level.level}</span>
            <span className={`min-w-0 truncate font-bold ${isBreak ? 'text-amber-200' : 'text-white'}`}>
              {isBreak ? level.label : `${level.smallblind.toLocaleString()} / ${level.bigblind.toLocaleString()}${level.ante ? ` / ${level.ante.toLocaleString()}` : ''}`}
            </span>
            <span className="text-right text-pit-text">{level.minutes ? `${level.minutes}m` : '-'}</span>
          </div>
        );
      })}
    </div>
  );
}

function selectedChipUps(value: string, denominations: number[]) {
  const allowed = new Set(denominations);
  return Array.from(new Set(
    value
      .split(/[,;\s]+/)
      .map((piece) => Math.round(Number(piece.trim())))
      .filter((denomination) => Number.isFinite(denomination) && allowed.has(denomination))
  )).sort((a, b) => a - b);
}

function SaveStatus({ status }: { status: string }) {
  if (status === 'idle') return null;
  const copy = status === 'saving' ? 'Saving...' : status === 'saved' ? 'Draft saved' : status === 'restored' ? 'Draft restored' : status === 'expired' ? 'This draft has expired. Rebuild it from your last saved settings.' : "Couldn't save draft";
  const Icon = status === 'error' || status === 'expired' ? LockKeyhole : ShieldCheck;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-pit-border bg-pit-bg/45 px-3 py-2 text-sm text-pit-text">
      <Icon className="mt-0.5 shrink-0 text-pit-teal" size={16} />{copy}
    </p>
  );
}

function resolvedHours(form: QuickStartWizardInput) {
  if (form.durationBucket === '2h') return 2;
  if (form.durationBucket === '4h') return 4;
  if (form.durationBucket === 'recommend') return form.players <= 10 ? 2.5 : form.players <= 24 ? 3 : 4;
  return form.targetHours || 3;
}

function buildTournamentConfig(form: QuickStartWizardInput): TournamentDraftConfig {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    name: 'Quick Start Tournament',
    tourneydate: tomorrow,
    tourneytime: '19:00',
    buyin: 0,
    rake: 0,
    rebuyprice: 0,
    rebuychips: form.rebuysEnabled ? form.rebuyChips : 0,
    rebuylastlevel: form.rebuysEnabled ? 4 : null,
    addonprice: 0,
    addonchips: form.addonsEnabled ? form.addonChips : 0,
    maxplayers: form.players,
    playerselftracking: false,
    registerself: true,
  };
}

function toDraftBlindLevel(level: Omit<BlindLevel, 'id'>): Omit<BlindLevel, 'id'> {
  return {
    level: Number(level.level),
    label: level.label,
    smallblind: Number(level.smallblind),
    bigblind: Number(level.bigblind),
    ante: Number(level.ante),
    minutes: Number(level.minutes),
    islastlevel: Boolean(level.islastlevel),
  };
}

function buildSummary(payload: TournamentDraftPayload) {
  const minutes = payload.generatedStructure.reduce((sum, level) => sum + Number(level.minutes || 0), 0);
  const playLevels = payload.generatedStructure.filter((level) => level.bigblind > 0).length;
  const breaks = payload.generatedStructure.filter((level) => level.bigblind === 0 && level.minutes > 0).length;
  return {
    minutes,
    durationText: minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`,
    playLevels,
    breaks,
  };
}

function bucketPlayers(players: number) {
  if (players <= 10) return '2-10';
  if (players <= 24) return '11-24';
  if (players <= 60) return '25-60';
  return '61+';
}

function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email.trim());
}

function nameFromEmail(email: string) {
  const localPart = email.split('@')[0]?.trim();
  return (localPart || 'Poker Host').slice(0, 80);
}

function hasDemoToken() {
  return typeof window !== 'undefined' && Boolean(sessionStorage.getItem('pb_demo_token'));
}
