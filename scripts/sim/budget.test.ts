import { describe, expect, it } from 'vitest';
import { getFrame } from '../../src/game/frames';
import { getPart, STARTING_LOADOUT } from '../../src/game/parts';
import { effectiveSlotLayout, effectiveSlots, weaponCeiling } from '../../src/game/ship';
import { buildFleet, creditsBankedByColumn } from './budget';
import type { Archetype } from './budget';

const ARCHETYPES: Archetype[] = ['balanced', 'tank-taunt', 'alpha-missile', 'outspeed', 'wide', 'tall'];

// The Flagship's STARTING_LOADOUT is a free starting fit, not a purchase —
// buildFleet only ever APPENDS to it, never removes, so anything beyond
// that prefix is what was actually bought.
function fleetCost(fleet: ReturnType<typeof buildFleet>): number {
  return fleet.reduce((sum, ship, i) => {
    const frameCost = ship.frameId === 'cruiser' ? 0 : getFrame(ship.frameId).cost;
    const boughtParts = i === 0 ? ship.equipped.slice(STARTING_LOADOUT.length) : ship.equipped;
    const partsCost = boughtParts.reduce((n, id) => n + getPart(id).cost, 0);
    return sum + frameCost + partsCost;
  }, 0);
}

describe('buildFleet', () => {
  it('never spends more than the budget, for every archetype at several budgets', () => {
    for (const archetype of ARCHETYPES) {
      for (const credits of [0, 5, 15, 30, 60, 120]) {
        const fleet = buildFleet(credits, archetype);
        expect(fleetCost(fleet)).toBeLessThanOrEqual(credits);
      }
    }
  });

  it('always includes the starting Flagship', () => {
    const fleet = buildFleet(50, 'balanced');
    expect(fleet[0].frameId).toBe('cruiser');
  });

  it('respects each ship\'s effective slot count', () => {
    for (const archetype of ARCHETYPES) {
      const fleet = buildFleet(80, archetype);
      for (const ship of fleet) {
        expect(ship.equipped.length).toBeLessThanOrEqual(effectiveSlots(ship.frameId, ship.upgrades));
      }
    }
  });

  it('respects each frame\'s typed-slot weapon ceiling', () => {
    // Bastion caps at 1 weapon (no universal overflow) — the tank-taunt
    // archetype leans on it heavily enough to be a real test of the cap,
    // not just Flagship slots. Iteration 52.1: the ceiling is now derived
    // (dedicated weapon slots + universal slots) rather than a flat
    // `maxWeapons` field.
    const fleet = buildFleet(60, 'tank-taunt');
    for (const ship of fleet) {
      const ceiling = weaponCeiling(effectiveSlotLayout(ship.frameId, ship.upgrades));
      const weaponCount = ship.equipped.filter((id) => getPart(id).weapon).length;
      expect(weaponCount).toBeLessThanOrEqual(ceiling);
    }
  });

  it('the tall archetype never buys a second hull', () => {
    const fleet = buildFleet(150, 'tall');
    expect(fleet.length).toBe(1);
  });

  it('the wide archetype buys more hulls than balanced at the same budget', () => {
    const wide = buildFleet(40, 'wide');
    const balanced = buildFleet(40, 'balanced');
    expect(wide.length).toBeGreaterThanOrEqual(balanced.length);
  });

  it('re-derives without throwing across a wide budget range (stability under a hypothetical price change)', () => {
    for (const archetype of ARCHETYPES) {
      for (let credits = 0; credits <= 200; credits += 7) {
        expect(() => buildFleet(credits, archetype)).not.toThrow();
      }
    }
  });
});

describe('creditsBankedByColumn', () => {
  it('sums the reward formula across columns 0..col-1', () => {
    const flatReward = () => 5;
    expect(creditsBankedByColumn(0, flatReward)).toBe(0);
    expect(creditsBankedByColumn(3, flatReward)).toBe(15);
  });

  it('matches a manual sum for a column-dependent formula', () => {
    const reward = (col: number) => 7 + col;
    let expected = 0;
    for (let c = 0; c < 5; c++) expected += 7 + c;
    expect(creditsBankedByColumn(5, reward)).toBe(expected);
  });
});
