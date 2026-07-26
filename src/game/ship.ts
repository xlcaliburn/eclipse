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

export function deriveFleetStats(fleet: PlayerShipState[]): ShipStats[] {
  return fleet.map((ship) => deriveStats(ship.frameId, ship.equipped, ship.upgrades));
}

// The shape the combat engine needs: each ship's derived stats plus whatever
// damage it's carrying in from a previous fight (0 for an undamaged ship).
export function deriveFleetForCombat(fleet: PlayerShipState[]): { stats: ShipStats; initialDamage: number }[] {
  return fleet.map((ship) => ({
    stats: deriveStats(ship.frameId, ship.equipped, ship.upgrades),
    initialDamage: ship.damage,
  }));
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
  return `${getFrame(ship.frameId).name} #${index + 1}`;
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
