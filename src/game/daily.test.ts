import { describe, expect, it, vi } from 'vitest';
import { dailySeed, dailyShareText, emptyRunStats } from './daily';
import { initialRunState } from './reducer';
import { baseShipName, shipName } from './shipNames';
import type { RunState } from './types';

describe('dailySeed (iteration 18)', () => {
  it('is deterministic: same date, same seed', () => {
    expect(dailySeed('2026-08-03')).toBe(dailySeed('2026-08-03'));
  });

  it('differs across dates', () => {
    const seeds = new Set(['2026-08-01', '2026-08-02', '2026-08-03', '2027-08-03'].map(dailySeed));
    expect(seeds.size).toBe(4);
  });

  it('is always a nonzero uint32', () => {
    for (const date of ['2026-01-01', '1970-01-01', '2099-12-31', '']) {
      const seed = dailySeed(date);
      expect(seed).toBeGreaterThan(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(seed)).toBe(true);
    }
  });
});

describe('shipName (iteration 18)', () => {
  it('is deterministic, and the Flagship wears the bare fleet prefix', () => {
    expect(shipName(12345, 0, 'cruiser')).toBe(shipName(12345, 0, 'cruiser'));
    expect(shipName(12345, 0, 'cruiser').startsWith('ISV ')).toBe(true);
  });

  it('gives escorts a hull code and commission number instead', () => {
    // The number is the commission counter, so it never renumbers when a
    // ship ahead of it is lost.
    expect(shipName(12345, 1, 'dreadnought')).toMatch(/^DRD-02 /);
    expect(shipName(12345, 2, 'light-cruiser')).toMatch(/^CRU-03 /);
    expect(shipName(12345, 3, 'interceptor')).toMatch(/^INT-04 /);
    expect(shipName(12345, 4, 'bastion')).toMatch(/^BAS-05 /);
    expect(shipName(12345, 1, 'dreadnought').startsWith('ISV')).toBe(false);
  });

  it('gives the same underlying name regardless of frame', () => {
    expect(baseShipName(12345, 1)).toBe(shipName(12345, 1, 'cruiser').replace('ISV ', ''));
    expect(shipName(12345, 1, 'bastion')).toContain(baseShipName(12345, 1));
  });

  it('produces 48 distinct names for 48 consecutive commissions', () => {
    const names = new Set(Array.from({ length: 48 }, (_, i) => shipName(987654321, i, 'cruiser')));
    expect(names.size).toBe(48);
  });
});

describe('dailyShareText (iteration 18)', () => {
  it('renders the exact three-line result from a synthetic state', () => {
    const state = {
      dailyDate: '2026-08-03',
      act: 2,
      position: { col: 4, row: 1 },
      runStats: { fightsWon: 9, fightsWithdrawn: 2, shipsLost: ['ISV Kestrel'], damageDealt: 40, damageTaken: 31 },
    } as unknown as RunState;
    expect(dailyShareText(state, 'defeat')).toBe(
      'Eclipse Daily — 2026-08-03\n💥 Defeat · Act 2 · Column 5\n⚔️ 9 won · ↩️ 2 withdrawn · ☠ 1 ship lost',
    );
  });

  it('falls back cleanly when stats are absent (pre-18 save shapes)', () => {
    const state = { dailyDate: '2026-08-03', act: 1, position: null } as unknown as RunState;
    expect(dailyShareText(state, 'victory')).toContain('⚔️ 0 won · ↩️ 0 withdrawn · ☠ 0 ships lost');
  });
});

describe('daily run construction (iteration 18)', () => {
  it('initialRunState with a fixed seed is fully deterministic, and NEW_RUN options flow through', () => {
    const a = initialRunState({ seed: 42, mode: 'daily', dailyDate: '2026-08-03' });
    const b = initialRunState({ seed: 42, mode: 'daily', dailyDate: '2026-08-03' });
    expect(a).toEqual(b);
    expect(a.mode).toBe('daily');
    expect(a.dailyDate).toBe('2026-08-03');
    expect(a.map.seed).toBe(42);
    expect(a.fleet[0].name).toBe(shipName(42, 0, 'cruiser'));
    expect(a.runStats).toEqual(emptyRunStats());
    expect(a.shipsCommissioned).toBe(1);
  });

  it('defaults to a standard run with a random seed when no options are given', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = initialRunState();
    spy.mockRestore();
    expect(state.mode).toBe('standard');
    expect(state.dailyDate).toBeUndefined();
  });
});
