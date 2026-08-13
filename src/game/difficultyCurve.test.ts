import { describe, expect, it } from 'vitest';
// Iteration 55.3: the loose, build-failing gate tier. Computes the same
// shares/values as scripts/enemyValue.ts's tight tuning-tier report (same
// functions, imported from the one shared module — see
// src/game/difficultyCurve.ts's header for why there's only one copy of
// this arithmetic) but enforces the LOOSE bounds (~2x slack) rather than
// the tight tuning targets. A routine enemy tweak or reward nudge inside
// that slack passes silently; a change that re-opens a band-entry cliff or
// re-inverts the within-act slope fails loudly. Precedent: rewardTiers.test.ts
// (iteration 50) — "a real gate, not an advisory script."
//
// Before iteration 55's mechanisms (A/B/C, plans/iteration-55.md 55.2) are
// implemented, several of the checks below are EXPECTED to fail — that's
// the instrument correctly measuring the exact problem the iteration fixes.
// They are only expected to be green once all three stages have landed; see
// that file's status notes for the stage-by-stage progression.
import {
  t1BandEntryJumps,
  t2WithinActSlope,
  t3SeamRatio,
  worstNodeValue,
  T1_LOOSE_MAX_JUMP,
  T2_LOOSE_MIN_SLOPE,
  T3_LOOSE_MAX_SEAM,
  BAND_ENTRY_COLUMNS,
} from './difficultyCurve';

describe('difficultyCurve — T1 (no band-entry cliff), loose gate', () => {
  for (const act of [1, 2] as const) {
    for (const col of BAND_ENTRY_COLUMNS[act]) {
      it(`act ${act} c${col - 1}->c${col}: worst-node value jump <= ${(T1_LOOSE_MAX_JUMP * 100).toFixed(0)}%`, () => {
        const jumps = t1BandEntryJumps(act);
        const entry = jumps.find((j) => j.col === col);
        expect(entry).toBeDefined();
        expect(entry!.jump).toBeLessThanOrEqual(T1_LOOSE_MAX_JUMP);
      });
    }
  }
});

describe('difficultyCurve — T2 (within-act slope), loose gate', () => {
  for (const act of [1, 2] as const) {
    it(`act ${act}: last-lane-column worst-node share >= ${(T2_LOOSE_MIN_SLOPE * 100).toFixed(0)}% of the first's`, () => {
      expect(t2WithinActSlope(act)).toBeGreaterThanOrEqual(T2_LOOSE_MIN_SLOPE);
    });
  }
});

describe('difficultyCurve — T3 (the act seam), loose gate', () => {
  it(`act-2 c0's worst-node value <= ${T3_LOOSE_MAX_SEAM}x act-1's last lane column's`, () => {
    expect(t3SeamRatio()).toBeLessThanOrEqual(T3_LOOSE_MAX_SEAM);
  });
});

describe('difficultyCurve — determinism (iteration 9)', () => {
  // Every function this gate reads is typed (act: 1 | 2, col: number) with
  // NO fleet/run-state parameter in its signature — a type-level guarantee,
  // not just a runtime one, that nothing here can read live fleet/run
  // state. worstNodeValue below is the base primitive every other measure
  // (t1/t2/t3) is built from; if it's pure, they all are.
  it('worstNodeValue(act, col) is a pure function — identical result across repeated calls', () => {
    for (const act of [1, 2] as const) {
      for (let col = 0; col < 12; col++) {
        const a = worstNodeValue(act, col);
        const b = worstNodeValue(act, col);
        expect(b).toBe(a);
      }
    }
  });

  it('t1/t2/t3 measures are stable across repeated calls (same inputs, same outputs, every time)', () => {
    expect(t1BandEntryJumps(1)).toEqual(t1BandEntryJumps(1));
    expect(t1BandEntryJumps(2)).toEqual(t1BandEntryJumps(2));
    expect(t2WithinActSlope(1)).toBe(t2WithinActSlope(1));
    expect(t2WithinActSlope(2)).toBe(t2WithinActSlope(2));
    expect(t3SeamRatio()).toBe(t3SeamRatio());
  });
});
