import type { CommanderId } from './commanders';
import type { PlayerFleetInput } from './combatEngine';
import { getFrame } from './frames';
import type { FrameId } from './frames';
import { getPart } from './parts';
import { hasProtocol } from './protocols';
import type { ProtocolId } from './protocols';
import type { PartId, PlayerShipState, ShipStats } from './types';
import { getUpgrade } from './upgrades';
import type { UpgradeId } from './upgrades';

// `upgrades` are slotless (elite drops) and fold in on top of frame + parts.
// `protocols` (iteration 28) are RunState-level, not per-ship, but two of
// them (Twin-linked mounts, Lone flagship) change a ship's BUILD — its
// weapon list or its frame's own baseline — rather than a live-combat
// modifier, so they fold in here at the same place upgrades do, not as a
// derive-time top-up like the ace/aura bonuses below.
export function deriveStats(
  frameId: FrameId,
  equippedPartIds: PartId[],
  upgrades: UpgradeId[] = [],
  protocols?: ProtocolId[],
  // Iteration 31 (the Foundry): permanent, slotless base-stat increments —
  // structurally the same as `upgrades` above (per-ship additive, folded in
  // once, no live combat-engine hook needed), so it sits as a sibling param
  // rather than a separate derive-time wrapper. A caller with no `ship`
  // object in scope (initial setup, pricing a not-yet-purchased hull) simply
  // omits it — there's no ship to have fused anything into yet.
  fusions?: PlayerShipState['fusions'],
): ShipStats {
  const frame = getFrame(frameId);
  const lonelyFlagship = frameId === 'cruiser' && hasProtocol(protocols, 'lone-flagship');
  const stats: ShipStats = {
    initiative: frame.baseInitiative,
    hp: frame.baseHp + (lonelyFlagship ? 2 : 0),
    computer: 0,
    shield: 0,
    cannons: [],
    missiles: [],
    shieldPierce: 0,
  };
  // Jink is innate to the Interceptor frame (iteration 8, addendum A.1) —
  // not a part, always present, no button.
  if (frameId === 'interceptor') stats.jink = true;

  const twinLinked = hasProtocol(protocols, 'twin-linked-mounts');
  let twinLinkedApplied = false;
  // Iteration 40 (Overcharged rounds): every CANNON die fleet-wide gets the
  // 7-face treatment — missiles are untouched, they already have their own
  // "fires once, no return fire" identity and don't need a second knob.
  const overchargedRounds = hasProtocol(protocols, 'overcharged-rounds');

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
      // Twin-linked mounts (iteration 28): the FIRST weapon this ship
      // equips (in equip order — the same order this loop already walks)
      // fires one extra die. `twinLinkedApplied` guards it to exactly one
      // weapon per ship, not one per weapon part.
      const bonusDie = twinLinked && !twinLinkedApplied;
      if (bonusDie) twinLinkedApplied = true;
      const entry = {
        diceCount: part.weapon.diceCount + (bonusDie ? 1 : 0),
        damage: part.weapon.damage,
        selfDamageOnNatOne: part.weapon.selfDamageOnNatOne,
        shieldPierce: part.weapon.shieldPierce,
        aoeDamage: part.weapon.aoeDamage,
        targetHighest: part.weapon.targetHighest,
        overcharge: part.weapon.overcharge || (overchargedRounds && part.weapon.kind === 'cannon'),
        chipOnMiss: part.weapon.chipOnMiss,
        executeAtHp: part.weapon.executeAtHp,
        cleaveDamage: part.weapon.cleaveDamage,
        bypassTaunt: part.weapon.bypassTaunt,
      };
      if (part.weapon.kind === 'cannon') stats.cannons.push(entry);
      else stats.missiles.push(entry);
    }
  }

  // Bastion doctrine (iteration 28): a static bonus, not a live "currently
  // drawing fire" check — `taunt` itself is a static per-ship flag (from an
  // equipped lure beacon), true for the ship's whole fight, so "+1 shield
  // while taunting" is just "if this ship taunts at all."
  if (stats.taunt && hasProtocol(protocols, 'bastion-doctrine')) stats.shield += 1;
  // Reinforced bulkheads (iteration 28): +1 max HP, every ship, flat.
  if (hasProtocol(protocols, 'reinforced-bulkheads')) stats.hp += 1;

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
      case 'autoloader':
        stats.cannons.push({ diceCount: 1, damage: 1 });
        break;
      // 'regen' is reducer-level (applied when a reward is computed) — it
      // has no combat-stat effect.
      default:
        break;
    }
  }

  // Iteration 31 (the Foundry): pure flat increments, folded in last since
  // they interact with nothing else (no weapon dice, no conditional flags).
  if (fusions) {
    if (fusions.hp) stats.hp += fusions.hp;
    if (fusions.computer) stats.computer += fusions.computer;
    if (fusions.shield) stats.shield += fusions.shield;
    if (fusions.initiative) stats.initiative += fusions.initiative;
  }

  return stats;
}

// Iteration 21 (the Admiral, ace pilots): the only other commander-doctrine
// effect that needs to reach derived stats, so deriveFleetStats/
// deriveFleetForCombat below take one shared optional commanderId param
// rather than each doctrine inventing its own.
const ACE_KILL_THRESHOLD = 3;
const ACE_INITIATIVE_BONUS = 1;

// A ship with 3+ kills gains +1 initiative for the Admiral (or, iteration
// 28, for anyone holding the Ace pipeline protocol — same threshold/bonus,
// generalized off the one commander) — folded into derived stats (not a
// separate combat-engine hook) so it's automatically correct everywhere
// derived stats already flow: UI display, Outspeed qualification,
// activation order, all from one source of truth.
function withAceBonus(
  stats: ShipStats,
  ship: PlayerShipState,
  commanderId: CommanderId | undefined,
  protocols: ProtocolId[] | undefined,
): ShipStats {
  const hasAces = commanderId === 'admiral' || hasProtocol(protocols, 'ace-pipeline');
  if (hasAces && (ship.kills ?? 0) >= ACE_KILL_THRESHOLD) {
    return { ...stats, initiative: stats.initiative + ACE_INITIATIVE_BONUS };
  }
  return stats;
}

// Iteration 23 (Aegis Relay): a shield harmonic anywhere in the fleet adds
// its bonus to EVERY ship's shield, for the whole fight — summed across
// however many are carried (multiple stack). Folded in once here, at
// fleet-derive time, the same place the ace-pilot bonus already folds in —
// not a live combat-engine hook, so it doesn't vanish if the carrier dies
// mid-fight (see iteration-23.md for why that's a deliberate trade).
function fleetShieldAuraBonus(fleet: PlayerShipState[]): number {
  return fleet.reduce(
    (sum, ship) => sum + ship.equipped.reduce((s, id) => s + (getPart(id).fleetShieldAura ?? 0), 0),
    0,
  );
}

export function deriveFleetStats(fleet: PlayerShipState[], commanderId?: CommanderId, protocols?: ProtocolId[]): ShipStats[] {
  const auraShield = fleetShieldAuraBonus(fleet);
  return fleet.map((ship) => {
    const stats = withAceBonus(
      deriveStats(ship.frameId, ship.equipped, ship.upgrades, protocols, ship.fusions),
      ship,
      commanderId,
      protocols,
    );
    return auraShield > 0 ? { ...stats, shield: stats.shield + auraShield } : stats;
  });
}

// The shape the combat engine needs: each ship's derived stats plus whatever
// damage it's carrying in from a previous fight (0 for an undamaged ship).
// Also where the Engineer's banked over-repair (ship.overRepairBank) becomes
// real ablative HP for this one fight — reducer.ts's ENGAGE clears the bank
// afterward so it can't carry into a second fight.
//
// 47.5n: folded onto deriveFleetStats above (the two were the same
// function twice — same fleetShieldAuraBonus + withAceBonus(deriveStats)
// derivation, this one just layers the ablative-bank addition and the
// {stats, initialDamage} wrapper on top). Also switched the aura-shield
// bonus to the same immutable spread deriveFleetStats already used,
// instead of its own in-place `stats.shield +=` mutation — deriveStats
// always returns a fresh object here, so the mutation was never actually
// unsafe, just inconsistent with its sibling. Returns the exported
// PlayerFleetInput shape (combatEngine.ts) instead of restating it.
export function deriveFleetForCombat(
  fleet: PlayerShipState[],
  commanderId?: CommanderId,
  protocols?: ProtocolId[],
): PlayerFleetInput[] {
  return deriveFleetStats(fleet, commanderId, protocols).map((stats, i) => {
    const ship = fleet[i];
    const withBank = ship.overRepairBank ? { ...stats, ablative: (stats.ablative ?? 0) + ship.overRepairBank } : stats;
    return { stats: withBank, initialDamage: ship.damage };
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

// Iteration 31 (the Foundry): total fusion PURCHASES already made on this
// ship, across every stat — each purchase adds exactly +1 to its stat, so
// this is just their sum. Feeds `fusionCost` below, which both ShopScreen
// (display) and scripts/sim/budget.ts (the sim's spender, since iteration
// 45 — actRun.ts's hand-rolled spender was retired) call, so every price
// shown to a player and every price the balance sim pays come from the
// same escalating-cost math.
export function totalFusions(ship: PlayerShipState): number {
  const f = ship.fusions;
  if (!f) return 0;
  return (f.hp ?? 0) + (f.computer ?? 0) + (f.shield ?? 0) + (f.initiative ?? 0);
}

// Iteration 31: escalating Foundry price — STAT_BASE + FUSION_STEP x
// totalFusionsOn(ship), priced per stat's combat weight. Computer highest:
// the `roll + computer - shield >= 6` formula makes it the single
// strongest point in the game (see iteration 26's boss work on how
// steeply win rates move per point of it). Escalation is per-ship and
// per-fusion of ANY stat, not per-stat — the 4th fusion on a hull costs
// +12cr over base regardless of which stat it's spent on, so spreading
// fusions across stats is priced the same as stacking one.
export type FusionStat = 'hp' | 'computer' | 'shield' | 'initiative';
// Exported so ShopScreen can show the base price table even before a part
// and ship are picked (2026-08-08) — the escalating step (FUSION_STEP)
// isn't shown there since it depends on a specific ship's prior fusions.
export const FUSION_STAT_BASE: Record<FusionStat, number> = {
  hp: 6,
  initiative: 7,
  shield: 8,
  computer: 10,
};
const FUSION_STEP = 4;
// `amount` (2026-08-07): a single fuse can now grant more than +1 (fusing
// an owned +2/+3 stat item, not just +1) — priced as `amount` separate
// fusions back to back, each paying the escalating rate at its own point
// in the sequence, so fusing a +3 part costs exactly what three +1
// fusions in a row would have. Preserves the existing "spreading vs.
// stacking is priced the same" invariant above at any amount.
export function fusionCost(stat: FusionStat, ship: PlayerShipState, amount = 1): number {
  const base = FUSION_STAT_BASE[stat];
  const priorTotal = totalFusions(ship);
  let cost = 0;
  for (let i = 0; i < amount; i++) {
    cost += base + FUSION_STEP * (priorTotal + i);
  }
  return cost;
}

// 2026-08-07 (Foundry rework): fusing now consumes an OWNED part instead
// of being a pure credit purchase — "fuse the item you own," not a
// straight upgrade. Only the stat-item ladder qualifies (iteration 36's
// +1/+2/+3 hull/computer/shield/initiative parts) — each maps 1:1 onto a
// FusionStat and an amount, reusing the part's own stat value rather than
// inventing a separate conversion formula. The credit cost above still
// applies on top (see fusionCost) — owning the part is an additional
// cost, not a replacement for the escalating price.
export const FUSABLE_PARTS: Partial<Record<PartId, { stat: FusionStat; amount: number }>> = {
  hull1: { stat: 'hp', amount: 1 },
  hull2: { stat: 'hp', amount: 2 },
  hull3: { stat: 'hp', amount: 3 },
  comp1: { stat: 'computer', amount: 1 },
  comp2: { stat: 'computer', amount: 2 },
  comp3: { stat: 'computer', amount: 3 },
  shield1: { stat: 'shield', amount: 1 },
  shield2: { stat: 'shield', amount: 2 },
  shield3: { stat: 'shield', amount: 3 },
  init1: { stat: 'initiative', amount: 1 },
  init2: { stat: 'initiative', amount: 2 },
  init3: { stat: 'initiative', amount: 3 },
};

// A short "Fused: +2 HP · +1 COMP" line for FleetPanel/FleetOverlay — same
// visual weight as the upgrade badges next to it. The stats themselves
// already read correctly via deriveStats; this just explains WHY the
// numbers beat the parts list. Null (not rendered) when nothing's fused.
export const FUSION_STAT_ABBR: Record<FusionStat, string> = { hp: 'HP', computer: 'COMP', shield: 'PLT', initiative: 'INIT' };
export const FUSION_STAT_ORDER: FusionStat[] = ['hp', 'computer', 'shield', 'initiative'];
export function fusionSummary(fusions: PlayerShipState['fusions']): string | null {
  if (!fusions) return null;
  const parts = FUSION_STAT_ORDER.filter((stat) => fusions[stat]).map((stat) => `+${fusions[stat]} ${FUSION_STAT_ABBR[stat]}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

// 47.3f: the plain-text "HP x/y · Init … · Comp … · Piloting …" line —
// FleetOverlay and CommanderSelectScreen each hand-wrote this (including
// the "Piloting" display rename off `shield`, iteration 29). Not `<StatBar>`
// (which also renders HP pips and a weapon-dice row — a real visual change
// these two plain-text screens never had) — just the string both of them
// already produced. `damage` is optional: omitted, the line shows a bare
// max HP (CommanderSelectScreen's always-fresh starting-ship preview);
// provided, it shows "current/max" (FleetOverlay's real fleet snapshot).
export function formatStatLine(stats: ShipStats, damage?: number): string {
  const hp = damage === undefined ? `${stats.hp}` : `${Math.max(0, stats.hp - damage)}/${stats.hp}`;
  return `HP ${hp} · Init ${stats.initiative} · Comp ${stats.computer} · Piloting ${stats.shield}`;
}

// A slotless expansion bay upgrade pushes a ship's usable slot count past
// its frame's base by 1. Since iteration 8 (addendum A.4) a ship holds at
// most 1 permanent upgrade, so this is now always +0 or +1 — the old hard
// cap at MAX_EFFECTIVE_SLOTS is gone (it would have wrongly clipped a
// Dreadnought-plus-bay). Iteration 28: Lone flagship adds a further +2,
// Flagship (cruiser frame) only — its whole point is one hull carrying
// what used to be spread across a fleet.
// 2026-08-08 (Warlord rework): +1 further slot, Flagship only, for the
// Warlord specifically — their whole doctrine is one hull built up past
// what a single ship should carry, so it needed a build-space bonus of its
// own alongside the bigger augment cap below, not just a discount and a
// free starting upgrade.
export function effectiveSlots(
  frameId: FrameId,
  upgrades: UpgradeId[],
  protocols?: ProtocolId[],
  commanderId?: CommanderId,
): number {
  const frame = getFrame(frameId);
  const bayCount = upgrades.filter((u) => u === 'bay').length;
  const lonelyFlagshipBonus = frameId === 'cruiser' && hasProtocol(protocols, 'lone-flagship') ? 2 : 0;
  const warlordBonus = frameId === 'cruiser' && commanderId === 'warlord' ? 1 : 0;
  return frame.slots + bayCount + lonelyFlagshipBonus + warlordBonus;
}

export function equippedWeaponCount(equippedPartIds: PartId[]): number {
  return equippedPartIds.filter((id) => Boolean(getPart(id).weapon)).length;
}

// 47.3b: byte-identical copies used to live in RewardScreen.tsx and
// InterludeScreen.tsx (plus a third, twice-inlined, in RepairScreen.tsx) —
// every "attach a permanent upgrade to a ship" picker needs the same
// warning. Addendum A.4: at most 1 permanent upgrade per ship — a second
// pick replaces (destroys) the first, so say so before the click confirms
// it.
export function shipUpgradeNote(ship: PlayerShipState): string | null {
  if (ship.upgrades.length === 0) return null;
  return `replaces ${getUpgrade(ship.upgrades[0]).name}`;
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
