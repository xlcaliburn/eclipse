import { describe, expect, it } from 'vitest';
// Raw source text of events.ts, for the completeness tripwire below — a
// Vite `?raw` import (declared by vite/client.d.ts, already in this
// project's `types`) rather than `fs.readFileSync`/`__dirname`: this
// project's tsconfig.app.json (which covers every src/*.test.ts, this file
// included) doesn't carry `@types/node`, so a real fs read would fail
// `tsc -b` outside scripts/. Vitest resolves `?raw` through the same Vite
// pipeline it uses for everything else, so this reads live, unmodified
// source text at test time exactly like fs.readFileSync would.
import eventsSource from './events.ts?raw';
import { generateMap, globalColumn } from './map';
import { mulberry32 } from './rng';
import type { RngFn } from './rng';
import { resolveEventChoice } from './events';
import type { EventId } from './events';
import { applyCargoReward, eliteReward, winReward } from './reducer';
import { FLAT_REWARD_BAND, REWARD_SOURCES, TIER_BONUS_BAND } from './rewardTiers';
import type { RewardSourceEntry } from './rewardTiers';
import type { RunState } from './types';

// Same fixedRng/baseState shape events.test.ts already uses — kept local
// (not imported) since neither is exported there; this file needs its own
// copy to drive resolveEventChoice live for the manifest's 'event' measures.
function fixedRng(values: number[]): RngFn {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error(`fixedRng exhausted after ${values.length} values`);
    return values[i++];
  };
}

function baseState(overrides: Partial<RunState> = {}): RunState {
  return {
    phase: 'event',
    map: generateMap(1, mulberry32(1)),
    act: 1,
    rngCounter: 0,
    targetingStance: 'weakest',
    position: { col: 1, row: 0 },
    visited: [],
    fled: [],
    credits: 10,
    inventory: [],
    fleet: [{ frameId: 'cruiser', equipped: ['ion', 'comp1', 'hull1'], damage: 0, upgrades: [] }],
    escalations: [],
    bossRevealed: false,
    visionCol: 0,
    revealedNodes: [],
    commanderChoices: [],
    heat: 0,
    ...overrides,
  };
}

// Every event choice the manifest measures resolves cleanly with zero
// injected rng values EXCEPT the two ambush entries below, which each
// consume exactly as many rng() calls as their real ambush path does
// (a part roll and/or an enemy-pool pick) — see events.ts's distress-beacon
// choice 1 and defector-pursuit choice 0. Values are arbitrary; only the
// count matters, since fixedRng only throws on exhaustion.
const EVENT_RNG_NEEDS: Partial<Record<EventId, number>> = {
  'distress-beacon': 2, // choiceIndex 1: randomPart + easyRaidersForAmbush
  'defector-pursuit': 1, // choiceIndex 0: huntSquadForAmbush
  'black-site-vault': 1, // choiceIndex 1: huntSquadForAmbush
};

// Resolves a manifest 'event' measure for real and returns the live credit
// value: ambushBonus.credits when the choice leads into a fight (the
// resolver can't apply those credits itself — they're conditional on
// winning), otherwise the direct credit delta pay()/a manual return applied
// to state.
function measureEvent(eventId: EventId, choiceIndex: number): number {
  const rngNeeds = EVENT_RNG_NEEDS[eventId] ?? 0;
  const before = baseState();
  const resolution = resolveEventChoice(eventId, choiceIndex, before, fixedRng(Array(rngNeeds).fill(0.1)));
  if (resolution.ambushBonus?.credits !== undefined) return resolution.ambushBonus.credits;
  return resolution.state.credits - before.credits;
}

function measure(entry: RewardSourceEntry): number {
  switch (entry.measure.kind) {
    case 'event':
      return measureEvent(entry.measure.eventId, entry.measure.choiceIndex);
    case 'cargo':
      return applyCargoReward(entry.measure.tag, 0);
    case 'combat-bonus':
      return entry.measure.value();
    default:
      throw new Error(`unreachable measure kind`);
  }
}

function bandFor(entry: RewardSourceEntry): { min: number; max: number } {
  return entry.tier === 'flat' ? FLAT_REWARD_BAND : TIER_BONUS_BAND[entry.tier];
}

describe('rewardTiers — band membership (live-measured)', () => {
  for (const entry of REWARD_SOURCES) {
    it(`${entry.id} (${entry.tier}): measured value sits inside its band`, () => {
      const value = measure(entry);
      const band = bandFor(entry);
      expect(value, `${entry.id} measured ${value}cr, outside its ${entry.tier} band [${band.min}, ${band.max}]`).toBeGreaterThanOrEqual(
        band.min,
      );
      expect(value, `${entry.id} measured ${value}cr, outside its ${entry.tier} band [${band.min}, ${band.max}]`).toBeLessThanOrEqual(
        band.max,
      );
    });
  }
});

describe('rewardTiers — the part-grant rule', () => {
  for (const entry of REWARD_SOURCES.filter((e) => e.grantsPart)) {
    it(`${entry.id}: grants a part, so its measured bonus sits in the lower half of its band`, () => {
      const value = measure(entry);
      const band = bandFor(entry);
      const midpoint = (band.min + band.max) / 2;
      expect(
        value,
        `${entry.id} grants a part but measured ${value}cr, above its band's midpoint (${midpoint}) — a part-granting source should sit in the lower half since the part is uncounted value`,
      ).toBeLessThanOrEqual(midpoint);
    });
  }
});

describe('rewardTiers — completeness tripwire (source-scrape)', () => {
  // Deliberately blunt regexes, not a parser: a future event paying via a
  // direct `credits:` state-spread (as the exempt chain-finale events do —
  // relic-core, colony-arrival, debt-broker, plus militia-requisition's
  // part-for-cash trade and salvage-claim's heat-priced payout) evades this
  // scrape entirely. That's accepted and documented — see rewardTiers.ts's
  // own header comment — the manifest review discipline is the second
  // layer for those.
  const payValues = [...eventsSource.matchAll(/\bpay\(state,\s*(-?\d+)\s*,/g)].map((m) => Number(m[1]));
  const positivePayValues = payValues.filter((v) => v > 0);
  const ambushCreditValues = [...eventsSource.matchAll(/ambushBonus:\s*\{\s*credits:\s*(-?\d+)/g)].map((m) => Number(m[1]));

  const flatMeasuredValues = REWARD_SOURCES.filter((e) => e.tier === 'flat').map(measure);
  const nonFlatMeasuredValues = REWARD_SOURCES.filter((e) => e.tier !== 'flat').map(measure);

  it('found at least one pay() and one ambushBonus.credits literal (the scrape itself is working)', () => {
    expect(payValues.length).toBeGreaterThan(0);
    expect(ambushCreditValues.length).toBeGreaterThan(0);
  });

  for (const value of positivePayValues) {
    it(`pay(state, ${value}, ...) is <= FLAT_REWARD_BAND.max and covered by a flat manifest entry`, () => {
      expect(
        value,
        `pay(state, ${value}, ...) found in events.ts exceeds FLAT_REWARD_BAND.max (${FLAT_REWARD_BAND.max}) — classify it in rewardTiers.ts`,
      ).toBeLessThanOrEqual(FLAT_REWARD_BAND.max);
      expect(
        flatMeasuredValues.includes(value),
        `pay(state, ${value}, ...) found in events.ts with no flat manifest entry measuring exactly ${value} credits — classify it in rewardTiers.ts`,
      ).toBe(true);
    });
  }

  for (const value of ambushCreditValues) {
    it(`ambushBonus: { credits: ${value} } is covered by a non-flat manifest entry`, () => {
      expect(
        nonFlatMeasuredValues.includes(value),
        `ambushBonus: { credits: ${value} } found in events.ts with no manifest entry measuring exactly ${value} credits — classify it in rewardTiers.ts`,
      ).toBe(true);
    });
  }
});

describe('rewardTiers — baseline curve shape', () => {
  it('winReward is non-decreasing in global column across both acts, outside the deliberate early dip', () => {
    // ACT1_HALVED_COLUMNS (cols 1-3) deliberately dip the curve below col 0
    // — pinned exactly by the halving test below. Excluding just those
    // three points, the rest of the curve (col 0, then col 4 onward through
    // both acts) must never decrease — this is what actually catches an
    // accidental future re-tuning that widens the dip or introduces a new
    // one elsewhere, which a full literal sweep (including the known dip)
    // could never assert without contradicting the intentional halving.
    const points: number[] = [winReward(globalColumn(1, 0), 1)];
    for (let c = 4; c <= 10; c++) points.push(winReward(globalColumn(1, c), 1));
    for (let c = 0; c <= 12; c++) points.push(winReward(globalColumn(2, c), 2));
    for (let i = 1; i < points.length; i++) {
      expect(points[i], `winReward dipped: ${points[i]} < ${points[i - 1]} at curve index ${i}`).toBeGreaterThanOrEqual(
        points[i - 1],
      );
    }
  });

  it('the early-column halving (act 1, cols 1-3) pays exactly floor((7+col)/2); col 0 and 4+ are unhalved', () => {
    expect(winReward(0, 1)).toBe(7);
    expect(winReward(1, 1)).toBe(Math.floor((7 + 1) / 2));
    expect(winReward(2, 1)).toBe(Math.floor((7 + 2) / 2));
    expect(winReward(3, 1)).toBe(Math.floor((7 + 3) / 2));
    for (let c = 4; c <= 10; c++) expect(winReward(c, 1)).toBe(7 + c);
  });

  it('the act-2 bonus is a constant, positive delta over the unbonused (7 + col) baseline at every act-2 column', () => {
    const deltas = Array.from({ length: 13 }, (_, c) => {
      const g = globalColumn(2, c);
      return winReward(g, 2) - (7 + g);
    });
    expect(deltas.every((d) => d === deltas[0])).toBe(true);
    expect(deltas[0]).toBeGreaterThan(0);
  });

  it('eliteReward - winReward is a constant +4 everywhere except act-1 cols 1-3, where the gap is strictly larger', () => {
    for (let c = 0; c <= 10; c++) {
      const g = globalColumn(1, c);
      const gap = eliteReward(g, 1) - winReward(g, 1);
      if (c >= 1 && c <= 3) {
        expect(gap, `expected a widened gap at act-1 col ${c}, got ${gap}`).toBeGreaterThan(4);
      } else {
        expect(gap, `expected the standard +4 gap at act-1 col ${c}, got ${gap}`).toBe(4);
      }
    }
    for (let c = 0; c <= 12; c++) {
      const g = globalColumn(2, c);
      const gap = eliteReward(g, 2) - winReward(g, 2);
      expect(gap, `expected the standard +4 gap at act-2 col ${c}, got ${gap}`).toBe(4);
    }
  });
});
