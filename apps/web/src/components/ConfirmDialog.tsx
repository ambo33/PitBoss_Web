import { ReactNode, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

type ConfirmTone = 'danger' | 'warning';

interface Props {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  loading?: boolean;
  requireText?: string;
  requireLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  requireText,
  requireLabel = 'Type to confirm',
  onClose,
  onConfirm,
}: Props) {
  const [confirmationText, setConfirmationText] = useState('');
  const iconClass = tone === 'danger'
    ? 'border-red-400/25 bg-red-400/10 text-red-200'
    : 'border-yellow-300/25 bg-yellow-300/10 text-yellow-100';
  const confirmClass = tone === 'danger'
    ? 'border-red-400/30 bg-red-500/20 text-red-100 hover:border-red-300/50 hover:bg-red-500/30'
    : 'border-yellow-300/30 bg-yellow-300/15 text-yellow-100 hover:border-yellow-200/50 hover:bg-yellow-300/25';
  const requiresMatch = Boolean(requireText);
  const confirmDisabled = loading || (requiresMatch && confirmationText.trim() !== requireText);

  useEffect(() => {
    if (open) setConfirmationText('');
  }, [open, requireText]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost justify-center px-4 py-2 text-sm" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      )}
    >
      <div className="flex gap-3">
        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconClass}`}>
          <AlertTriangle size={18} />
        </div>
        <div className="space-y-2">
          <p className="text-sm leading-6 text-pit-text">{message}</p>
          {requiresMatch && (
            <label className="block space-y-1.5 pt-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-pit-muted">{requireLabel}</span>
              <input
                className="input"
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder={requireText}
                autoComplete="off"
              />
              <p className="text-xs text-pit-muted">
                Type <span className="font-semibold text-white">{requireText}</span> exactly to continue.
              </p>
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
