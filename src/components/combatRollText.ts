// Iteration 29: the combat log used to show only a roll's outcome ("rolls
// 4 — misses"), never the computer-vs-piloting math behind it — a working
// computer-boosting active was indistinguishable from a dead click if the
// defender's piloting happened to fully absorb it (the bug report this
// fixes: "Cybernetic uplink doesn't seem to work" — the active was firing
// correctly the whole time, just invisibly). Extracted from CombatScreen,
// same reasoning as replaySteps.ts: pure text formatting, no React in it,
// so it's directly unit-testable without a DOM.

export interface RollTextEvent {
  raw: number;
  computer: number;
  shield: number;
  hit: boolean;
  damage: number;
}

// `neededRoll` surfaces resolver.ts's own `raw + computer - shield >= 6`
// threshold, clamped to the 1-6 a die can actually show. When computer <=
// shield, the threshold clamps to 6 — i.e. only a natural 6 can ever hit —
// which gets its own plain-English callout rather than leaving the player
// to notice a "(needs 6+)" is quietly different from every other roll.
export function describeRoll(event: RollTextEvent, attacker: string, target: string): string {
  const nullified = event.computer <= event.shield;
  const isNaturalSix = event.raw === 6;
  const outcome = event.hit ? `hits ${target} for ${event.damage} damage` : `misses ${target}`;

  if (nullified) {
    const note = isNaturalSix
      ? `${target}'s piloting nullifies the computer bonus, but a natural 6 always hits regardless.`
      : `${target}'s piloting nullifies the computer bonus — only a natural 6 gets through.`;
    return `${attacker} rolls ${event.raw} — ${outcome}. ${note}`;
  }

  const neededRoll = Math.max(1, Math.min(6, 6 - event.computer + event.shield));
  const thresholdNote = isNaturalSix ? '' : ` (needs ${neededRoll}+)`;
  return `${attacker} rolls ${event.raw}${thresholdNote} — ${outcome}.`;
}
