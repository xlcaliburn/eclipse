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

// 2026-08-07: dropped the old per-shot "piloting nullifies the computer
// bonus" paragraph — it fired on every single roll whenever computer <=
// shield, but the plain "(needs 6+)" note below already says the same
// thing, just shorter. The one case that note alone can't explain is a
// natural 6 that hits despite the formula itself saying miss — that's the
// one spot a short callout still earns its place.
export function describeRoll(event: RollTextEvent, attacker: string, target: string): string {
  const outcome = event.hit ? `hits ${target} for ${event.damage} damage` : `misses ${target}`;
  const isNaturalSix = event.raw === 6;
  // Mirrors resolver.ts's own raw + computer - shield >= 6 threshold, before
  // the natural-6/natural-1 overrides — used only to detect the rare shot
  // where the natural-6 override is what actually decided the outcome.
  const formulaHit = event.raw + event.computer - event.shield >= 6;
  const naturalSixDecided = isNaturalSix && event.hit && !formulaHit;

  if (naturalSixDecided) {
    return `${attacker} rolls ${event.raw} — ${outcome}. ${target}'s piloting would have stopped anything but a natural 6.`;
  }

  // `neededRoll` surfaces resolver.ts's own threshold, clamped to the 1-6 a
  // die can actually show — when computer <= shield this naturally clamps
  // to 6, i.e. "only a natural 6 can ever hit," with no separate callout
  // needed to say so.
  const neededRoll = Math.max(1, Math.min(6, 6 - event.computer + event.shield));
  const thresholdNote = isNaturalSix ? '' : ` (needs ${neededRoll}+)`;
  return `${attacker} rolls ${event.raw}${thresholdNote} — ${outcome}.`;
}
