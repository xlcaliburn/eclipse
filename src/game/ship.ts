import type { CommanderId } from './commanders';
import { getFrame } from './frames';
import type { FrameId } from './frames';
import { getPart } from './parts';
import type { PartId, PlayerShipState, ShipStats } from './types';
import type { UpgradeId } from './upgrades';

// `upgrades` are slotless (elite drops) and fold in on top of frame + parts.
export function deriveStats(frameId: FrameId, equippedPartIds: PartId[], upgrades: UpgradeId[] = []): ShipStats {
  const frame = getFrame(frameId);
  const stats: ShipStats = {
    initiative: frame.baseInitiative,
    hp: frame.baseHp,
    computer: 0,
    shield: 0,
    cannons: [],
    missiles: [],
    shieldPierce: 0,
  };
  // Jink is innate to the Interceptor frame (iteration 8, addendum A.1) —
  // not a part, always present, no button.
  if (frameId === 'interceptor') stats.jink = true;

  for (const id of equippedPartIds) {
    const part = getPart(id);
    if (part.initiative) stats.initiative += part.initiative;
    if (part.hull) stats.hp += part.hull;
    if (part.computer) stats.computer += part.computer;
    if (part.shield) stats.shield += part.shield;
    if (part.flak) stats.flak = (stats.flak ?? 0) + part.flak;
    if (part.taunt) stats.taunt = true;
    if (part.reactiveArmor) stats.reactiveArmor = (stats.reactiveArmor ?? 0) + part.reactiveArmor;
    if (part.onDestroyDamage) stats.onDestroyDamage = (stats.onDestroyDamage ?? 0) + part.onDestroyDamage;
    if (part.ablative) stats.ablative = (stats.ablative ?? 0) + part.ablative;
    if (part.capacitorShield) stats.capacitorShield = (stats.capacitorShield ?? 0) + part.capacitorShield;
    if (part.cloak) stats.cloak = true;
    if (part.active) stats.actives = [...(stats.actives ?? []), part.id];
    if (part.weapon) {
      const entry = {
        diceCount: part.weapon.diceCount,
        damage: part.weapon.damage,
        selfDamageOnNatOne: part.weapon.selfDamageOnNatOne,
        shieldPierce: part.weapon.shieldPierce,
        aoeDamage: part.weapon.aoeDamage,
        targetHighest: part.weapon.targetHighest,
      };
      if (part.weapon.kind === 'cannon') stats.cannons.push(entry);
      else stats.missiles.push(entry);
    }
  }

  for (const upgradeId of upgrades) {
    switch (upgradeId) {
      case 'spine':
        stats.hp += 2;
        break;
      case 'reactor':
        stats.computer += 1;
        break;
      case 'lattice':
        stats.shield += 1;
        break;
      case 'drives':
        stats.initiative += 2;
        break;
      case 'optics':
        stats.shieldPierce = (stats.shieldPierce ?? 0) + 1;
        break;
      case 'autoloader':
        stats.cannons.push({ diceCount: 1, damage: 1 });
        break;
      // 'regen' and 'salvage' are reducer-level (applied when a reward is
      // computed) — they have no combat-stat effect.
      default:
        break;
    }
  }

  return stats;
}

// Iteration 21 (the Admiral, ace pilots): the only other commander-doctrine
// effect that needs to reach derived stats, so deriveFleetStats/
// deriveFleetForCombat below take one shared optional commanderId param
// rather than each doctrine inventing its own.
const ACE_KILL_THRESHOLD = 3;
const ACE_INITIATIVE_BONUS = 1;

// A ship with 3+ kills gains +1 initiative for the Admiral — folded into
// derived stats (not a separate combat-engine hook) so it's automatically
// correct everywhere derived stats already flow: UI display, Outspeed
// qualification, activation order, all from one source of truth.
function withAceBonus(stats: ShipStats, ship: PlayerShipState, commanderId: CommanderId | undefined): ShipStats {
  if (commanderId === 'admiral' && (ship.kills ?? 0) >= ACE_KILL_THRESHOLD) {
    return { ...stats, initiative: stats.initiative + ACE_INITIATIVE_BONUS };
  }
  return stats;
}

export function deriveFleetStats(fleet: PlayerShipState[], commanderId?: CommanderId): ShipStats[] {
  return fleet.map((ship) => withAceBonus(deriveStats(ship.frameId, ship.equipped, ship.upgrades), ship, commanderId));
}

// The shape the combat engine needs: each ship's derived stats plus whatever
// damage it's carrying in from a previous fight (0 for an undamaged ship).
// Also where the Engineer's banked over-repair (ship.overRepairBank) becomes
// real ablative HP for this one fight — reducer.ts's ENGAGE clears the bank
// afterward so it can't carry into a second fight.
export function deriveFleetForCombat(
  fleet: PlayerShipState[],
  commanderId?: CommanderId,
): { stats: ShipStats; initialDamage: number }[] {
  return fleet.map((ship) => {
    const stats = withAceBonus(deriveStats(ship.frameId, ship.equipped, ship.upgrades), ship, commanderId);
    if (ship.overRepairBank) stats.ablative = (stats.ablative ?? 0) + ship.overRepairBank;
    return { stats, initialDamage: ship.damage };
  });
}

// Iteration 21 (the Engineer, over-repair): repairs `amount` on `ship`, and
// if that heals past its actual damage, banks the excess (cap 2 per ship)
// instead of wasting it. A repair-yard full heal has no excess by
// definition (nothing to overheal past) — its caller passes `flatBank:
// true` instead, granting a flat +1 so a yard visit is never a wasted trip
// for the doctrine that's supposed to want repair sources most.
const OVER_REPAIR_CAP = 2;
export function applyRepairBanking(ship: PlayerShipState, amount: number, flatBank = false): PlayerShipState {
  const excess = flatBank ? 1 : Math.max(0, amount - ship.damage);
  const overRepairBank =
    excess > 0 ? Math.min(OVER_REPAIR_CAP, (ship.overRepairBank ?? 0) + excess) : ship.overRepairBank;
  return { ...ship, damage: Math.max(0, ship.damage - amount), overRepairBank };
}

// A slotless expansion bay upgrade pushes a ship's usable slot count past
// its frame's base by 1. Since iteration 8 (addendum A.4) a ship holds at
// most 1 permanent upgrade, so this is now always +0 or +1 — the old hard
// cap at MAX_EFFECTIVE_SLOTS is gone (it would have wrongly clipped a
// Dreadnought-plus-bay).
export function effectiveSlots(frameId: FrameId, upgrades: UpgradeId[]): number {
  const frame = getFrame(frameId);
  const bayCount = upgrades.filter((u) => u === 'bay').length;
  return frame.slots + bayCount;
}

export function equippedWeaponCount(equippedPartIds: PartId[]): number {
  return equippedPartIds.filter((id) => Boolean(getPart(id).weapon)).length;
}

export function playerShipLabel(fleet: PlayerShipState[], index: number): string {
  const ship = fleet[index];
  if (!ship) return 'your ship';
  // Iteration 18: named ships ("ISV Resolute"). The frame-#N fallback keeps
  // pre-18 saves (whose ships have no name) rendering exactly as before.
  return ship.name ?? `${getFrame(ship.frameId).name} #${index + 1}`;
}

export function hasWeapon(stats: ShipStats): boolean {
  return stats.cannons.length > 0 || stats.missiles.length > 0;
}

// The engage guard is fleet-level: a weaponless escort ship is a legal (and
// sometimes smart) meat shield, as long as something in the fleet can shoot.
export function fleetHasWeapon(fleetStats: ShipStats[]): boolean {
  return fleetStats.some(hasWeapon);
}

export function fleetHasOnlyMissiles(fleetStats: ShipStats[]): boolean {
  const anyMissiles = fleetStats.some((s) => s.missiles.length > 0);
  const anyCannons = fleetStats.some((s) => s.cannons.length > 0);
  return anyMissiles && !anyCannons;
}
