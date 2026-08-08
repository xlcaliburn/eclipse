import { describe, expect, it } from 'vitest';
import type { CombatEvent, EnemyDef } from '../game/types';
import { describeEvent, eventClassName, resolveGroup, shipLabel } from './combatLogText';

function enemy(groups: EnemyDef['groups']): EnemyDef {
  return { id: 'test', name: 'Test squad', blurb: '', groups };
}

const singleGroup = enemy([{ label: 'Scout', count: 3, stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] } }]);
const multiGroup = enemy([
  { label: 'Escort', count: 2, stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] } },
  { label: 'Sniper', count: 1, stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] } },
]);

describe('resolveGroup', () => {
  it('finds the group and within-group index for a flattened enemy-side index', () => {
    expect(resolveGroup(multiGroup, 0)).toEqual({ group: multiGroup.groups[0], groupIndex: 0, withinGroupIndex: 0 });
    expect(resolveGroup(multiGroup, 1)).toEqual({ group: multiGroup.groups[0], groupIndex: 0, withinGroupIndex: 1 });
    expect(resolveGroup(multiGroup, 2)).toEqual({ group: multiGroup.groups[1], groupIndex: 1, withinGroupIndex: 0 });
  });

  it('falls back to the last group for an out-of-range index', () => {
    expect(resolveGroup(multiGroup, 99).groupIndex).toBe(1);
  });
});

describe('shipLabel', () => {
  it('returns the player label directly, falling back when missing', () => {
    expect(shipLabel('player', 0, singleGroup, ['ISV Resolute'])).toBe('ISV Resolute');
    expect(shipLabel('player', 5, singleGroup, ['ISV Resolute'])).toBe('your ship');
  });

  it('numbers a single-group enemy composition when there is more than one ship', () => {
    expect(shipLabel('enemy', 0, singleGroup, [])).toBe('Test squad #1');
    expect(shipLabel('enemy', 2, singleGroup, [])).toBe('Test squad #3');
  });

  it('does not number a single-group, single-ship enemy', () => {
    const solo = enemy([{ label: 'Boss', count: 1, stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] } }]);
    expect(shipLabel('enemy', 0, solo, [])).toBe('Test squad');
  });

  it('uses the group label for a multi-group formation, numbered within the group', () => {
    expect(shipLabel('enemy', 0, multiGroup, [])).toBe('Escort #1');
    expect(shipLabel('enemy', 1, multiGroup, [])).toBe('Escort #2');
    expect(shipLabel('enemy', 2, multiGroup, [])).toBe('Sniper'); // count 1 — not numbered
  });
});

describe('eventClassName', () => {
  it('classes a hit for the shooter\'s side, a miss as miss regardless of side', () => {
    const playerHit = { kind: 'roll', side: 'player', hit: true } as CombatEvent;
    const enemyHit = { kind: 'roll', side: 'enemy', hit: true } as CombatEvent;
    const miss = { kind: 'roll', side: 'player', hit: false } as CombatEvent;
    expect(eventClassName(playerHit)).toBe('combat-log__line combat-log__line--good');
    expect(eventClassName(enemyHit)).toBe('combat-log__line combat-log__line--bad');
    expect(eventClassName(miss)).toBe('combat-log__line combat-log__line--miss');
  });

  it('classes a destroyed event opposite the roll convention — losing a ship is bad', () => {
    const playerLost = { kind: 'destroyed', side: 'player' } as CombatEvent;
    const enemyLost = { kind: 'destroyed', side: 'enemy' } as CombatEvent;
    expect(eventClassName(playerLost)).toBe('combat-log__line combat-log__line--bad');
    expect(eventClassName(enemyLost)).toBe('combat-log__line combat-log__line--good');
  });

  it('classes phase-start distinctly, and part-effect/outspeed as documented', () => {
    expect(eventClassName({ kind: 'phase-start' } as CombatEvent)).toBe('combat-log__phase');
    expect(eventClassName({ kind: 'part-effect' } as CombatEvent)).toBe('combat-log__line combat-log__line--card');
    expect(eventClassName({ kind: 'outspeed', side: 'player' } as CombatEvent)).toBe('combat-log__line combat-log__line--good');
  });
});

describe('describeEvent', () => {
  it('names the missile phase and each cannon round', () => {
    expect(describeEvent({ kind: 'phase-start', phase: 'missile', round: 0 } as CombatEvent, singleGroup, [])).toBe(
      'Missile phase',
    );
    expect(describeEvent({ kind: 'phase-start', phase: 'cannon', round: 3 } as CombatEvent, singleGroup, [])).toBe(
      'Cannon round 3',
    );
  });

  it('describes a destroyed ship by its resolved label', () => {
    const event = { kind: 'destroyed', side: 'enemy', shipIndex: 0 } as CombatEvent;
    expect(describeEvent(event, singleGroup, [])).toBe('Test squad #1 is destroyed.');
  });

  it('describes an outspeed activation for each side', () => {
    const playerEvent = { kind: 'outspeed', side: 'player', shipIndex: 0 } as CombatEvent;
    expect(describeEvent(playerEvent, singleGroup, ['ISV Resolute'])).toBe(
      'ISV Resolute outspeeds the enemy fleet — second activation.',
    );
    const enemyEvent = { kind: 'outspeed', side: 'enemy', shipIndex: 0 } as CombatEvent;
    expect(describeEvent(enemyEvent, singleGroup, [])).toBe('Test squad #1 outspeeds your fleet — second activation.');
  });

  it('describes a stalemate and a part-effect', () => {
    expect(describeEvent({ kind: 'stalemate' } as CombatEvent, singleGroup, [])).toBe(
      'Combat drags on for 30 rounds with no resolution — the enemy is declared the winner.',
    );
    expect(describeEvent({ kind: 'part-effect', text: 'ISV Resolute jinks' } as CombatEvent, singleGroup, [])).toBe(
      'ISV Resolute jinks',
    );
  });

  it('delegates a roll event to describeRoll with resolved attacker/target labels', () => {
    const event = {
      kind: 'roll',
      side: 'player',
      shooterIndex: 0,
      targetIndex: 1,
      raw: 4,
      computer: 1,
      shield: 0,
      hit: true,
      damage: 2,
    } as CombatEvent;
    expect(describeEvent(event, singleGroup, ['ISV Resolute'])).toBe(
      'ISV Resolute rolls 4 (needs 5+) — hits Test squad #2 for 2 damage.',
    );
  });
});
