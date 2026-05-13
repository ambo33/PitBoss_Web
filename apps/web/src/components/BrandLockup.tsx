interface BrandLockupProps {
  compact?: boolean;
  centered?: boolean;
  showSlogan?: boolean;
  showWordmark?: boolean;
  className?: string;
}

export default function BrandLockup({
  compact = false,
  centered = false,
  showSlogan = true,
  showWordmark = true,
  className = '',
}: BrandLockupProps) {
  return (
    <div className={`${centered ? 'items-center text-center' : 'items-start text-left'} flex gap-3 ${className}`.trim()}>
      <BrandMark compact={compact} />
      {showWordmark && (
        <div className="min-w-0">
          <p className={`${compact ? 'text-base' : 'text-3xl'} font-extrabold leading-none tracking-tight text-white`}>
            PokerPlanner.bet
          </p>
          {showSlogan && (
            <p className={`${compact ? 'mt-1 text-[11px]' : 'mt-2 text-sm'} font-medium text-pit-text`}>
              Run Better Poker Nights
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  const size = compact ? 40 : 88;
  const src = compact
    ? '/branding/pokerplanner-logo-compact.png'
    : '/branding/pokerplanner-logo.png';

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full bg-black ${
        compact
          ? 'border border-white/8 shadow-[0_10px_24px_rgba(0,0,0,0.28)]'
          : 'border border-white/10 shadow-[0_18px_40px_rgba(0,0,0,0.38)]'
      }`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt="PokerPlanner.bet logo"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
