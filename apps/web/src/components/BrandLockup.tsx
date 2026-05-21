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
            ThePokerPlanner
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

  return (
    <img
      src="/branding/the-poker-planner-logo.svg"
      alt="ThePokerPlanner logo"
      className="block shrink-0 rounded-full object-cover ring-1 ring-white/15"
      style={{ width: size, height: size }}
    />
  );
}
