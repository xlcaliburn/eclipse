import { describe, expect, it } from 'vitest';
import { mapShip, removeOnce } from './util';

describe('removeOnce', () => {
  it('removes exactly one occurrence, leaving duplicates untouched', () => {
    expect(removeOnce([1, 2, 2, 3], 2)).toEqual([1, 2, 3]);
  });

  it('returns the same array reference when the item is absent', () => {
    const list = [1, 2, 3];
    expect(removeOnce(list, 99)).toBe(list);
  });

  it('does not mutate the input', () => {
    const list = [1, 2, 3];
    removeOnce(list, 2);
    expect(list).toEqual([1, 2, 3]);
  });
});

describe('mapShip', () => {
  it('transforms only the ship at the given index', () => {
    const fleet = [{ hp: 1 }, { hp: 2 }, { hp: 3 }];
    const result = mapShip(fleet, 1, (s) => ({ hp: s.hp * 10 }));
    expect(result).toEqual([{ hp: 1 }, { hp: 20 }, { hp: 3 }]);
  });

  it('leaves the fleet unchanged if the index is out of range', () => {
    const fleet = [{ hp: 1 }, { hp: 2 }];
    const result = mapShip(fleet, 5, () => ({ hp: 999 }));
    expect(result).toEqual(fleet);
  });

  it('does not mutate the input array', () => {
    const fleet = [{ hp: 1 }, { hp: 2 }];
    mapShip(fleet, 0, () => ({ hp: 999 }));
    expect(fleet).toEqual([{ hp: 1 }, { hp: 2 }]);
  });
});
