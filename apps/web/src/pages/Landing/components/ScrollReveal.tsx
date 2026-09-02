import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

type ScrollRevealElement = 'div' | 'section' | 'article';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  as?: ScrollRevealElement;
  /** Delay, in milliseconds, exposed through the --reveal-delay CSS property. */
  delay?: number;
}

type RevealStyle = CSSProperties & {
  '--reveal-delay': string;
};

function shouldRevealImmediately() {
  if (typeof window === 'undefined') return true;

  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return reducedMotion || typeof window.IntersectionObserver === 'undefined';
}

export default function ScrollReveal({
  children,
  className,
  as = 'div',
  delay = 0,
}: ScrollRevealProps) {
  const elementRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(shouldRevealImmediately);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || shouldRevealImmediately()) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;

      setVisible(true);
      observer.disconnect();
    }, {
      threshold: 0.14,
      rootMargin: '0px 0px -8% 0px',
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const setElementRef = (element: HTMLElement | null) => {
    elementRef.current = element;
  };
  const safeDelay = Number.isFinite(delay) ? Math.max(0, delay) : 0;
  const style: RevealStyle = { '--reveal-delay': `${safeDelay}ms` };
  const revealProps = {
    className,
    style,
    'data-reveal': '',
    'data-visible': visible ? 'true' : 'false',
  } as const;

  switch (as) {
    case 'section':
      return <section ref={setElementRef} {...revealProps}>{children}</section>;
    case 'article':
      return <article ref={setElementRef} {...revealProps}>{children}</article>;
    default:
      return <div ref={setElementRef} {...revealProps}>{children}</div>;
  }
}
