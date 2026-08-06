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
  { id: 'lattice', name: 'Deflector lattice', description: '+1 shield' },
  { id: 'drives', name: 'Overtuned drives', description: '+2 initiative' },
  { id: 'optics', name: 'Piercing optics', description: 'Ignores 1 point of enemy shield' },
  { id: 'autoloader', name: 'Autoloader', description: '+1 cannon die (1 dmg)' },
  { id: 'regen', name: 'Regenerative plating', description: 'Repairs 1 damage after each combat won' },
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

// Draws WITHOUT replacement — a 3-option upgrade pick (the elite reward
// screen, the boss interlude, a repair-yard overhaul) used to roll each
// slot independently from the full 9-entry pool, so the same upgrade could
// (and, ~31% of the time for 3 draws, did) show up twice or three times in
// one draw. Bug report: "giving me multiple of the same options" — a
// screenshot of 3x "Regenerative plating" in one pick. Mirrors
// escalations.ts's drawEscalationSchedule (splice from a copy of the pool).
// `count` is always <= UPGRADES.length in practice (1 or 3 of 9); the
// modulo guard just keeps this correct rather than throwing if that
// assumption ever breaks.
export function randomUpgradeIds(count: number, rng: () => number): UpgradeId[] {
  const pool = [...UPGRADES];
  const picks: UpgradeId[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool.push(...UPGRADES); // only reachable if count > UPGRADES.length
    const index = Math.floor(rng() * pool.length);
    picks.push(pool.splice(index, 1)[0].id);
  }
  return picks;
}
