import { describe, expect, it } from 'vitest';
import { COUNTER_PROTOCOLS, drawCounterProtocols, getCounterProtocol } from './counterProtocols';
import { applyCounterProtocol, GAUNTLET, getFinalBoss } from './enemies';
import { mulberry32 } from './rng';
import type { EnemyDef } from './types';

function findEnemy(id: string): EnemyDef {
  const found = GAUNTLET.find((e) => e.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function mainGroup(enemy: EnemyDef) {
  return enemy.groups[0];
}

describe('counterProtocols (iteration 30)', () => {
  it('every counter-protocol id resolves via getCounterProtocol with a matching id', () => {
    for (const id of Object.keys(COUNTER_PROTOCOLS) as (keyof typeof COUNTER_PROTOCOLS)[]) {
      expect(getCounterProtocol(id).id).toBe(id);
    }
  });

  it('draws exactly one silver, one gold, one prismatic counter, in that order', () => {
    const counters = drawCounterProtocols(mulberry32(1));
    expect(counters).toHaveLength(3);
    expect(getCounterProtocol(counters[0]).tier).toBe('silver');
    expect(getCounterProtocol(counters[1]).tier).toBe('gold');
    expect(getCounterProtocol(counters[2]).tier).toBe('prismatic');
  });

  it('is deterministic for a fixed rng stream', () => {
    const a = drawCounterProtocols(mulberry32(42));
    const b = drawCounterProtocols(mulberry32(42));
    expect(a).toEqual(b);
  });

  it('varies across seeds — not a hardcoded fixed triple', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      seen.add(drawCounterProtocols(mulberry32(seed)).join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('applyCounterProtocol', () => {
  const scoutPack = findEnemy('scout-pack'); // single group, cannons present

  it('hardened-veterans: +1 HP on every group', () => {
    const enemy = applyCounterProtocol(scoutPack, 'hardened-veterans');
    expect(mainGroup(enemy).stats.hp).toBe(mainGroup(scoutPack).stats.hp + 1);
    expect(enemy.appliedCounter).toBe('hardened-veterans');
  });

  it('targeting-arrays: +1 computer on every group', () => {
    const enemy = applyCounterProtocol(scoutPack, 'targeting-arrays');
    expect(mainGroup(enemy).stats.computer).toBe(mainGroup(scoutPack).stats.computer + 1);
  });

  it('evasive-doctrine: +1 shield (piloting) on every group', () => {
    const enemy = applyCounterProtocol(scoutPack, 'evasive-doctrine');
    expect(mainGroup(enemy).stats.shield).toBe(mainGroup(scoutPack).stats.shield + 1);
  });

  it('flak-screens: +1 flak on every group, from 0 or stacking on an existing value', () => {
    const enemy = applyCounterProtocol(scoutPack, 'flak-screens');
    expect(mainGroup(enemy).stats.flak).toBe(1); // scout pack starts with none
    const twice = applyCounterProtocol(enemy, 'flak-screens');
    expect(mainGroup(twice).stats.flak).toBe(2);
  });

  it('piercing-munitions: +1 shieldPierce on every cannon (not missiles, not the ship-level field)', () => {
    const missileFrigate = findEnemy('missile-frigate'); // has both a cannon and a missile
    const before = mainGroup(missileFrigate).stats;
    const enemy = applyCounterProtocol(missileFrigate, 'piercing-munitions');
    const after = mainGroup(enemy).stats;
    expect(after.cannons[0].shieldPierce).toBe((before.cannons[0].shieldPierce ?? 0) + 1);
    expect(after.missiles[0].shieldPierce ?? 0).toBe(before.missiles[0].shieldPierce ?? 0); // untouched
    expect(after.shieldPierce ?? 0).toBe(before.shieldPierce ?? 0); // ship-level field untouched
  });

  it('overdrive-signals: +2 initiative on every group', () => {
    const enemy = applyCounterProtocol(scoutPack, 'overdrive-signals');
    expect(mainGroup(enemy).stats.initiative).toBe(mainGroup(scoutPack).stats.initiative + 2);
  });

  it('ablative-plating: +1 reactiveArmor on every group, stacking on an existing value', () => {
    const enemy = applyCounterProtocol(scoutPack, 'ablative-plating');
    expect(mainGroup(enemy).stats.reactiveArmor).toBe(1);
    const twice = applyCounterProtocol(enemy, 'ablative-plating');
    expect(mainGroup(twice).stats.reactiveArmor).toBe(2);
  });

  it('overcharged-munitions: +1 damage on every cannon die', () => {
    const before = mainGroup(scoutPack).stats.cannons[0].damage;
    const enemy = applyCounterProtocol(scoutPack, 'overcharged-munitions');
    expect(mainGroup(enemy).stats.cannons[0].damage).toBe(before + 1);
  });

  it('attack-wings: every group gains +1 ship, a solo enemy gains a wingman', () => {
    const solo = applyCounterProtocol(findEnemy('missile-frigate'), 'attack-wings'); // count 1
    const group = applyCounterProtocol(findEnemy('scout-pack'), 'attack-wings'); // count 2

    expect(mainGroup(solo).count).toBe(2);
    expect(mainGroup(group).count).toBe(3);
    expect(solo.appliedCounter).toBe('attack-wings');
  });

  it("attack-wings reinforces a boss's escort screen without cloning the boss itself", () => {
    const titan = getFinalBoss('titan');
    const reinforced = applyCounterProtocol(titan, 'attack-wings');

    expect(reinforced.groups[0].count).toBe(1); // one Titan stays one Titan
    expect(reinforced.groups[1].count).toBe(titan.groups[1].count + 1); // its guard grows
  });

  it('attack-wings never clones a solo boss (single-group centerpiece)', () => {
    const loneBoss: EnemyDef = { id: 'titan', name: 'Titan', blurb: '', groups: [{ ...getFinalBoss('titan').groups[0] }] };
    const result = applyCounterProtocol(loneBoss, 'attack-wings');
    expect(result.groups[0].count).toBe(1);
  });

  it('mutating the result never mutates the original enemy definition (deep clone, not a shallow patch)', () => {
    const before = JSON.stringify(scoutPack);
    applyCounterProtocol(scoutPack, 'overcharged-munitions');
    expect(JSON.stringify(scoutPack)).toBe(before);
  });
});
