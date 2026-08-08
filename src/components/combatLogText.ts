import type { CombatEvent, EnemyDef, EnemyGroup } from '../game/types';
import { describeRoll } from './combatRollText';

// 47.4.1: extracted from CombatScreen, same reasoning as combatRollText.ts
// and replaySteps.ts — pure text/classing logic, no React in it, so it's
// directly unit-testable without a DOM. `resolveGroup`/`shipLabel` stay
// exported (not folded into `describeEvent`) — CombatScreen also uses them
// directly to build CombatFleetView's enemyLabels/enemyArchetypes props.

// Resolves a flattened enemy-side index (see combatEngine.ts's initCombat,
// which lays sub-groups out in order) back to the group it came from, plus
// that ship's position within its own group.
export function resolveGroup(
  enemy: EnemyDef,
  index: number,
): { group: EnemyGroup; groupIndex: number; withinGroupIndex: number } {
  let remaining = index;
  for (let g = 0; g < enemy.groups.length; g++) {
    const group = enemy.groups[g];
    if (remaining < group.count) return { group, groupIndex: g, withinGroupIndex: remaining };
    remaining -= group.count;
  }
  const groupIndex = enemy.groups.length - 1;
  return { group: enemy.groups[groupIndex], groupIndex, withinGroupIndex: 0 };
}

export function shipLabel(
  side: 'player' | 'enemy',
  index: number,
  enemy: EnemyDef,
  playerLabels: string[],
): string {
  if (side === 'player') return playerLabels[index] ?? 'your ship';
  if (enemy.groups.length === 1) {
    const { count } = enemy.groups[0];
    return count > 1 ? `${enemy.name} #${index + 1}` : enemy.name;
  }
  const { group, withinGroupIndex } = resolveGroup(enemy, index);
  return group.count > 1 ? `${group.label} #${withinGroupIndex + 1}` : group.label;
}

export function eventClassName(event: CombatEvent): string {
  if (event.kind === 'phase-start') return 'combat-log__phase';
  if (event.kind === 'roll') {
    if (!event.hit) return 'combat-log__line combat-log__line--miss';
    return event.side === 'player' ? 'combat-log__line combat-log__line--good' : 'combat-log__line combat-log__line--bad';
  }
  if (event.kind === 'destroyed') {
    return event.side === 'player' ? 'combat-log__line combat-log__line--bad' : 'combat-log__line combat-log__line--good';
  }
  if (event.kind === 'part-effect') {
    return 'combat-log__line combat-log__line--card';
  }
  if (event.kind === 'outspeed') {
    return event.side === 'player' ? 'combat-log__line combat-log__line--good' : 'combat-log__line combat-log__line--bad';
  }
  return 'combat-log__line combat-log__line--bad';
}

export function describeEvent(event: CombatEvent, enemy: EnemyDef, playerLabels: string[]): string | null {
  switch (event.kind) {
    case 'phase-start':
      return event.phase === 'missile' ? 'Missile phase' : `Cannon round ${event.round}`;
    case 'roll': {
      const attacker = shipLabel(event.side, event.shooterIndex, enemy, playerLabels);
      const defenderSide = event.side === 'player' ? 'enemy' : 'player';
      const target = shipLabel(defenderSide, event.targetIndex, enemy, playerLabels);
      return describeRoll(event, attacker, target);
    }
    case 'destroyed': {
      const label = shipLabel(event.side, event.shipIndex, enemy, playerLabels);
      return `${label} is destroyed.`;
    }
    case 'outspeed': {
      const label = shipLabel(event.side, event.shipIndex, enemy, playerLabels);
      const opposing = event.side === 'player' ? 'the enemy fleet' : 'your fleet';
      return `${label} outspeeds ${opposing} — second activation.`;
    }
    case 'stalemate':
      return 'Combat drags on for 30 rounds with no resolution — the enemy is declared the winner.';
    case 'part-effect':
      return event.text;
    default:
      return null;
  }
}
