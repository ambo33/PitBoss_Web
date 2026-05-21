import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, MailX } from 'lucide-react';
import BrandLockup from '../../components/BrandLockup';
import { api } from '../../api/client';

export default function UnsubscribePage() {
  const { token } = useParams();
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function unsubscribe() {
    if (!token) return;
    setStatus('saving');
    setMessage('');
    try {
      await api.unsubscribePublicBlindTimer(token);
      setStatus('done');
      setMessage('You have been unsubscribed from ThePokerPlanner promotional emails for this timer.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unable to unsubscribe from that link.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-pit-bg px-4 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-pit-border bg-pit-card p-6 shadow-2xl">
        <BrandLockup compact showSlogan={false} />
        <div className="mt-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-pit-teal/25 bg-pit-teal/10 text-pit-teal">
            {status === 'done' ? <CheckCircle2 size={22} /> : <MailX size={22} />}
          </div>
          <div>
            <p className="eyebrow">Email Preferences</p>
            <h1 className="mt-1 text-2xl font-bold">Unsubscribe from updates</h1>
            <p className="mt-2 text-sm leading-6 text-pit-text">
              This stops promotional ThePokerPlanner emails tied to your public blind timer code. Your timer itself stays available.
            </p>
          </div>
        </div>

        {message && (
          <p className={`mt-5 rounded-lg border px-3 py-2 text-sm ${status === 'error' ? 'border-red-400/25 bg-red-400/10 text-red-300' : 'border-pit-teal/25 bg-pit-teal/10 text-pit-teal'}`}>
            {message}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link className="btn-ghost" to="/landing">Back to ThePokerPlanner</Link>
          <button className="btn-primary" type="button" onClick={unsubscribe} disabled={status === 'saving' || status === 'done'}>
            {status === 'saving' ? 'Unsubscribing...' : status === 'done' ? 'Unsubscribed' : 'Unsubscribe'}
          </button>
        </div>
      </section>
    </main>
  );
}
