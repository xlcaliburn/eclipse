import type { RunState } from './types';

// Bump whenever RunState's shape changes incompatibly — no migrations at
// this stage (post-1.0 problem); a version mismatch just discards the old
// save silently and offers a new run instead.
//
// v2 (iteration 9/10 cleanup): several required fields (`rngCounter`,
// `targetingStance`, etc.) were added to RunState across iteration 9 without
// bumping this, so a save written before they existed was accepted as valid
// and loaded with those fields `undefined`. App.tsx renders each non-trivial
// phase behind an extra guard (e.g. `phase === 'combat' && combat &&
// currentEnemy`) with no fallback branch, so a save missing the right
// companion field for its phase rendered nothing at all — a blank screen,
// no error. Bumping the version discards those old saves; `isValidRunState`
// below catches the same shape of bug for any future schema drift.
// v3: the intel currency and the info broker were removed — `intel` and
// `shopIntel` no longer exist on RunState, so older saves cannot be resumed.
// v4 (iteration 14): events gained a data-driven option list, a defector
// multi-stage chain (`pendingEventId`), and win-conditional ambush bonuses
// (`pendingAmbushBonus`) — `CurrentEventState` also dropped the unused
// `offeredPartId` field. A v3 save's event shape doesn't match; discard it.
// v5 (iteration 15): `RunState.heat` is a new always-required field (any
// pre-v5 save loads with it `undefined`); `MapNode.cargo` is new but
// optional so it doesn't need its own guard; the repair phase gained a
// *choosing* sub-state (`repairUpgradeOptions` drawn on arrival,
// `repairSummary` only once resolved) that replaces the old "repair always
// means already-resolved" assumption baked into `isValidRunState` below.
// v6 (iteration 47.1.1): the 'setup' phase (a customize-your-flagship
// screen between commander pick and map) was removed on 2026-08-07, but
// this version wasn't bumped at the time — `isValidRunState`'s phase
// switch also fell through to `default: return true`, so a save written
// mid-setup before that removal was accepted as valid and rendered
// nothing (the exact blank-screen bug the v2 postmortem above warns
// about). Bumping discards any lingering pre-removal save; the switch
// below now rejects any phase string it doesn't recognize, not just the
// ones it has a specific companion-field check for, so the next removed
// phase can't reintroduce this.
// v7 (iteration 48, fleet orders): CombatState gained 3 always-read
// fields (`commandPoints`, `exploitEnabled`, `orderThisRound`) and
// RoundModifiers gained 2 more (`bracingShipIndices`, `markedEnemyIndex`)
// — unlike 18/20/21's optional-with-fallback additions (see their notes
// below), these are read unconditionally, some via `.includes()`
// (`fireShip`, `outgoingFirePreview`), which throws outright on
// `undefined` rather than degrading gracefully. `isValidRunState`'s
// combat check is presence-only (`!!state.combat`), so a pre-v7 save
// resumed mid-fight would crash on the very first render, not just on a
// user action — the same "new required-at-read nested field" hazard v5's
// `heat` bump addressed, same fix.
// v8 (iteration 52, typed slots): `Frame.slots`/`maxWeapons` were replaced
// by `Frame.slotLayout` (frames.ts) — a loadout legal under the OLD slot
// count could be illegal under the new typed layout (a Bastion's 2nd
// weapon, say), which would strand that ship's EQUIP/UNEQUIP with no way
// to reach a legal state again. This also frees the 5 legacy frame ids
// (frigate/aegis/tender/ew-cutter/disruptor-cutter) to be repurposed as
// the un-retired Frigate/Aegis/Sloop/Picket/Disruptor without an old save
// resolving its ship against the wrong hull's stats.
// v9 (iteration 63.4, restrictive hulls): the same v8 hazard, again — 9 of
// 18 frames' `slotLayout`s changed shape (universal slots swapped for
// dedicated defense/systems ones on the Flagship and 8 purchasable hulls),
// so a loadout legal under the OLD layout can be illegal under the new one
// (a Flagship carrying 4 mixed universal-slot parts, say — now only 2
// universal slots exist). Also where CombatState gained an always-read
// required field (`flakRemaining` — combatEngine.ts's Reload drones), the
// same "new required-at-read nested field" hazard v7's bump addressed for
// `commandPoints`/etc. — a pre-v9 save resumed mid-fight would have
// `flakRemaining` simply `undefined`, throwing the moment anything read
// `.player`/`.enemy` off it.
export const SAVE_VERSION = 9;
const SAVE_KEY = 'eclipse.save.v1';
// Iteration 18: the daily run gets its own slot so it can coexist with a
// standard run; a small separate record tracks today's attempt + result.
// (No SAVE_VERSION bump for 18: every new RunState field is optional with
// read-site fallbacks — the v2 postmortem's hazard was required-at-render
// fields, which none of these are.)
const DAILY_SAVE_KEY = 'eclipse.save.daily.v1';
const DAILY_RECORD_KEY = 'eclipse.daily.v1';
// Iteration 20 (the economy floor): PlayerShipState's `mercenary` is
// optional with a read-site fallback (a mercenary ship is only ever created
// with the flag set, so its absence just means "not a mercenary," true of
// every pre-20 ship). Same reasoning as 18's no-bump note above: no new
// required-at-render field, so no version bump.
// Iteration 21 (commander doctrines): CommanderId gained a 5th value
// ('admiral') — a string union, not validated by shape here, so an old
// save's 4-value commanderId just keeps working. Two more optional
// PlayerShipState fields: `overRepairBank` (the Engineer) and
// `commodityLotBoughtAtGlobalColumn`, moved here from RunState (where it
// lived as a single scalar in 20) to let the Merchant carry more than one
// lot — both read-site-fallback optional, same story as `mercenary` above.

export type SaveSlot = 'standard' | 'daily';

function slotKey(slot: SaveSlot): string {
  return slot === 'daily' ? DAILY_SAVE_KEY : SAVE_KEY;
}

// One attempt per date: written (date only) when the daily is started —
// starting consumes the attempt — and finalized with outcome + share text
// when the run ends or is abandoned.
export interface DailyRecord {
  date: string; // YYYY-MM-DD
  outcome?: 'victory' | 'defeat' | 'abandoned';
  shareText?: string;
}

interface SaveEnvelope {
  version: number;
  state: RunState;
}

// The subset of the Web Storage API this module needs. Accepting it as a
// parameter (defaulting to the real localStorage) lets tests inject an
// in-memory fake instead of requiring a DOM environment, and lets the app
// degrade gracefully wherever localStorage itself throws just being touched
// (some sandboxed/private-browsing contexts) rather than only on use.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// Never throws — localStorage being unavailable or quota-full (private
// mode) means the run simply proceeds save-less. Returns whether the save
// actually happened, so the caller can show a one-line "saving unavailable"
// banner the first time it fails.
export function saveRun(
  state: RunState,
  storage: StorageLike | null = defaultStorage(),
  slot: SaveSlot = 'standard',
): boolean {
  if (!storage) return false;
  try {
    const envelope: SaveEnvelope = { version: SAVE_VERSION, state };
    storage.setItem(slotKey(slot), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

// Mirrors the extra per-phase guards App.tsx's render checks beyond
// `phase` itself (e.g. `phase === 'combat' && combat && currentEnemy`) —
// those have no fallback branch, so a save whose phase and companion field
// have drifted apart renders nothing. Also checks a few always-required
// fields added to RunState after saving already shipped, so a save from an
// older schema doesn't come back with them silently `undefined`.
function isValidRunState(state: RunState): boolean {
  if (!state || typeof state !== 'object') return false;
  if (typeof state.rngCounter !== 'number') return false;
  if (state.targetingStance !== 'weakest' && state.targetingStance !== 'strongest') return false;
  if (state.act !== 1 && state.act !== 2) return false;
  if (!Array.isArray(state.fleet)) return false;
  if (typeof state.heat !== 'number') return false;
  switch (state.phase) {
    case 'combat':
      return !!state.combat && !!state.currentEnemy;
    case 'reward':
      return !!state.pendingReward;
    case 'shop':
      return !!state.shopOffers;
    // 15.3: a repair-phase save is valid in *either* sub-state — still
    // choosing (repairUpgradeOptions set, repairSummary not yet) or already
    // resolved (repairSummary set too) — as long as the options that were
    // drawn on arrival are present. Requiring only `repairSummary` here (the
    // pre-15.3 check) would reject a legitimate mid-choice save and blank
    // the screen on reload — the exact bug class this function exists to
    // catch.
    case 'repair':
      return Array.isArray(state.repairUpgradeOptions);
    case 'event':
      return !!state.currentEvent;
    // Iteration 24: a flagship-recovery save needs both the offer itself
    // and the phase to resume into once it's resolved — either missing
    // means CONTINUE never actually finished computing the state this save
    // claims to be in.
    case 'flagship-recovery':
      return !!state.pendingFlagshipRecovery && !!state.flagshipRecoveryResumePhase;
    // Iteration 28: a protocol-draft save needs the 3 offers it's supposed
    // to be choosing between — missing means CONTINUE's act-1-boss branch
    // never actually finished computing the state this save claims to be.
    case 'protocol-draft':
      return Array.isArray(state.protocolOffers) && state.protocolOffers.length === 3;
    // Every other phase (map, prep, interlude, victory, defeat, commander)
    // has no extra companion-field requirement of its own. But the switch
    // must still be exhaustive over *known* phases and reject anything
    // else outright (v6) — a phase string that isn't in KNOWN_PHASES is
    // either corrupt data or, as happened with 'setup', a phase that used
    // to exist and no longer does. Falling through to `true` here is
    // exactly the bug the v6 bump above fixes; don't reintroduce it.
    case 'commander':
    case 'map':
    case 'prep':
    case 'interlude':
    case 'victory':
    case 'defeat':
      return true;
    default:
      return false;
  }
}

// Never throws. Returns null on: no storage, no save, corrupt JSON, a
// version mismatch, or a structurally invalid state — every one of those
// cases means "act as if there is no save" (offer only New run).
export function loadRun(
  storage: StorageLike | null = defaultStorage(),
  slot: SaveSlot = 'standard',
): RunState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(slotKey(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveEnvelope>;
    if (parsed.version !== SAVE_VERSION || !parsed.state) return null;
    if (!isValidRunState(parsed.state)) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

export function clearRun(storage: StorageLike | null = defaultStorage(), slot: SaveSlot = 'standard'): void {
  if (!storage) return;
  try {
    storage.removeItem(slotKey(slot));
  } catch {
    // fail soft
  }
}

// --- The daily attempt record (iteration 18) -------------------------------

export function saveDailyRecord(record: DailyRecord, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DAILY_RECORD_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function loadDailyRecord(storage: StorageLike | null = defaultStorage()): DailyRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DAILY_RECORD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DailyRecord>;
    if (typeof parsed.date !== 'string') return null;
    return parsed as DailyRecord;
  } catch {
    return null;
  }
}
