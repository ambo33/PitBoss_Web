import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  mobilePlacement?: 'bottom' | 'center';
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let openModalCount = 0;
let bodyOverflowBeforeModal = '';
const modalStack: symbol[] = [];

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
    !element.hasAttribute('hidden')
    && element.getAttribute('aria-hidden') !== 'true'
    && (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0)
  ));
}

function lockBodyScroll() {
  if (openModalCount === 0) {
    bodyOverflowBeforeModal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openModalCount += 1;
}

function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0 && document.body.style.overflow === 'hidden') {
    document.body.style.overflow = bodyOverflowBeforeModal;
  }
}

export default function Modal({ title, open, onClose, children, footer, mobilePlacement = 'bottom' }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const modalIdRef = useRef(Symbol('modal'));
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const modalId = modalIdRef.current;
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    modalStack.push(modalId);
    lockBodyScroll();

    const focusDialog = () => {
      const dialog = dialogRef.current;
      if (!dialog || modalStack[modalStack.length - 1] !== modalId) return;
      const autoFocusTarget = dialog.querySelector<HTMLElement>('[autofocus]');
      const initialFocusTarget = autoFocusTarget ?? getFocusableElements(dialog)[0] ?? dialog;
      initialFocusTarget.focus({ preventScroll: true });
    };
    const animationFrame = window.requestAnimationFrame(focusDialog);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== modalId) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const dialog = dialogRef.current;
      if (
        !dialog
        || modalStack[modalStack.length - 1] !== modalId
        || dialog.contains(event.target as Node)
      ) return;
      (getFocusableElements(dialog)[0] ?? dialog).focus({ preventScroll: true });
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      const stackIndex = modalStack.lastIndexOf(modalId);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      unlockBodyScroll();
      if (previouslyFocusedElement?.isConnected) {
        previouslyFocusedElement.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className={`fixed inset-0 z-50 flex justify-center bg-black/70 backdrop-blur-sm ${
        mobilePlacement === 'center'
          ? 'items-center px-4 py-4'
          : 'items-end px-0 sm:items-center sm:px-4'
      }`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-pit-surface border border-pit-border w-full sm:max-w-md
                      shadow-[0_24px_64px_rgba(0,0,0,0.6)]
                      flex flex-col max-h-[90dvh] ${
                        mobilePlacement === 'center' ? 'rounded-2xl' : 'rounded-t-2xl sm:rounded-2xl'
                      }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pit-border shrink-0">
          <h2 id={titleId} className="font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg
                       text-pit-muted hover:text-white hover:bg-white/10 transition-all duration-150
                       focus:outline-none focus:ring-2 focus:ring-pit-teal/50">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-pit-border/50 px-5 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
