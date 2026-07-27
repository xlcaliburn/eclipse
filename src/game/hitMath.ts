import { resolveHit } from './resolver';
import type { ShipStats, WeaponStats } from './types';

// Iteration 12.3: presentation-facing hit-chance math for the prep screen's
// firing-solutions readout. Probabilities are computed by running the REAL
// `resolveHit` over all six die faces, so this module can never drift from
// the resolver — if the hit rule changes (chaff, future evasion, anything),
// this table follows automatically. Effective shield mirrors the engine's
// formula in `fireShip` (combatEngine.ts); keep the two in step.

export function hitProbability(attackerComputer: number, effectiveShield: number): number {
  let hits = 0;
  for (let raw = 1; raw <= 6; raw++) {
    if (resolveHit(raw, attackerComputer, effectiveShield)) hits++;
  }
  return hits / 6;
}

// The defender's shield as the engine will actually apply it for this
// weapon: capacitor shield counts during the missile phase (and the first
// cannon round — the steady-state cannon number shown here deliberately
// excludes it), attacker ship-level pierce and per-die weapon pierce
// subtract, floored at 0.
export function effectiveShieldAgainst(
  attacker: ShipStats,
  weapon: WeaponStats,
  defender: ShipStats,
  phase: 'missile' | 'cannon',
): number {
  const capacitor = phase === 'missile' ? (defender.capacitorShield ?? 0) : 0;
  return Math.max(0, defender.shield + capacitor - (attacker.shieldPierce ?? 0) - (weapon.shieldPierce ?? 0));
}

export function weaponHitChance(
  attacker: ShipStats,
  weapon: WeaponStats,
  defender: ShipStats,
  phase: 'missile' | 'cannon',
): number {
  return hitProbability(attacker.computer, effectiveShieldAgainst(attacker, weapon, defender, phase));
}
