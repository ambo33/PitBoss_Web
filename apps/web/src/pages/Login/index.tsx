import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import BrandLockup from '../../components/BrandLockup';
import { useAuthStore } from '../../store/auth';
import { getPendingGroupInvite, setPendingGroupInvite } from '../../utils/invites';

type View = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export default function LoginPage() {
  const [view, setView] = useState<View>('login');
  const [pendingEmail, setPendingEmail] = useState('');
  const [autoVerifyMessage, setAutoVerifyMessage] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('token');
  const resetStatus = searchParams.get('reset');
  const requestedMode = searchParams.get('mode');
  const verifyEmail = searchParams.get('verifyEmail');
  const verifyCode = searchParams.get('code');
  const inviteCode = searchParams.get('invite') ?? getPendingGroupInvite() ?? '';
  const nextPath = searchParams.get('next');

  function resolveSuccessPath() {
    if (nextPath) return nextPath;
    if (inviteCode) return `/join/${encodeURIComponent(inviteCode)}`;
    return '/';
  }

  useEffect(() => {
    if (inviteCode) setPendingGroupInvite(inviteCode);
  }, [inviteCode]);

  useEffect(() => {
    if (verifyEmail) setPendingEmail(verifyEmail);
    if (resetToken) {
      setView('reset');
      return;
    }
    if (resetStatus === 'success') {
      setView('login');
      return;
    }
    if (requestedMode === 'register') {
      setView('register');
      return;
    }
    if (requestedMode === 'verify' || verifyEmail) {
      setView('verify');
      return;
    }
    setView((currentView) => (currentView === 'reset' ? 'login' : currentView));
  }, [requestedMode, resetStatus, resetToken, verifyEmail]);

  useEffect(() => {
    if (!verifyEmail || !verifyCode) return;
    let cancelled = false;
    setAutoVerifyMessage('Verifying your email...');
    api.verifyEmail({ email: verifyEmail, pin: verifyCode })
      .then(async ({ token }) => {
        if (cancelled) return;
        localStorage.setItem('pb_token', token);
        queryClient.clear();
        const user = await api.me();
        if (cancelled) return;
        setAuth(token, user);
        navigate(resolveSuccessPath(), { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        setAutoVerifyMessage(err instanceof Error ? err.message : 'Verification failed. Enter the code manually.');
      });
    return () => {
      cancelled = true;
    };
  }, [verifyEmail, verifyCode, queryClient, setAuth, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-pit-bg text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(18,46,48,0.62)_0%,rgba(17,17,19,0.96)_42%,#111113_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-pit-teal/45" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
        <Link to="/" aria-label="ThePokerPlanner home">
          <BrandLockup compact showSlogan={false} />
        </Link>
        <nav className="flex items-center gap-2">
          <Link className="hidden px-3 py-2 text-sm font-medium text-pit-text transition-colors hover:text-white sm:inline-flex" to="/landing">Overview</Link>
          {view !== 'reset' && (
            view === 'register' ? (
              <button className="btn-ghost px-3 py-2 text-xs sm:text-sm" type="button" onClick={() => setView('login')}>
                Sign in
              </button>
            ) : (
              <button className="btn-primary px-3 py-2 text-xs sm:text-sm" type="button" onClick={() => setView('register')}>
                Create account
              </button>
            )
          )}
        </nav>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-6xl flex-col items-center justify-center px-5 pb-12 pt-4 sm:px-8 lg:px-10">
        <div className="mb-6 hidden w-full max-w-sm sm:block">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-pit-teal">Welcome back</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Sign in to ThePokerPlanner</h1>
          <p className="mt-2 text-sm leading-6 text-pit-text">Manage poker nights, groups, leagues, and alerts from one clean dashboard.</p>
        </div>

        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-pit-surface/96 shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
          <div className="h-1 bg-pit-teal" />
          <div className="p-6">
            {view === 'login' && (
              <LoginForm
                inviteCode={inviteCode}
                resetSuccess={resetStatus === 'success'}
                onSwitch={setView}
                onSuccess={() => navigate(resolveSuccessPath())}
              />
            )}
            {view === 'register' && (
              <RegisterForm
                onSuccess={(email) => {
                  setPendingEmail(email);
                  setView('verify');
                }}
                onSwitch={setView}
              />
            )}
            {view === 'verify' && (
              <VerifyForm
                email={pendingEmail}
                inviteCode={inviteCode}
                autoMessage={autoVerifyMessage}
                onSuccess={() => navigate(resolveSuccessPath())}
              />
            )}
            {view === 'forgot' && <ForgotForm onBack={() => setView('login')} />}
            {view === 'reset' && (
              <ResetForm
                token={resetToken ?? ''}
                onSuccess={() => navigate('/login?reset=success', { replace: true })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">{msg}</p>
  );
}

function LoginForm({
  inviteCode,
  resetSuccess,
  onSwitch,
  onSuccess,
}: {
  inviteCode: string;
  resetSuccess?: boolean;
  onSwitch: (v: View) => void;
  onSuccess: () => void;
}) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await api.login({ email, password });
      localStorage.setItem('pb_token', token);
      queryClient.clear();
      const user = await api.me();
      setAuth(token, user);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="mb-5 text-xl font-bold text-white">Sign in</h2>
      {inviteCode && <p className="text-sm text-pit-text">Sign in to join your invited group.</p>}
      {resetSuccess && (
        <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
          Password reset successful. Sign in with your new password.
        </p>
      )}
      {error && <ErrorBanner msg={error} />}
      <input className="input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
      <div className="flex justify-between pt-1 text-sm">
        <button type="button" onClick={() => onSwitch('register')} className="text-pit-muted transition-colors hover:text-white">
          Create account
        </button>
        <button type="button" onClick={() => onSwitch('forgot')} className="text-pit-muted transition-colors hover:text-white">
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
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!acceptTerms) {
      setError('You must agree to the Terms of Service to create an account.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.register({ email, password, displayname, acceptterms: acceptTerms });
      onSuccess(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h2 className="mb-5 text-xl font-bold text-white">Create account</h2>
      {error && <ErrorBanner msg={error} />}
      <input className="input" type="text" placeholder="Display name" value={displayname} onChange={(e) => setDisplayname(e.target.value)} autoFocus />
      <input className="input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <input className="input" type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-3 text-left">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-pit-border bg-pit-bg accent-pit-teal"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          required
        />
        <span className="text-xs leading-5 text-pit-text">
          I agree to the{' '}
          <Link to="/terms" target="_blank" rel="noreferrer" className="font-semibold text-pit-teal hover:text-pit-teal-hover">
            Terms of Service
          </Link>
          , including the rules against using ThePokerPlanner to facilitate illegal gambling or illegal activity, and understand uploaded avatars or clips must be mine to use and appropriate for a poker group.
        </span>
      </label>
      <button type="submit" className="btn-primary mt-1 w-full py-2.5" disabled={loading}>
        {loading ? 'Creating...' : 'Create account'}
      </button>
      <p className="pt-1 text-center text-sm text-pit-muted">
        Already have an account?{' '}
        <button type="button" onClick={() => onSwitch('login')} className="font-medium text-pit-teal transition-colors hover:text-pit-teal-hover">
          Sign in
        </button>
      </p>
    </form>
  );
}

function VerifyForm({ email, inviteCode, autoMessage, onSuccess }: { email: string; inviteCode: string; autoMessage?: string; onSuccess: () => void }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await api.verifyEmail({ email, pin });
      localStorage.setItem('pb_token', token);
      queryClient.clear();
      const user = await api.me();
      setAuth(token, user);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold text-white">Verify email</h2>
      <p className="text-sm text-pit-muted">
        Enter the 6-digit code sent to <span className="font-medium text-white">{email}</span>
      </p>
      {inviteCode && <p className="text-sm text-pit-text">After verification, your group join will continue automatically.</p>}
      {autoMessage && (
        <p className="rounded-lg border border-pit-teal/20 bg-pit-teal/10 px-3 py-2 text-sm text-pit-text">
          {autoMessage}
        </p>
      )}
      {error && <ErrorBanner msg={error} />}
      <input
        className="input py-3 text-center font-mono text-2xl tracking-[0.4em]"
        type="text"
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        required
        autoFocus
      />
      <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
        {loading ? 'Verifying...' : 'Verify email'}
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
    <div className="space-y-5 py-2 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-pit-teal/20 bg-pit-teal/15 text-lg font-bold text-pit-teal">
        @
      </div>
      <div>
        <p className="font-semibold text-white">Check your email</p>
        <p className="mt-1 text-sm text-pit-muted">If that address is registered, a reset link is on its way.</p>
      </div>
      <button onClick={onBack} className="btn-ghost w-full">Back to sign in</button>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold text-white">Reset password</h2>
      <p className="text-sm text-pit-muted">We'll send a reset link to your email.</p>
      <input className="input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
        {loading ? 'Sending...' : 'Send reset link'}
      </button>
      <button type="button" onClick={onBack} className="w-full text-center text-sm text-pit-muted transition-colors hover:text-white">
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
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.resetPassword({ token, password });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold text-white">Set new password</h2>
      {error && <ErrorBanner msg={error} />}
      <input className="input" type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      <input className="input" type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
        {loading ? 'Saving...' : 'Set password'}
      </button>
    </form>
  );
}
