import { describe, expect, it } from 'vitest';
import { initCombat, runToEnd } from './combatEngine';
import { GAUNTLET } from './enemies';
import { initialRunState, runReducer } from './reducer';
import { clearRun, loadDailyRecord, loadRun, saveDailyRecord, saveRun, SAVE_VERSION } from './persistence';
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

  it('a save/load roundtrip mid-defector-chain preserves pendingEventId (iteration 14.3, v4)', () => {
    const storage = fakeStorage();
    // The defector's "take them aboard" choice has resolved, but the player
    // hasn't reached the next event node yet — pendingEventId is the only
    // record that the pursuit is still owed.
    const midChain: RunState = { ...initialRunState(), phase: 'map', pendingEventId: 'defector-pursuit' };
    expect(saveRun(midChain, storage)).toBe(true);
    expect(loadRun(storage)).toEqual(midChain);
  });

  it('a save mid-ambush preserves the pending win-conditional bonus (iteration 14.3, v4)', () => {
    const storage = fakeStorage();
    const midAmbush: RunState = {
      ...initialRunState(),
      phase: 'prep',
      currentEnemy: GAUNTLET[0],
      pendingAmbushBonus: { credits: 8 },
    };
    expect(saveRun(midAmbush, storage)).toBe(true);
    expect(loadRun(storage)).toEqual(midAmbush);
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

  it('a save mid-repair-choice (before either branch is picked) roundtrips instead of blanking (iteration 15.3, v5)', () => {
    // The exact regression the plan calls out: the repair phase now has a
    // *choosing* sub-state (repairUpgradeOptions drawn, repairSummary not
    // yet set) that exists before the old "repair always means resolved"
    // shape did. A save taken here must still load, not blank the screen.
    const storage = fakeStorage();
    const midChoice: RunState = {
      ...initialRunState(),
      phase: 'repair',
      repairUpgradeOptions: ['spine', 'reactor', 'lattice'],
    };
    expect(saveRun(midChoice, storage)).toBe(true);
    expect(loadRun(storage)).toEqual(midChoice);
  });

  it('a save mid-repair-choice after the overhaul branch resolves also roundtrips', () => {
    const storage = fakeStorage();
    const resolved: RunState = {
      ...initialRunState(),
      phase: 'repair',
      repairUpgradeOptions: ['spine', 'reactor', 'lattice'],
      repairSummary: 'Overhaul complete — Reinforced spine fitted to the Flagship. No repairs made.',
    };
    expect(saveRun(resolved, storage)).toBe(true);
    expect(loadRun(storage)).toEqual(resolved);
  });

  it('loadRun discards a repair-phase save missing repairUpgradeOptions (the pre-15.3 shape)', () => {
    // Mirrors the 'combat' case above, one field over: a repair-phase save
    // from before the choosing sub-state existed (or simply malformed)
    // must not load as if it were valid.
    const storage = fakeStorage();
    const state: RunState = { ...initialRunState(), phase: 'repair' }; // no repairUpgradeOptions
    storage.setItem('eclipse.save.v1', JSON.stringify({ version: SAVE_VERSION, state }));
    expect(loadRun(storage)).toBeNull();
  });

  it('a save mid-protocol-draft roundtrips (iteration 28)', () => {
    const storage = fakeStorage();
    const state: RunState = {
      ...initialRunState(),
      phase: 'protocol-draft',
      act: 2,
      protocolOffers: ['reinforced-bulkheads', 'ace-pipeline', 'ghost-fleet-protocol'],
    };
    expect(saveRun(state, storage)).toBe(true);
    expect(loadRun(storage)).toEqual(state);
  });

  it('loadRun discards a protocol-draft-phase save missing protocolOffers (iteration 28)', () => {
    const storage = fakeStorage();
    const state: RunState = { ...initialRunState(), phase: 'protocol-draft', act: 2 }; // no protocolOffers
    storage.setItem('eclipse.save.v1', JSON.stringify({ version: SAVE_VERSION, state }));
    expect(loadRun(storage)).toBeNull();
  });

  it('loadRun discards a same-version save missing `heat` (added in v5, always required)', () => {
    const storage = fakeStorage();
    const { heat: _drop, ...withoutHeat } = initialRunState();
    storage.setItem('eclipse.save.v1', JSON.stringify({ version: SAVE_VERSION, state: withoutHeat }));
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

describe('save slots + the daily record (iteration 18)', () => {
  it('the daily slot is fully independent of the standard slot', () => {
    const storage = fakeStorage();
    const standard = initialRunState({ seed: 1 });
    const daily = initialRunState({ seed: 2, mode: 'daily', dailyDate: '2026-08-03' });

    expect(saveRun(standard, storage)).toBe(true);
    expect(saveRun(daily, storage, 'daily')).toBe(true);
    expect(loadRun(storage)).toEqual(standard);
    expect(loadRun(storage, 'daily')).toEqual(daily);

    clearRun(storage); // standard only
    expect(loadRun(storage)).toBeNull();
    expect(loadRun(storage, 'daily')).toEqual(daily);

    clearRun(storage, 'daily');
    expect(loadRun(storage, 'daily')).toBeNull();
  });

  it('the daily record roundtrips, and garbage comes back null', () => {
    const storage = fakeStorage();
    expect(loadDailyRecord(storage)).toBeNull();
    expect(
      saveDailyRecord({ date: '2026-08-03', outcome: 'defeat', shareText: 'Eclipse Daily — 2026-08-03' }, storage),
    ).toBe(true);
    expect(loadDailyRecord(storage)).toEqual({
      date: '2026-08-03',
      outcome: 'defeat',
      shareText: 'Eclipse Daily — 2026-08-03',
    });
    storage.setItem('eclipse.daily.v1', '{not json');
    expect(loadDailyRecord(storage)).toBeNull();
  });
});
