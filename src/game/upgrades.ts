export type UpgradeId =
  | 'spine'
  | 'reactor'
  | 'lattice'
  | 'drives'
  | 'optics'
  | 'autoloader'
  | 'regen'
  | 'salvage'
  | 'bay';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
}

// Slotless and permanent — attached to a ship (never a frame slot), awarded
// only by elites, lost only if the ship carrying them is destroyed.
export const UPGRADES: Upgrade[] = [
  { id: 'spine', name: 'Reinforced spine', description: '+2 max HP' },
  { id: 'reactor', name: 'Auxiliary reactor', description: '+1 computer' },
  { id: 'lattice', name: 'Deflector lattice', description: '+1 piloting' },
  { id: 'drives', name: 'Overtuned drives', description: '+2 initiative' },
  { id: 'optics', name: 'Piercing optics', description: 'Ignores 1 point of enemy piloting' },
  { id: 'autoloader', name: 'Autoloader', description: '+1 cannon die (1 dmg)' },
  { id: 'regen', name: 'Regenerative plating', description: 'Repairs 1 damage after each fight, win or withdraw' },
  { id: 'salvage', name: 'Salvage rig', description: '+3 credits per combat won' },
  { id: 'bay', name: 'Expansion bay', description: '+1 part slot on this ship (stacks, capped at 8 total)' },
];

const UPGRADES_BY_ID: Record<UpgradeId, Upgrade> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, Upgrade>;

export function getUpgrade(id: UpgradeId): Upgrade {
  const upgrade = UPGRADES_BY_ID[id];
  if (!upgrade) throw new Error(`Unknown upgrade id: ${id}`);
  return upgrade;
}

// Iteration 39: seven of the nine upgrades moved out of the elite/boss
// reward pool entirely — they're now what a purchased hull's rarity tier
// grants instead (reducer.ts's BUY_SHIP; see HULL_BONUS_UPGRADE_POOL
// below). Elites and the act-1 boss draw from just these two now. Both
// pools stay registered in UPGRADES/UPGRADES_BY_ID above (getUpgrade needs
// to resolve an upgrade regardless of which pool it was drawn from) — only
// the DRAW is restricted, not the lookup.
export const ELITE_UPGRADE_POOL: UpgradeId[] = ['optics', 'salvage'];

// The seven relocated here — drawn when a purchased hull's rarity tier
// grants bonus upgrades. Every id besides the two above.
export const HULL_BONUS_UPGRADE_POOL: UpgradeId[] = [
  'spine',
  'reactor',
  'lattice',
  'drives',
  'bay',
  'regen',
  'autoloader',
];

// Draws WITHOUT replacement — a 3-option upgrade pick (the elite reward
// screen, the boss interlude, a repair-yard overhaul) used to roll each
// slot independently from the full 9-entry pool, so the same upgrade could
// (and, ~31% of the time for 3 draws, did) show up twice or three times in
// one draw. Bug report: "giving me multiple of the same options" — a
// screenshot of 3x "Regenerative plating" in one pick. Mirrors
// escalations.ts's drawEscalationSchedule (splice from a copy of the pool).
// `count` is always <= pool.length in practice; the recycle-on-empty guard
// just keeps this correct rather than throwing if that assumption ever
// breaks. `pool` defaults to the full 9 (repair-yard overhauls, the
// shipyard's purchasable upgrade, the Warlord's starting pick all still
// draw from everything) — elite/boss call sites pass ELITE_UPGRADE_POOL
// explicitly (iteration 39), hull purchases pass HULL_BONUS_UPGRADE_POOL.
export function randomUpgradeIds(count: number, rng: () => number, pool: UpgradeId[] = UPGRADES.map((u) => u.id)): UpgradeId[] {
  const source = [...pool];
  const picks: UpgradeId[] = [];
  for (let i = 0; i < count; i++) {
    if (source.length === 0) source.push(...pool); // only reachable if count > pool.length
    const index = Math.floor(rng() * source.length);
    picks.push(source.splice(index, 1)[0]);
  }
  return picks;
}
