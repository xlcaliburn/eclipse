import { describe, expect, it } from 'vitest';
import { drawEscalationSchedule } from './escalations';
import { applyEscalations, GAUNTLET } from './enemies';
import { mulberry32 } from './rng';
import type { ScheduledEscalation } from './escalations';
import type { EnemyDef } from './types';

function findEnemy(id: string): EnemyDef {
  const found = GAUNTLET.find((e) => e.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

// GAUNTLET entries are single-group (iteration 9) — this is their one group.
function mainGroup(enemy: EnemyDef) {
  return enemy.groups[0];
}

describe('drawEscalationSchedule', () => {
  it('is deterministic for the same rng seed', () => {
    const a = drawEscalationSchedule(mulberry32(7));
    const b = drawEscalationSchedule(mulberry32(7));
    expect(a).toEqual(b);
  });

  it('draws exactly 4 distinct escalations: 2 in act 1 and 2 in act 2, each landing after columns 3 and 6', () => {
    const schedule = drawEscalationSchedule(mulberry32(42));
    expect(schedule).toHaveLength(4);
    const act1 = schedule.filter((e) => e.act === 1);
    const act2 = schedule.filter((e) => e.act === 2);
    expect(act1).toHaveLength(2);
    expect(act2).toHaveLength(2);
    expect(act1[0].landsAfterColumn).toBe(3);
    expect(act1[1].landsAfterColumn).toBe(6);
    expect(act2[0].landsAfterColumn).toBe(3);
    expect(act2[1].landsAfterColumn).toBe(6);
    const ids = schedule.map((e) => e.id);
    expect(new Set(ids).size).toBe(4); // drawn without replacement — all distinct
    expect(schedule.every((e) => e.revealed === false)).toBe(true);
  });
});

describe('applyEscalations', () => {
  const scoutPack = findEnemy('scout-pack'); // count 2, for squadrons testing
  const schedule: ScheduledEscalation[] = [
    { id: 'hardened', act: 1, landsAfterColumn: 2, revealed: false },
    { id: 'deflectors', act: 1, landsAfterColumn: 5, revealed: false },
  ];

  it('applies no escalation before its column', () => {
    const enemy = applyEscalations(scoutPack, 2, schedule);
    expect(mainGroup(enemy).stats.hp).toBe(mainGroup(scoutPack).stats.hp);
    expect(enemy.appliedEscalations).toBeUndefined();
  });

  it('applies only the first escalation once past its column', () => {
    const enemy = applyEscalations(scoutPack, 3, schedule);
    expect(mainGroup(enemy).stats.hp).toBe(mainGroup(scoutPack).stats.hp + 1); // hardened: +1 HP
    expect(enemy.appliedEscalations).toEqual(['hardened']);
  });

  it('applies both escalations once past the second column', () => {
    const enemy = applyEscalations(scoutPack, 6, schedule);
    expect(mainGroup(enemy).stats.hp).toBe(mainGroup(scoutPack).stats.hp + 1);
    expect(mainGroup(enemy).stats.shield).toBe(mainGroup(scoutPack).stats.shield + 1);
    expect(enemy.appliedEscalations).toEqual(['hardened', 'deflectors']);
  });

  it('reveal status does not affect whether an escalation applies', () => {
    const revealedSchedule: ScheduledEscalation[] = [{ id: 'hardened', act: 1, landsAfterColumn: 2, revealed: false }];
    const enemy = applyEscalations(scoutPack, 3, revealedSchedule);
    expect(mainGroup(enemy).stats.hp).toBe(mainGroup(scoutPack).stats.hp + 1);
  });

  it('squadrons only adds a ship to groups of 2 or more', () => {
    const soloSchedule: ScheduledEscalation[] = [{ id: 'squadrons', act: 1, landsAfterColumn: 0, revealed: false }];
    const soloEnemy = findEnemy('missile-frigate'); // count 1
    const groupEnemy = findEnemy('scout-pack'); // count 2

    const soloResult = applyEscalations(soloEnemy, 1, soloSchedule);
    const groupResult = applyEscalations(groupEnemy, 1, soloSchedule);

    expect(mainGroup(soloResult).count).toBe(1);
    expect(mainGroup(groupResult).count).toBe(3);
  });
});
