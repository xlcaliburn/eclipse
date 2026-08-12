export type UpgradeId = 'spine' | 'reactor' | 'lattice' | 'drives' | 'autoloader' | 'regen' | 'bay' | 'vectoring';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
}

// Slotless and permanent — attached to a ship (never a frame slot), awarded
// only by elites, lost only if the ship carrying them is destroyed.
// 2026-08-07: 'optics' (Piercing optics) and 'salvage' (Salvage rig)
// removed outright — the whole reason ELITE_UPGRADE_POOL used to exist as
// a separate, elite-exclusive pool (see the pre-2026-08-07 history of this
// file) was these two ids; with both gone, elites/boss/hull-purchase
// bonuses all draw from the one remaining 7-entry list again (see
// reducer.ts's call sites — none pass a restricted `pool` any more).
// Any save carrying 'optics'/'salvage' on a ship now has an id
// `getUpgrade` can't resolve — not handled, since this is an early-dev
// project with no save-compatibility guarantee.
export const UPGRADES: Upgrade[] = [
  { id: 'spine', name: 'Reinforced spine', description: '+2 max HP' },
  { id: 'reactor', name: 'Auxiliary reactor', description: '+1 computer' },
  { id: 'lattice', name: 'Deflector lattice', description: '+1 piloting' },
  { id: 'drives', name: 'Overtuned drives', description: '+2 initiative' },
  { id: 'autoloader', name: 'Autoloader', description: '+1 cannon die (1 dmg)' },
  { id: 'regen', name: 'Regenerative plating', description: 'Repairs 1 damage after each fight won' },
  { id: 'bay', name: 'Expansion bay', description: '+1 part slot on this ship (stacks, capped at 8 total)' },
  // 61.2 (user direction): the dodge, standardized into an earnable augment
  // for hulls that don't already have it innately (Interceptor, Valkyrie
  // keep innate Jink verbatim — see frames.ts). Named "Emergency Vectoring"
  // rather than "Evasive Maneuvers" specifically to avoid blurring with the
  // existing Evasive pattern (fleet order), Evasion suite (part), and
  // Evasive doctrine (counter-protocol) — a deliberate naming choice, not
  // an oversight. jink is a boolean (ship.ts's deriveStats upgrade loop),
  // so this is a dead pick on a hull whose frame already grants it —
  // ship.ts's `upgradeRedundantOn` is the one shared guard every
  // withUpgrade call site (and the UI pickers) check against.
  { id: 'vectoring', name: 'Emergency Vectoring', description: 'Once per combat, the first hit that would land on this ship misses instead.' },
];

const UPGRADES_BY_ID: Record<UpgradeId, Upgrade> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, Upgrade>;

export function getUpgrade(id: UpgradeId): Upgrade {
  const upgrade = UPGRADES_BY_ID[id];
  if (!upgrade) throw new Error(`Unknown upgrade id: ${id}`);
  return upgrade;
}

// Draws WITHOUT replacement — a multi-option upgrade pick (the elite
// reward screen, the boss interlude, a repair-yard overhaul) used to roll
// each slot independently from the full pool, so the same upgrade could
// (and, ~31% of the time for 3 draws, did) show up twice or three times in
// one draw. Bug report: "giving me multiple of the same options" — a
// screenshot of 3x "Regenerative plating" in one pick. Mirrors
// escalations.ts's drawEscalationSchedule (splice from a copy of the pool).
// `count` is always <= UPGRADES.length in practice; the recycle-on-empty
// guard just keeps this correct rather than throwing if that assumption
// ever breaks. Draws from every upgrade, unconditionally — iteration 39
// briefly split this into an elite-exclusive pool (ELITE_UPGRADE_POOL) vs.
// a hull-purchase-bonus pool (HULL_BONUS_UPGRADE_POOL), but both constants
// are gone as of 2026-08-07: the only two ids that made the elite pool
// exclusive ('optics', 'salvage') were removed outright, so every call
// site (elite reward, boss interlude, hull-purchase bonus, shipyard
// offer, repair-yard overhaul, the Warlord's starting pick) is back to
// drawing from the same unrestricted list. The `pool` parameter this
// function used to take for that split was dropped in 47.2h — every
// remaining call site passed the same default anyway.
export function randomUpgradeIds(count: number, rng: () => number): UpgradeId[] {
  const pool = UPGRADES.map((u) => u.id);
  const source = [...pool];
  const picks: UpgradeId[] = [];
  for (let i = 0; i < count; i++) {
    if (source.length === 0) source.push(...pool); // only reachable if count > pool.length
    const index = Math.floor(rng() * source.length);
    picks.push(source.splice(index, 1)[0]);
  }
  return picks;
}
