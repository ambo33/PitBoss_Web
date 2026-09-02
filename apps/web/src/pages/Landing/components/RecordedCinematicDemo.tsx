import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

type RecordedCinematicDemoProps = {
  onPlaybackError: () => void;
};

const VIDEO_PATH = '/marketing/cinematic-demo-v1.mp4';
const POSTER_PATH = '/marketing/cinematic-demo-v1-poster.png';
const PLAYBACK_START_SECONDS = 2.9;
const PLAYBACK_END_SECONDS = 27.2;

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return reducedMotion;
}

export default function RecordedCinematicDemo({ onPlaybackError }: RecordedCinematicDemoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [inView, setInView] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState === 'visible'
  ));
  const [manualPlayback, setManualPlayback] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window)) {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.2),
      { threshold: [0, 0.2, 0.6] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setDocumentVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const canPlay = inView
      && documentVisible
      && mediaReady
      && !userPaused
      && !ended
      && (!reducedMotion || manualPlayback);

    if (!canPlay) {
      video.pause();
      return undefined;
    }

    let cancelled = false;
    const playPromise = video.play();
    playPromise?.catch(() => {
      if (!cancelled) setPlaybackBlocked(true);
    });

    return () => {
      cancelled = true;
    };
  }, [documentVisible, ended, inView, manualPlayback, mediaReady, reducedMotion, userPaused]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || !mediaReady) return;

    if (isPlaying) {
      setUserPaused(true);
      video.pause();
      return;
    }

    if (ended || video.ended) video.currentTime = PLAYBACK_START_SECONDS;
    setEnded(false);
    setPlaybackBlocked(false);
    setManualPlayback(true);
    setUserPaused(false);
    video.play().catch(() => setPlaybackBlocked(true));
  };

  const controlLabel = ended
    ? 'Replay walkthrough'
    : isPlaying
      ? 'Pause walkthrough'
      : 'Play walkthrough';

  return (
    <div ref={rootRef} className="marketing-recorded-demo">
      <p id="recorded-demo-summary" className="sr-only">
        A recorded walkthrough showing tournament setup, the live clock, player management,
        player music requests, payouts, and the winner presentation.
      </p>
      <video
        ref={videoRef}
        className="marketing-recorded-demo__video"
        muted
        playsInline
        preload="metadata"
        poster={POSTER_PATH}
        aria-label="ThePokerPlanner product walkthrough"
        aria-describedby="recorded-demo-summary"
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = Math.min(
            PLAYBACK_START_SECONDS,
            event.currentTarget.duration,
          );
          setMediaReady(true);
        }}
        onTimeUpdate={(event) => {
          if (event.currentTarget.currentTime < PLAYBACK_END_SECONDS) return;
          event.currentTarget.pause();
          setEnded(true);
          setIsPlaying(false);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setEnded(true);
          setIsPlaying(false);
        }}
        onError={onPlaybackError}
      >
        <source src={VIDEO_PATH} type="video/mp4" />
      </video>
      <button
        type="button"
        className="marketing-recorded-demo__control"
        onClick={togglePlayback}
        aria-label={controlLabel}
      >
        {ended ? <RotateCcw aria-hidden="true" /> : isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        <span>{controlLabel}</span>
      </button>
      {playbackBlocked ? (
        <span className="marketing-recorded-demo__notice" role="status">
          Select Play to start the walkthrough.
        </span>
      ) : null}
    </div>
  );
}
