import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  mobilePlacement?: 'bottom' | 'center';
}

export default function Modal({ title, open, onClose, children, footer, mobilePlacement = 'bottom' }: Props) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/70 backdrop-blur-sm ${
        mobilePlacement === 'center'
          ? 'items-center px-4 py-4'
          : 'items-end px-0 sm:items-center sm:px-4'
      }`}
    >
      <div className={`bg-pit-surface border border-pit-border w-full sm:max-w-md
                      shadow-[0_24px_64px_rgba(0,0,0,0.6)]
                      flex flex-col max-h-[90dvh] ${
                        mobilePlacement === 'center' ? 'rounded-2xl' : 'rounded-t-2xl sm:rounded-2xl'
                      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pit-border shrink-0">
          <h2 className="font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg
                       text-pit-muted hover:text-white hover:bg-white/10 transition-all duration-150">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-2 shrink-0 border-t border-pit-border/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
