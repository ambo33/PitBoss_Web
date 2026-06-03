import { api } from '../api/client';

export async function cleanupDemoSessionIfNeeded(
  user?: { isdemo?: boolean } | null,
  tokenOverride?: string | null
): Promise<void> {
  if (!user?.isdemo) return;
  try {
    if (tokenOverride) {
      const response = await fetch('/api/demo/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenOverride}`,
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error('Demo cleanup failed.');
      return;
    }
    await api.endDemo();
  } catch {
    // Best effort: local logout should still work even if demo cleanup fails.
  }
}
