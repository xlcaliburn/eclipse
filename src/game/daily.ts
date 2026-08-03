import type { RunState, RunStats } from './types';

// Iteration 18: the daily run. Everyone who plays the same date gets the
// identical sector — iteration 9's full-run determinism means one seed
// fixes the map, bosses, shops, events, and every die; only the player's
// choices differ. Pure module: the actual `Date` call lives in App.tsx
// (src/game/ is Date-free, enforced by noStrayRandomness.test.ts).

export type DailyOutcome = 'victory' | 'defeat' | 'abandoned';

// FNV-1a over the date string ("YYYY-MM-DD"), coerced to a nonzero uint32.
export function dailySeed(dateStr: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < dateStr.length; i++) {
    hash ^= dateStr.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 1;
}

export function emptyRunStats(): RunStats {
  return { fightsWon: 0, fightsWithdrawn: 0, shipsLost: [], damageDealt: 0, damageTaken: 0 };
}

const OUTCOME_LINE: Record<DailyOutcome, string> = {
  victory: '🏆 Victory',
  defeat: '💥 Defeat',
  abandoned: '🏳️ Abandoned',
};

// The copyable result. Deliberately NO per-node route strip: `visited`
// resets at the act transition, so a full-route strip would silently lie
// about act 1 — scope-cut rather than fabricate.
export function dailyShareText(state: RunState, outcome: DailyOutcome): string {
  const stats = state.runStats ?? emptyRunStats();
  const column = (state.position?.col ?? 0) + 1;
  const lines = [
    `Eclipse Daily — ${state.dailyDate ?? '????-??-??'}`,
    `${OUTCOME_LINE[outcome]} · Act ${state.act} · Column ${column}`,
    `⚔️ ${stats.fightsWon} won · ↩️ ${stats.fightsWithdrawn} withdrawn · ☠ ${stats.shipsLost.length} ship${stats.shipsLost.length === 1 ? '' : 's'} lost`,
  ];
  return lines.join('\n');
}
