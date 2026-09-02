import { useSearchParams } from 'react-router-dom';
import CinematicDemo from '../Landing/components/CinematicDemo';

function queryFlagEnabled(value: string | null, defaultValue: boolean) {
  if (value == null) return defaultValue;
  return value.trim().toLowerCase() !== 'false';
}

export default function DemoShowcasePage() {
  const [searchParams] = useSearchParams();
  const autoplay = queryFlagEnabled(searchParams.get('autoplay'), true);
  const controls = queryFlagEnabled(searchParams.get('controls'), true);

  return (
    <main className="cinematic-showcase-page">
      <h1 className="sr-only">ThePokerPlanner product demo</h1>
      <CinematicDemo
        variant="standalone"
        autoplay={autoplay}
        controls={controls}
      />
    </main>
  );
}
