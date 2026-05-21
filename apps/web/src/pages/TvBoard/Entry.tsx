import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function TvBoardEntryPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  function submit() {
    const normalized = code.replace(/\D/g, '').slice(0, 6);
    if (normalized.length !== 6) return;
    navigate(`/tv/${normalized}`);
  }

  return (
    <div className="min-h-screen bg-pit-bg px-4 py-8 text-white">
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-pit-border bg-pit-surface/70 p-6 text-center">
        <p className="text-sm text-pit-text">ThePokerPlanner</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Open TV Board</h1>
        <p className="mt-2 text-sm text-pit-text">Enter the 6-digit display code from the host screen.</p>

        <div className="mt-6 space-y-3">
          <input
            className="input text-center font-mono text-2xl tracking-[0.35em]"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
          <button
            type="button"
            className="btn-primary w-full justify-center"
            disabled={code.length !== 6}
            onClick={submit}
          >
            Open Board
          </button>
        </div>
      </div>
    </div>
  );
}
