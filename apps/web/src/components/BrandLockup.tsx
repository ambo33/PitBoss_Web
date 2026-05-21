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
            ThePokerPlanner.com
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
    <img
      src={src}
      alt="ThePokerPlanner.com logo"
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
