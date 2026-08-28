import type { ReactNode } from 'react';

interface DemoCoachDialogProps {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  placement?: 'top' | 'bottom';
}

export default function DemoCoachDialog({ children, className = '', icon, placement = 'top' }: DemoCoachDialogProps) {
  const placementClass = placement === 'bottom'
    ? 'bottom-5 sm:bottom-8'
    : 'top-24 sm:top-28';

  return (
    <div className={`pointer-events-none fixed inset-x-0 z-[100] flex justify-center px-4 ${placementClass} ${className}`}>
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Demo guidance"
        className="pointer-events-auto w-full max-w-[25rem] rounded-2xl border border-pit-teal/55 bg-[linear-gradient(145deg,rgba(8,18,24,0.98),rgba(4,36,38,0.98))] px-5 py-4 text-center shadow-[0_22px_62px_rgba(0,0,0,0.45),0_0_38px_rgba(20,184,166,0.22)] backdrop-blur-md"
      >
        {icon && (
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-pit-teal/45 bg-pit-teal/15 text-pit-teal shadow-[0_0_28px_rgba(20,184,166,0.22)]">
            {icon}
          </span>
        )}
        <p className="text-base font-black leading-6 text-white sm:text-lg">{children}</p>
      </div>
    </div>
  );
}
