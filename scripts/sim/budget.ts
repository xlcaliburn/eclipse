import { getFrame } from '../../src/game/frames';
import type { FrameId } from '../../src/game/frames';
import { getPart, STARTING_LOADOUT } from '../../src/game/parts';
import { effectiveSlots } from '../../src/game/ship';
import type { PartId, PlayerShipState } from '../../src/game/types';

// Iteration 45.1: reference fleets that price themselves off the CURRENT
// catalog instead of being hand-typed snapshots that go stale the moment a
// reprice lands (36's rarity system, 40/41/44's reprice churn, 42/43's new
// arsenal all invalidated the old fixtures silently). `buildFleet(credits,
// archetype)` re-derives every time it's called — a price change is picked
// up automatically, no fixture edit required.
//
// This does NOT model shop rarity odds — it assumes every listed part is
// available to buy, same simplifying assumption the old actRun.ts wishlist
// made. That gap is exactly what the headless agent (agent.ts) exists to
// close for run-level measurement; this stays the fast, no-map-generation
// fixture generator for balance.ts's per-fight matchup table.
export type Archetype = 'balanced' | 'tank-taunt' | 'alpha-missile' | 'outspeed' | 'wide' | 'tall';

// Priority lists, bought in order as credits allow. Long enough (10-12
// items) that a realistic column-9/10 budget exhausts the list rather than
// the other way around; a top-up pass below covers anything left over.
const PRIORITY: Record<Exclude<Archetype, 'wide'>, PartId[]> = {
  balanced: ['hull1', 'shield1', 'plasma', 'comp2', 'hull2', 'shield2', 'plasma', 'comp3', 'antimatter', 'init3'],
  'tank-taunt': ['lure', 'hull2', 'shield2', 'plasma', 'reactive', 'hull2', 'shield2', 'plasma', 'hull3', 'shield3'],
  'alpha-missile': ['missile', 'torpedo', 'flak', 'missile', 'comp2', 'torpedo', 'hull1', 'comp3', 'flak2', 'torpedo'],
  outspeed: ['init3', 'ion', 'comp2', 'init2', 'plasma', 'hull1', 'shield1', 'comp3', 'init2', 'plasma'],
  tall: ['plasma', 'comp2', 'hull2', 'shield1', 'plasma', 'comp3', 'antimatter', 'init3', 'hull3', 'shield2'],
};
// A generic top-up buy once the priority list is exhausted but credits
// remain — a bare ion cannon if a ship still has no weapon, hull plating
// otherwise. Never leaves an affordable, empty slot on the table.
const FILLER: PartId[] = ['ion', 'hull1'];

const CHEAP_ESCORT: Exclude<FrameId, 'cruiser'> = 'interceptor';
const WIDE_FLEET_CAP = 4;
const OTHER_FLEET_CAP = 3; // one Flagship + up to two escorts — 'tall' overrides to 1

function hasRoom(ship: PlayerShipState, partId: PartId): boolean {
  if (ship.equipped.length >= effectiveSlots(ship.frameId, ship.upgrades)) return false;
  const maxWeapons = getFrame(ship.frameId).maxWeapons;
  if (maxWeapons === undefined || !getPart(partId).weapon) return true;
  return ship.equipped.filter((id) => getPart(id).weapon).length < maxWeapons;
}

function newEscort(): PlayerShipState {
  return { frameId: CHEAP_ESCORT, equipped: [], damage: 0, upgrades: [] };
}

export function buildFleet(credits: number, archetype: Archetype): PlayerShipState[] {
  const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [...STARTING_LOADOUT], damage: 0, upgrades: [] }];
  let remaining = credits;

  if (archetype === 'wide') {
    // Width over power: buy cheap escorts up to cap first, THEN spend
    // whatever's left arming everyone with ion cannons.
    while (fleet.length < WIDE_FLEET_CAP && remaining >= getFrame(CHEAP_ESCORT).cost) {
      remaining -= getFrame(CHEAP_ESCORT).cost;
      fleet.push(newEscort());
    }
    let progressed = true;
    while (progressed && remaining >= getPart('ion').cost) {
      progressed = false;
      for (const ship of fleet) {
        if (hasRoom(ship, 'ion') && remaining >= getPart('ion').cost) {
          ship.equipped.push('ion');
          remaining -= getPart('ion').cost;
          progressed = true;
        }
      }
    }
    return fleet;
  }

  const priority = [...PRIORITY[archetype], ...FILLER, ...FILLER, ...FILLER]; // repeat filler so the list never starves early
  const fleetCap = archetype === 'tall' ? 1 : OTHER_FLEET_CAP;
  let wishIndex = 0;

  for (;;) {
    const want = priority[wishIndex];
    if (!want) break; // exhausted even the repeated filler — nothing more usefully buyable
    const openShip = fleet.find((s) => hasRoom(s, want));
    if (!openShip) {
      if (fleet.length >= fleetCap) {
        wishIndex++; // every ship full, no room to grow — skip this item, try the next
        continue;
      }
      const cost = getFrame(CHEAP_ESCORT).cost;
      if (cost > remaining) break; // can't grow the fleet and nothing fits what's already built
      remaining -= cost;
      fleet.push(newEscort());
      continue;
    }
    const cost = getPart(want).cost;
    if (cost > remaining) {
      wishIndex++;
      continue;
    }
    openShip.equipped.push(want);
    remaining -= cost;
    wishIndex++;
  }
  return fleet;
}

// 2026-08-08: `spendSurplusOnFusions` removed — the Foundry (the late-run
// credit sink this spent leftover budget on) was removed from the game
// entirely; there's no longer any way to convert surplus credits into
// extra stats on an already-fully-equipped fleet, so any credits left
// over once `priority`/`FILLER` are exhausted now simply go unspent. A
// real player at that point is in the same position — nothing left to buy
// for a ship that's already full.

// Credits banked by the time a player *arrives* at `col`, assuming a win on
// every combat node on the way and nothing spent — the same optimistic
// ceiling enemyValue.ts's playerBudget already used, generalized to take
// the real reward formula as a parameter instead of hardcoding `4 + col`.
export function creditsBankedByColumn(col: number, winReward: (col: number) => number): number {
  let total = 0;
  for (let c = 0; c < col; c++) total += winReward(c);
  return total;
}
