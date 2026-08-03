import type { CombatEvent } from '../game/types';

// How the combat replay chunks its log. A ship with multiple guns (or a
// multi-die weapon) logs one 'roll' per die, and revealing those one at a
// time made a single activation patter out shot by shot. Grouping them into
// one reveal step lands a ship's dice together, the way rolling a handful of
// dice actually looks.
//
// Extracted from CombatScreen so the stepping is testable on its own — it's
// pure log arithmetic with no React in it.

// Identifies one ship's activation. Two rolls share a key exactly when they
// belong to the same ship firing in the same round and phase.
export function shotKeyOf(event: CombatEvent | undefined): string | null {
  if (!event || event.kind !== 'roll') return null;
  return `${event.side}:${event.shooterIndex}:${event.round}:${event.phase}`;
}

// Where the reveal step starting at `from` ends (exclusive).
//
// Non-roll events stay one-at-a-time; a roll pulls in the rest of its
// shooter's dice. Interleaved non-roll entries get swept in too, but only
// when a same-shooter die still follows — a jink logs immediately before the
// roll it negates, so stopping at it would split one ship's volley in two.
export function revealStepEnd(log: CombatEvent[], from: number): number {
  const key = shotKeyOf(log[from]);
  if (key === null) return from + 1;

  let end = from + 1;
  let i = from + 1;
  while (i < log.length) {
    const k = shotKeyOf(log[i]);
    if (k !== null) {
      if (k !== key) break; // a different ship is firing — that's a new step
      i++;
      end = i;
      continue;
    }
    // Non-roll: absorb it only if this shooter has another die still to come
    // before any other shooter's.
    let j = i + 1;
    while (j < log.length && shotKeyOf(log[j]) === null) j++;
    if (j >= log.length || shotKeyOf(log[j]) !== key) break;
    i = j + 1;
    end = i;
  }
  return end;
}

// How many steps the replay will take to reveal log[from..to). Used to pace
// the round's animation budget over steps rather than raw entries.
export function countRevealSteps(log: CombatEvent[], from: number, to: number): number {
  let steps = 0;
  for (let i = from; i < to; i = revealStepEnd(log, i)) steps++;
  return steps;
}
