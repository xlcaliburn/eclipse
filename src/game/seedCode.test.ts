import { describe, expect, it } from 'vitest';
import { codeToSeed, seedToCode } from './seedCode';

describe('seedCode (iteration 26, wrap-around bug fixed in 27)', () => {
  it('round-trips arbitrary seeds', () => {
    for (const seed of [0, 1, 42, 12345, 0xffffffff, 0x7fffffff, 2026080500, 999999999]) {
      expect(codeToSeed(seedToCode(seed))).toBe(seed >>> 0);
    }
  });

  it('always produces a fixed 7-character code', () => {
    for (const seed of [0, 1, 0xffffffff, 555]) {
      expect(seedToCode(seed)).toHaveLength(7);
    }
  });

  it('is deterministic', () => {
    expect(seedToCode(123456)).toBe(seedToCode(123456));
  });

  it('decoding is case-insensitive', () => {
    const code = seedToCode(987654321);
    expect(codeToSeed(code.toLowerCase())).toBe(codeToSeed(code.toUpperCase()));
  });

  it('tolerates surrounding whitespace and stray separators', () => {
    const code = seedToCode(42);
    const spaced = `${code.slice(0, 3)}-${code.slice(3)}`;
    expect(codeToSeed(`  ${spaced}  `)).toBe(codeToSeed(code));
  });

  it('folds ambiguous characters back to their intended digit', () => {
    // Crockford: O -> 0, I/L -> 1. Construct a code containing 0s/1s, swap
    // in the ambiguous look-alikes, and confirm it still decodes the same.
    const code = seedToCode(0x01011010); // guaranteed to contain 0s and 1s
    expect(code).toMatch(/[01]/);
    const swapped = code
      .split('')
      .map((ch) => (ch === '0' ? 'O' : ch === '1' ? 'I' : ch))
      .join('');
    expect(codeToSeed(swapped)).toBe(codeToSeed(code));
  });

  it('rejects codes of the wrong length', () => {
    expect(codeToSeed('ABC')).toBeNull();
    expect(codeToSeed('ABCDEFGH')).toBeNull();
    expect(codeToSeed('')).toBeNull();
  });

  it('rejects codes with characters outside the alphabet', () => {
    // 'U' is deliberately excluded from Crockford's alphabet.
    expect(codeToSeed('UUUUUUU')).toBeNull();
  });

  it('rejects a right-length code that decodes past the uint32 seed range', () => {
    // The exact bug found by hand-testing in the browser: 7 base32 digits
    // can address up to 32^7-1 (~34.4 billion), well past a seed's uint32
    // ceiling (~4.3 billion). The shipped iteration-26 code used `n >>> 0`,
    // which silently wrapped an out-of-range code mod 2^32 into a
    // different, valid-looking seed instead of rejecting it — typing
    // '7GQK2XJ' (a right-length, right-alphabet, but out-of-range code)
    // silently started the sector for '3GQK2XJ' instead.
    expect(codeToSeed('7GQK2XJ')).toBeNull();
    // 2^32 itself (one past MAX_SEED) — the exact boundary.
    expect(codeToSeed('4000000')).toBeNull();
  });

  it('accepts the maximum valid seed at the boundary', () => {
    // 0xFFFFFFFF (MAX_SEED) encodes to '3ZZZZZZ' — the last valid code.
    expect(seedToCode(0xffffffff)).toBe('3ZZZZZZ');
    expect(codeToSeed('3ZZZZZZ')).toBe(0xffffffff);
  });

  it('round-trips a sweep of codes without ever wrapping into a different seed', () => {
    // For every seed this app can generate, re-decoding its own code must
    // return the exact same seed — never a different one that happens to
    // share the low bits (the wrap-around failure mode).
    for (let i = 0; i < 200; i++) {
      const seed = (i * 999999937) >>> 0; // deterministic spread across the uint32 range
      const code = seedToCode(seed);
      expect(codeToSeed(code)).toBe(seed);
    }
  });
});
