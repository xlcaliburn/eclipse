import { describe, expect, it } from 'vitest';
import { mulberry32, pickOne, shuffle } from './rng';

describe('pickOne', () => {
  it('returns an element actually in the pool', () => {
    const pool = ['a', 'b', 'c'];
    const rng = mulberry32(1);
    for (let i = 0; i < 20; i++) {
      expect(pool).toContain(pickOne(pool, rng));
    }
  });

  it('is deterministic for the same rng stream', () => {
    const pool = [1, 2, 3, 4, 5];
    expect(pickOne(pool, mulberry32(42))).toBe(pickOne(pool, mulberry32(42)));
  });

  it('a single-element pool always returns that element', () => {
    const rng = mulberry32(7);
    expect(pickOne(['only'], rng)).toBe('only');
  });
});

describe('shuffle', () => {
  it('returns every original element, same multiset, in some order', () => {
    const items = [1, 2, 3, 4, 5];
    const shuffled = shuffle(items, mulberry32(3));
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it('does not mutate the input', () => {
    const items = [1, 2, 3];
    shuffle(items, mulberry32(9));
    expect(items).toEqual([1, 2, 3]);
  });

  it('is deterministic for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(items, mulberry32(11))).toEqual(shuffle(items, mulberry32(11)));
  });
});
