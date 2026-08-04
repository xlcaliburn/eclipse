import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { COMMANDERS, drawCommanderChoices, getCommander } from './commanders';
import type { CommanderId } from './commanders';

const ALL_IDS: CommanderId[] = ['merchant', 'engineer', 'warlord', 'spymaster', 'admiral'];

describe('drawCommanderChoices (iteration 21: 5-commander roster)', () => {
  it('draws 3 distinct commanders out of the 5', () => {
    const choices = drawCommanderChoices(mulberry32(1));
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
    for (const id of choices) expect(ALL_IDS).toContain(id);
  });

  it('is deterministic for a given seed', () => {
    expect(drawCommanderChoices(mulberry32(42))).toEqual(drawCommanderChoices(mulberry32(42)));
  });

  it('can draw every commander across enough seeds — the Admiral is reachable, not orphaned', () => {
    const seen = new Set<CommanderId>();
    for (let seed = 1; seed <= 60; seed++) {
      for (const id of drawCommanderChoices(mulberry32(seed))) seen.add(id);
    }
    expect(seen.size).toBe(5);
  });
});

describe('getCommander / COMMANDERS (iteration 21)', () => {
  it('has an entry, name, and non-empty description for every id', () => {
    for (const id of ALL_IDS) {
      const commander = getCommander(id);
      expect(commander.id).toBe(id);
      expect(commander.name.length).toBeGreaterThan(0);
      expect(commander.description.length).toBeGreaterThan(0);
    }
  });

  it('the Warlord and Admiral are distinct commanders with distinct descriptions', () => {
    // The regression this guards: the Warlord's old (wide, free-ship) kit
    // must not still be its description now that the Admiral has that role.
    expect(COMMANDERS.warlord.description).not.toContain('free Interceptor');
    expect(COMMANDERS.admiral.description).toContain('free Interceptor');
  });
});
