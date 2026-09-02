import { useEffect, useState } from 'react';
import { Music4 } from 'lucide-react';

export default function SpotifyArtwork({
  src,
  alt = '',
  className,
  fallbackClassName = 'bg-pit-bg text-pit-teal',
  iconSize = 16,
}: {
  src?: string | null;
  alt?: string;
  className: string;
  fallbackClassName?: string;
  iconSize?: number;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${className} shrink-0 rounded object-cover`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`${className} flex shrink-0 items-center justify-center rounded ${fallbackClassName}`}>
      <Music4 size={iconSize} />
    </div>
  );
}
