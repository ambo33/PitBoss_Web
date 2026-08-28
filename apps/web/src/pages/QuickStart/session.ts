import type { TournamentDraftPayload } from '../../api/client';

export const QUICK_START_RUN_STORAGE_KEY = 'pp_quick_start_run_payload';

export function saveQuickStartRun(payload: TournamentDraftPayload) {
  sessionStorage.setItem(QUICK_START_RUN_STORAGE_KEY, JSON.stringify(payload));
}

export function loadQuickStartRun(): TournamentDraftPayload | null {
  const raw = sessionStorage.getItem(QUICK_START_RUN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TournamentDraftPayload;
    if (!parsed || !Array.isArray(parsed.generatedStructure) || !parsed.tournamentConfig) return null;
    return parsed;
  } catch {
    return null;
  }
}
