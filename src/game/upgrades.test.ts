import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { randomUpgradeIds, UPGRADES } from './upgrades';

describe('randomUpgradeIds', () => {
  it('never returns a duplicate within one draw, across many seeds', () => {
    // Regression: the draw used to roll each of the 3 slots independently
    // from the full pool, so the same upgrade could show up twice or three
    // times in one pick (bug report: "giving me multiple of the same
    // options", screenshotted as 3x Regenerative plating). ~31% of draws
    // hit this with the old with-replacement logic, so a sweep across many
    // seeds reliably catches it rather than trusting one lucky sample.
    for (let seed = 1; seed <= 300; seed++) {
      const picks = randomUpgradeIds(3, mulberry32(seed));
      expect(new Set(picks).size).toBe(picks.length);
    }
  });

  it('draws exactly `count` ids, and every id is a real upgrade', () => {
    const picks = randomUpgradeIds(3, mulberry32(1));
    expect(picks).toHaveLength(3);
    const validIds = new Set(UPGRADES.map((u) => u.id));
    for (const id of picks) expect(validIds.has(id)).toBe(true);
  });

  it('a single draw still works (the interlude/setup 1-upgrade case)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(randomUpgradeIds(1, mulberry32(seed))).toHaveLength(1);
    }
  });
});
