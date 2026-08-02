// Iteration 15.2: the heat track prices avoidance. Deliberately the *only*
// deterministic mechanism in the run's threat layer — pure counter
// arithmetic, no rolls, fully plannable from the HUD (a legible,
// numbers-stripped version of FTL's rebel fleet). Never touch this file
// with an rng draw.
export const MAX_HEAT = 4;

export type HeatTier = 'Cold' | 'Watched' | 'Tracked' | 'Hunted';

// 0 Cold - 1-2 Watched - 3 Tracked - 4 Hunted (armed: the next non-combat
// node entered is intercepted — see reducer.ts's PICK_NODE).
export function heatTier(heat: number): HeatTier {
  if (heat <= 0) return 'Cold';
  if (heat <= 2) return 'Watched';
  if (heat === 3) return 'Tracked';
  return 'Hunted';
}

// Clamped to [0, MAX_HEAT] both ways — floor 0, cap 4.
export function addHeat(heat: number, amount: number): number {
  return Math.max(0, Math.min(MAX_HEAT, heat + amount));
}
