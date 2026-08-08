import { describe, expect, it } from 'vitest';
import { resolveHit } from './hitRule';

describe('resolveHit', () => {
  it('a natural 6 always hits, even against a strong shield', () => {
    expect(resolveHit(6, 0, 5)).toBe(true);
  });

  it('a natural 1 always misses, even with a strong computer', () => {
    expect(resolveHit(1, 5, 0)).toBe(false);
  });

  it('computer 0 vs shield 0 hits only on a natural 6', () => {
    expect(resolveHit(5, 0, 0)).toBe(false);
    expect(resolveHit(6, 0, 0)).toBe(true);
  });

  it('computer 2 vs shield 0 hits on 4+', () => {
    expect(resolveHit(3, 2, 0)).toBe(false);
    expect(resolveHit(4, 2, 0)).toBe(true);
  });

  it('computer 3 vs shield 3 hits only on a natural 6', () => {
    expect(resolveHit(5, 3, 3)).toBe(false);
    expect(resolveHit(6, 3, 3)).toBe(true);
  });

  // Iteration 40 (Overcharged rounds / "digital dice"): an overcharged
  // die's top face is 7, not 6 — 6 becomes an ordinary roll (still subject
  // to the +computer/-shield formula) and 7 takes over as the always-hits
  // face.
  it('with maxRoll 7 (an overcharged die), a natural 7 always hits and a natural 6 no longer auto-hits', () => {
    expect(resolveHit(7, 0, 5, false, 7)).toBe(true);
    expect(resolveHit(6, 0, 5, false, 7)).toBe(false); // 6 + 0 - 5 = 1, not >= 6
    expect(resolveHit(6, 5, 0, false, 7)).toBe(true); // 6 + 5 - 0 = 11 >= 6, hits on the formula, not the auto-hit rule
  });

  it('maxRoll still respects chaffActive — a natural 7 resolves as a normal roll while armed', () => {
    expect(resolveHit(7, 0, 5, true, 7)).toBe(false); // 7 + 0 - 5 = 2, not >= 6
    expect(resolveHit(7, 5, 0, true, 7)).toBe(true); // 7 + 5 - 0 = 12 >= 6
  });
});
