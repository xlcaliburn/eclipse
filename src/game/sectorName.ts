// Iteration 10.4: pure flavor text for the map header ("SECTOR I — Vela
// Drift"). Deterministic from the run's mapSeed — no rng stream, no
// gameplay effect, just two word-lists combined by simple modular
// arithmetic so the same seed always names the same sector.
const PREFIXES = [
  'Kepler', 'Vela', 'Cygnus', 'Orion', 'Lyra', 'Draco', 'Perseus', 'Hydra', 'Corvus', 'Auriga',
  'Carina', 'Phoenix', 'Andromeda', 'Centauri', 'Cassiopeia',
];

const SUFFIXES = [
  'Reach', 'Drift', 'Expanse', 'Verge', 'Cradle', 'Wake', 'Span', 'Hollow', 'Rift', 'Shroud',
  'Belt', 'Gate', 'Shoal', 'Marches', 'Deep',
];

export function sectorName(seed: number): string {
  const s = Math.abs(Math.trunc(seed));
  const prefix = PREFIXES[s % PREFIXES.length];
  const suffix = SUFFIXES[Math.floor(s / PREFIXES.length) % SUFFIXES.length];
  return `${prefix} ${suffix}`;
}
