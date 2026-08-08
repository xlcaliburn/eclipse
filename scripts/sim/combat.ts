import { initCombat, runToEnd } from '../../src/game/combatEngine';
import type { CommanderId } from '../../src/game/commanders';
import { deriveFleetForCombat } from '../../src/game/ship';
import type { ProtocolId } from '../../src/game/protocols';
import type { EnemyDef, PlayerShipState } from '../../src/game/types';
import { wilsonInterval } from './stats';
import type { WilsonInterval } from './stats';

// The one `simulateFleet`, replacing three near-identical private copies
// (balance.ts, actRun.ts, enemyValue.ts each had their own). Every caller
// gets the same three numbers: a Wilson-interval win rate (not a bare
// point estimate — see stats.ts), average cannon-round count (the
// Outspeed-era "how much shorter is this fight" question), and average
// surviving-fleet damage (the attrition lens a full-run policy cares about
// — how battered does a WIN leave the fleet, not just whether it won).
export interface FleetSimResult {
  winRate: WilsonInterval;
  avgRounds: number;
  avgSurvivorDamage: number;
}

export function simulateFleet(
  fleet: PlayerShipState[],
  enemy: EnemyDef,
  sims: number,
  opts?: { commanderId?: CommanderId; protocols?: ProtocolId[] },
): FleetSimResult {
  const fleetInput = deriveFleetForCombat(fleet, opts?.commanderId, opts?.protocols);
  let wins = 0;
  let totalRounds = 0;
  let totalSurvivorDamage = 0;
  for (let seed = 1; seed <= sims; seed++) {
    const result = runToEnd(initCombat(fleetInput, enemy, seed));
    if (result.winner === 'player') wins++;
    totalRounds += Math.max(0, result.round - 1); // round 0 is the missile phase, not a cannon round
    totalSurvivorDamage += result.playerShips.reduce((sum, s) => sum + Math.min(s.damage, s.stats.hp), 0);
  }
  return {
    winRate: wilsonInterval(wins, sims),
    avgRounds: totalRounds / sims,
    avgSurvivorDamage: totalSurvivorDamage / sims,
  };
}
