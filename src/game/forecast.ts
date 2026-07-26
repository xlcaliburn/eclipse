import { initCombat, runToEnd } from './combatEngine';
import type { TargetingStance } from './combatEngine';
import { deriveFleetForCombat } from './ship';
import type { EnemyDef, PlayerShipState } from './types';

const DEFAULT_SIMS = 1000;

// Memoized by (fleet composition + damage, enemy, sim count, stance) —
// recomputing 1000 simulations is cheap but not free, and the UI
// recomputes on every blueprint edit. The forecast is card-blind by
// design: it assumes no reaction cards are played, since cards are the
// player's edge over the odds.
const cache = new Map<string, number>();

function cacheKey(fleet: PlayerShipState[], enemyDef: EnemyDef, sims: number, stance: TargetingStance): string {
  const fleetKey = fleet
    .map((ship) => `${ship.frameId}:${ship.damage}:${[...ship.equipped].sort().join(',')}`)
    .join(';');
  return `${fleetKey}|${enemyDef.id}|${sims}|${stance}`;
}

// Returns an integer win percentage (0-100) for the given fleet (including
// any carried damage) against the given enemy under the given targeting
// stance (9.4), estimated via Monte Carlo simulation with sequential
// (deterministic) seeds.
export function forecastWinRate(
  fleet: PlayerShipState[],
  enemyDef: EnemyDef,
  sims = DEFAULT_SIMS,
  stance: TargetingStance = 'weakest',
): number {
  const key = cacheKey(fleet, enemyDef, sims, stance);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const fleetInput = deriveFleetForCombat(fleet);
  let wins = 0;
  for (let seed = 1; seed <= sims; seed++) {
    const result = runToEnd(initCombat(fleetInput, enemyDef, seed, stance));
    if (result.winner === 'player') wins++;
  }

  const rate = Math.round((wins / sims) * 100);
  cache.set(key, rate);
  return rate;
}
