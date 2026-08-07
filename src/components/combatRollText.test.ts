import { describe, expect, it } from 'vitest';
import { describeRoll } from './combatRollText';

function roll(overrides: Partial<Parameters<typeof describeRoll>[0]> = {}) {
  return { raw: 4, computer: 2, shield: 0, hit: true, damage: 2, ...overrides };
}

describe('describeRoll (iteration 29 — roll legibility)', () => {
  it('shows the needed threshold on a non-natural-6 miss', () => {
    // comp 2, shield 1 -> needs 6-2+1 = 5+
    const text = describeRoll(roll({ raw: 4, computer: 2, shield: 1, hit: false, damage: 0 }), 'ISV Test', 'Raider');
    expect(text).toBe('ISV Test rolls 4 (needs 5+) — misses Raider.');
  });

  it('shows the needed threshold on a non-natural-6 hit', () => {
    const text = describeRoll(roll({ raw: 5, computer: 2, shield: 1, hit: true, damage: 2 }), 'ISV Test', 'Raider');
    expect(text).toBe('ISV Test rolls 5 (needs 5+) — hits Raider for 2 damage.');
  });

  it('omits the threshold note on a natural 6 (it always hits regardless of the number)', () => {
    // Non-nullified stats (computer > shield) — isolates the "(needs N+)"
    // omission from the separate nullification callout below.
    const text = describeRoll(roll({ raw: 6, computer: 2, shield: 0, hit: true, damage: 2 }), 'ISV Test', 'Raider');
    expect(text).toBe('ISV Test rolls 6 — hits Raider for 2 damage.');
  });

  it('clamps the needed threshold at 6, never showing "needs 7+" or higher', () => {
    // comp 0, shield 4 -> raw formula would say "needs 10+", clamped to 6 and nullified instead
    const text = describeRoll(roll({ raw: 3, computer: 0, shield: 4, hit: false, damage: 0 }), 'ISV Test', 'Raider');
    expect(text).not.toContain('needs 10');
    expect(text).not.toContain('needs 7');
  });

  it('calls out nullification in plain English on a miss when computer <= shield', () => {
    // The exact shape of the original bug report: a computer-boosting
    // active fired correctly, but the defender's piloting fully absorbed
    // it, so nothing but a natural 6 could ever land.
    const text = describeRoll(roll({ raw: 3, computer: 2, shield: 2, hit: false, damage: 0 }), 'ISV Test', 'Raider');
    expect(text).toBe(
      "ISV Test rolls 3 — misses Raider. Raider's piloting nullifies the computer bonus — only a natural 6 gets through.",
    );
  });

  it('calls out nullification differently on a hit (must have been a natural 6)', () => {
    const text = describeRoll(roll({ raw: 6, computer: 1, shield: 3, hit: true, damage: 2 }), 'ISV Test', 'Raider');
    expect(text).toBe(
      "ISV Test rolls 6 — hits Raider for 2 damage. Raider's piloting nullifies the computer bonus, but a natural 6 always hits regardless.",
    );
  });

  it('treats computer exactly equal to shield as nullified (the boundary case)', () => {
    const text = describeRoll(roll({ raw: 4, computer: 3, shield: 3, hit: false, damage: 0 }), 'ISV Test', 'Raider');
    expect(text).toContain("nullifies the computer bonus");
  });

  it('does not call nullification when computer is exactly one point above shield', () => {
    const text = describeRoll(roll({ raw: 4, computer: 3, shield: 2, hit: false, damage: 0 }), 'ISV Test', 'Raider');
    expect(text).not.toContain('nullifies');
    expect(text).toContain('needs 5+'); // 6 - 3 + 2 = 5
  });
});
