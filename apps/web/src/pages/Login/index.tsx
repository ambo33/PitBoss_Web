import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { getPendingGroupInvite, setPendingGroupInvite } from '../../utils/invites';

type View = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export default function LoginPage() {
  const [view, setView] = useState<View>('login');
  const [pendingEmail, setPendingEmail] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('token');
  const inviteCode = searchParams.get('invite') ?? getPendingGroupInvite() ?? '';

  if (resetToken && view !== 'reset') setView('reset');
  useEffect(() => {
    if (inviteCode) setPendingGroupInvite(inviteCode);
  }, [inviteCode]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4
                    bg-pit-bg bg-[radial-gradient(ellipse_at_top,theme(colors.pit.teal/8%)_0%,transparent_60%)]">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-pit-teal/15 border border-pit-teal/30
                        flex items-center justify-center shadow-[0_0_32px_theme(colors.pit.teal/25%)]">
          <Trophy size={28} className="text-pit-teal" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight
                       bg-gradient-to-r from-pit-teal to-emerald-400 bg-clip-text text-transparent">
          PitBoss
        </h1>
        <p className="text-pit-muted text-sm">Poker tournament management</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-pit-surface border border-pit-border rounded-2xl
                      shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden">
        <div className="p-6">
          {view === 'login'    && <LoginForm inviteCode={inviteCode} onSwitch={setView} onSuccess={() => navigate(inviteCode ? `/join/${encodeURIComponent(inviteCode)}` : '/')} />}
          {view === 'register' && <RegisterForm onSuccess={(email) => { setPendingEmail(email); setView('verify'); }} onSwitch={setView} />}
          {view === 'verify'   && <VerifyForm email={pendingEmail} inviteCode={inviteCode} onSuccess={() => navigate(inviteCode ? `/join/${encodeURIComponent(inviteCode)}` : '/')} />}
          {view === 'forgot'   && <ForgotForm onBack={() => setView('login')} />}
          {view === 'reset'    && <ResetForm token={resetToken ?? ''} onSuccess={() => setView('login')} />}
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{msg}</p>
  );
}

function LoginForm({ inviteCode, onSwitch, onSuccess }: { inviteCode: string; onSwitch: (v: View) => void; onSuccess: () => void }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { token } = await api.login({ email, password });
      localStorage.setItem('pb_token', token);
      const user = await api.me();
      setAuth(token, user);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold text-white mb-5">Sign in</h2>
      {inviteCode && <p className="text-sm text-pit-text">Sign in to join your invited group.</p>}
      {error && <ErrorBanner msg={error} />}
      <input className="input" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
      <input className="input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
      <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="flex justify-between text-sm pt-1">
        <button type="button" onClick={() => onSwitch('register')} className="text-pit-muted hover:text-white transition-colors">
          Create account
        </button>
        <button type="button" onClick={() => onSwitch('forgot')} className="text-pit-muted hover:text-white transition-colors">
          Forgot password?
        </button>
      </div>
    </form>
  );
}

function RegisterForm({ onSuccess, onSwitch }: { onSuccess: (email: string) => void; onSwitch: (v: View) => void }) {
  const [email, setEmail] = useState('');
  const [displayname, setDisplayname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try {
      await api.register({ email, password, displayname });
      onSuccess(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h2 className="text-xl font-bold text-white mb-5">Create account</h2>
      {error && <ErrorBanner msg={error} />}
      <input className="input" type="text" placeholder="Display name" value={displayname} onChange={e => setDisplayname(e.target.value)} autoFocus />
      <input className="input" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
      <input className="input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
      <input className="input" type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
      <button type="submit" className="btn-primary w-full py-2.5 mt-1" disabled={loading}>
        {loading ? 'Creating…' : 'Create account'}
      </button>
      <p className="text-center text-sm text-pit-muted pt-1">
        Already have an account?{' '}
        <button type="button" onClick={() => onSwitch('login')} className="text-pit-teal hover:text-pit-teal-hover transition-colors font-medium">
          Sign in
        </button>
      </p>
    </form>
  );
}

function VerifyForm({ email, inviteCode, onSuccess }: { email: string; inviteCode: string; onSuccess: () => void }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { token } = await api.verifyEmail({ email, pin });
      localStorage.setItem('pb_token', token);
      const user = await api.me();
      setAuth(token, user);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold text-white">Verify email</h2>
      <p className="text-sm text-pit-muted">
        Enter the 6-digit code sent to <span className="text-white font-medium">{email}</span>
      </p>
      {inviteCode && <p className="text-sm text-pit-text">After verification, your group join will continue automatically.</p>}
      {error && <ErrorBanner msg={error} />}
      <input className="input text-center font-mono text-2xl tracking-[0.4em] py-3"
        type="text" inputMode="numeric" maxLength={6} placeholder="000000"
        value={pin} onChange={e => setPin(e.target.value)} required autoFocus />
      <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
        {loading ? 'Verifying…' : 'Verify email'}
      </button>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await api.requestReset(email).catch(() => {});
    setSent(true);
    setLoading(false);
  }

  return sent ? (
    <div className="space-y-5 text-center py-2">
      <div className="w-12 h-12 rounded-2xl bg-pit-teal/15 border border-pit-teal/20 flex items-center justify-center mx-auto text-xl">
        ✉️
      </div>
      <div>
        <p className="text-white font-semibold">Check your email</p>
        <p className="text-pit-muted text-sm mt-1">If that address is registered, a reset link is on its way.</p>
      </div>
      <button onClick={onBack} className="btn-ghost w-full">Back to sign in</button>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold text-white">Reset password</h2>
      <p className="text-sm text-pit-muted">We'll send a reset link to your email.</p>
      <input className="input" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
      <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
        {loading ? 'Sending…' : 'Send reset link'}
      </button>
      <button type="button" onClick={onBack} className="text-sm text-pit-muted hover:text-white transition-colors w-full text-center">
        Back to sign in
      </button>
    </form>
  );
}

function ResetForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try {
      await api.resetPassword({ token, password });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold text-white">Set new password</h2>
      {error && <ErrorBanner msg={error} />}
      <input className="input" type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
      <input className="input" type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
      <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
        {loading ? 'Saving…' : 'Set password'}
      </button>
    </form>
  );
}
