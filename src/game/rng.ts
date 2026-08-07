export type RngFn = () => number; // returns a float in [0, 1)

// mulberry32 — small, fast, deterministic seeded PRNG.
export function mulberry32(seed: number): RngFn {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rolls a die, returning an integer in [1, faces]. `faces` defaults to 6 —
// the standard d6 every weapon rolls, except one whose derived stats carry
// `overcharge` (iteration 40's Overcharged rounds protocol): that die gets
// a 7th face. Still exactly one rng() draw either way, so this never
// perturbs the rngCounter accounting.
export function rollD6(rng: RngFn, faces = 6): number {
  return Math.floor(rng() * faces) + 1;
}

// The only nondeterministic moment in a run (iteration 9): the seed rolled
// once at NEW_RUN. Every draw after that flows through a seed + a
// resumable counter stored in state, so reload/replay never changes fate.
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

// Reconstructs a `mulberry32(seed)` stream, fast-forwarded past
// `alreadyConsumed` draws, and hands back both the continuing generator and
// a way to read how many further draws this call made — so the caller can
// persist `alreadyConsumed + consumedThisCall()` as the new counter.
export function resumeRng(seed: number, alreadyConsumed: number): { rng: RngFn; consumedThisCall: () => number } {
  const base = mulberry32(seed);
  for (let i = 0; i < alreadyConsumed; i++) base();
  let consumed = 0;
  const rng: RngFn = () => {
    consumed++;
    return base();
  };
  return { rng, consumedThisCall: () => consumed };
}
