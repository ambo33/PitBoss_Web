import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';

export interface LeagueFeeEditorProps {
  open: boolean;
  seasonName: string;
  leagueFeeCents: number;
  eventFeeCents: number;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onSave: (payload: { leaguefee: number; seasonEventFee: number }) => Promise<void>;
}

export default function LeagueFeeEditor({
  open,
  seasonName,
  leagueFeeCents,
  eventFeeCents,
  loading,
  error,
  onClose,
  onSave,
}: LeagueFeeEditorProps) {
  const [leagueFee, setLeagueFee] = useState('');
  const [eventFee, setEventFee] = useState('');
  useEffect(() => {
    if (!open) return;
    setLeagueFee(moneyInputValue(leagueFeeCents));
    setEventFee(moneyInputValue(eventFeeCents));
  }, [eventFeeCents, leagueFeeCents, open]);
  const nextLeagueFeeCents = parseMoneyInput(leagueFee);
  const nextEventFeeCents = parseMoneyInput(eventFee);
  const valid = nextLeagueFeeCents != null && nextEventFeeCents != null;
  const dirty = valid && (nextLeagueFeeCents !== leagueFeeCents || nextEventFeeCents !== eventFeeCents);
  const requestClose = () => {
    if (loading) return;
    if (dirty && !window.confirm('Discard unsaved fee changes?')) return;
    onClose();
  };
  const save = async () => {
    if (!valid || !dirty || loading) return;
    try {
      await onSave({ leaguefee: nextLeagueFeeCents / 100, seasonEventFee: nextEventFeeCents / 100 });
      onClose();
    } catch {
      // React Query exposes the recoverable error below while the form values remain intact.
    }
  };
  return (
    <Modal
      title="Edit Fees"
      open={open}
      onClose={requestClose}
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost min-h-11 justify-center" onClick={requestClose} disabled={loading}>Cancel</button>
          <button type="button" className="btn-primary min-h-11 justify-center text-[#041312]" onClick={save} disabled={!dirty || !valid || loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-pit-gold/30 bg-pit-gold/[0.07] p-3 text-xs leading-5 text-pit-text">
          Changes recalculate balances for <strong className="text-white">{normalizeSeasonLabel(seasonName)}</strong>. Existing payment records stay intact; the event fee also updates this season&apos;s active event buy-ins.
        </div>
        {error ? <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</p> : null}
        <MoneyField label="Season fee" value={leagueFee} onChange={setLeagueFee} />
        <MoneyField label="Per-event fee" value={eventFee} onChange={setEventFee} />
        <p className="text-xs leading-5 text-pit-muted">Use zero only when that fee does not apply. Amounts are saved to the nearest cent.</p>
      </div>
    </Modal>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-pit-muted">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pit-muted">$</span>
        <input className="input h-11 pl-7 tabular-nums" inputMode="decimal" value={value} onChange={(event) => onChange(cleanMoneyInput(event.target.value))} aria-label={`${label} amount`} />
      </span>
    </label>
  );
}

function normalizeSeasonLabel(name: string) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return 'Current season';
  return /^season\b/i.test(trimmed) ? trimmed : `Season ${trimmed}`;
}

function cleanMoneyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  const decimals = rest.join('').slice(0, 2);
  const trimmedWhole = whole.replace(/^0+(?=\d)/, '');
  return rest.length ? `${trimmedWhole || '0'}.${decimals}` : trimmedWhole;
}

function parseMoneyInput(value: string): number | null {
  if (!/^(?:\d+)(?:\.\d{0,2})?$/.test(value)) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : null;
}

function moneyInputValue(cents: number) {
  const amount = Math.round(cents) / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
