import { describe, expect, it } from 'vitest';
import { initCombat, runToEnd } from './combatEngine';
import { GAUNTLET } from './enemies';
import { initialRunState, runReducer } from './reducer';
import { clearRun, loadRun, saveRun, SAVE_VERSION } from './persistence';
import type { StorageLike } from './persistence';
import type { RunState } from './types';

// A minimal in-memory Web Storage stand-in, so these tests exercise the
// real save/load code paths without needing a DOM environment (see
// persistence.ts's rationale for accepting an injectable storage).
function fakeStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('storage disabled');
    },
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: () => {
      throw new Error('storage disabled');
    },
  };
}

describe('save / load roundtrip (iteration 9.2)', () => {
  it('saveRun then loadRun returns a deep-equal RunState', () => {
    const storage = fakeStorage();
    const state = initialRunState();
    expect(saveRun(state, storage)).toBe(true);
    expect(loadRun(storage)).toEqual(state);
  });

  it('RunState survives a raw JSON roundtrip in every phase, including mid-combat and mid-event', () => {
    const base = initialRunState();
    expect(JSON.parse(JSON.stringify(base))).toEqual(base);

    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    const midCombat: RunState = { ...base, phase: 'combat', combat, currentEnemy: GAUNTLET[0] };
    expect(JSON.parse(JSON.stringify(midCombat))).toEqual(midCombat);

    const midEvent: RunState = { ...base, phase: 'event', currentEvent: { eventId: 'derelict-cruiser' } };
    expect(JSON.parse(JSON.stringify(midEvent))).toEqual(midEvent);
  });

  it('loadRun returns null when nothing has been saved', () => {
    expect(loadRun(fakeStorage())).toBeNull();
  });

  it('loadRun discards silently on a version mismatch (no migrations)', () => {
    const storage = fakeStorage();
    const state = initialRunState();
    storage.setItem('eclipse.save.v1', JSON.stringify({ version: SAVE_VERSION + 1, state }));
    expect(loadRun(storage)).toBeNull();
  });

  it('loadRun discards a same-version save missing a field added after saving shipped (blank-screen regression)', () => {
    // Reproduces the bug: a save from before `targetingStance` existed on
    // RunState was still accepted (SAVE_VERSION never bumped), loading with
    // `targetingStance: undefined` and rendering nothing useful downstream.
    const storage = fakeStorage();
    const { targetingStance: _drop, ...withoutStance } = initialRunState();
    storage.setItem('eclipse.save.v1', JSON.stringify({ version: SAVE_VERSION, state: withoutStance }));
    expect(loadRun(storage)).toBeNull();
  });

  it('loadRun discards a save whose phase and companion field have drifted apart', () => {
    // App.tsx renders 'combat'/'reward'/'shop'/'repair'/'event' behind an
    // extra guard (e.g. `phase === 'combat' && combat && currentEnemy`) with
    // no fallback — a save in one of these phases missing its companion
    // field would otherwise load fine and render a blank screen.
    const storage = fakeStorage();
    const state: RunState = { ...initialRunState(), phase: 'combat' }; // no `combat`/`currentEnemy`
    storage.setItem('eclipse.save.v1', JSON.stringify({ version: SAVE_VERSION, state }));
    expect(loadRun(storage)).toBeNull();
  });

  it('loadRun discards silently on corrupt JSON', () => {
    const storage = fakeStorage();
    storage.setItem('eclipse.save.v1', '{not valid json');
    expect(loadRun(storage)).toBeNull();
  });

  it('clearRun removes the save', () => {
    const storage = fakeStorage();
    const state = initialRunState();
    saveRun(state, storage);
    clearRun(storage);
    expect(loadRun(storage)).toBeNull();
  });

  it('fails soft (never throws) when storage is unavailable or throws', () => {
    expect(saveRun(initialRunState(), null)).toBe(false);
    expect(loadRun(null)).toBeNull();
    expect(() => clearRun(null)).not.toThrow();

    const bad = throwingStorage();
    expect(() => saveRun(initialRunState(), bad)).not.toThrow();
    expect(saveRun(initialRunState(), bad)).toBe(false);
    expect(() => loadRun(bad)).not.toThrow();
    expect(loadRun(bad)).toBeNull();
    expect(() => clearRun(bad)).not.toThrow();
  });

  it('a run saved mid-fight continues bit-identically to a never-saved run', () => {
    const base = initialRunState();
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 8, computer: 1, shield: 0, cannons: [{ diceCount: 2, damage: 1 }], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[2],
      7,
    );
    // Step it partway through so the save captures real mid-fight state:
    // log entries, rngCounter, an in-progress round.
    const stepped = { ...combat };
    const midFight: RunState = {
      ...base,
      phase: 'combat',
      currentEnemy: GAUNTLET[2],
      currentCombatSeed: combat.seed,
      combat: stepped,
    };

    const storage = fakeStorage();
    saveRun(midFight, storage);
    const reloaded = loadRun(storage)!;

    const finishedFromSave = runToEnd(reloaded.combat!);
    const finishedNeverSaved = runToEnd(midFight.combat!);
    expect(finishedFromSave).toEqual(finishedNeverSaved);
  });

  it('a run saved mid-fight, continued via the reducer, produces hand/log/actives identical to the unsaved path', () => {
    let state = initialRunState();
    state = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: state.commanderChoices[0] });
    state = runReducer(state, { type: 'SETUP_CONFIRM' });
    state = runReducer(state, { type: 'PICK_NODE', row: 0 }); // the act-1 opener
    state = runReducer(state, { type: 'ENGAGE' });

    const storage = fakeStorage();
    saveRun(state, storage);
    const reloaded = loadRun(storage)!;

    const a = runReducer(state, { type: 'AUTO_RESOLVE' });
    const b = runReducer(reloaded, { type: 'AUTO_RESOLVE' });
    expect(a).toEqual(b);
  });
});
