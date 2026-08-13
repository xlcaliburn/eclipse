import type { CommanderId } from './commanders';
import type { PlayerFleetInput } from './combatEngine';
import { frameDisplayName, getFrame } from './frames';
import type { FrameId, SlotKind } from './frames';
import { getPart } from './parts';
import { hasProtocol } from './protocols';
import type { ProtocolId } from './protocols';
import type { PartId, PartType, PlayerShipState, ShipStats } from './types';
import { getUpgrade } from './upgrades';
import type { UpgradeId } from './upgrades';
import { removeOnce } from './util';

// --- Iteration 52.1: typed slots ------------------------------------------
// Which slot kind a given PartType is accepted by. 'cargo' (the commodity
// lot) is deliberately absent — it's universal-only (see countParts below),
// never mapped to a dedicated kind, so it always draws from the shared
// universal pool.
// Iteration 58.2: reactors route into 'systems' — deliberately NOT a
// dedicated 'reactor' slot kind (57's own parenthetical sketched one, but
// that would re-layout all 18 hulls and make a reactor a mandatory fill
// rather than a real choice against computer/drive parts for the same
// socket). A reactor competing with a computer/drive for the same slot is
// exactly the Eclipse tension the user asked for — a reactor is a slot
// that isn't a gun.
const PART_TYPE_SLOT_KIND: Partial<Record<PartType, Exclude<SlotKind, 'universal'>>> = {
  weapon: 'weapon',
  shield: 'defense',
  hull: 'defense',
  computer: 'systems',
  drive: 'systems',
  reactor: 'systems',
};

// Exported for the UI (SlotRow.tsx greedily assigns each equipped part to
// a slot of its own matching kind, for display) — one source of truth with
// the legality math above.
export function slotKindForPartType(type: PartType): SlotKind {
  return PART_TYPE_SLOT_KIND[type] ?? 'universal';
}

interface SlotKindCounts {
  weapon: number;
  defense: number;
  systems: number;
  universal: number;
}

function countSlotLayout(layout: SlotKind[]): SlotKindCounts {
  const counts: SlotKindCounts = { weapon: 0, defense: 0, systems: 0, universal: 0 };
  for (const kind of layout) counts[kind]++;
  return counts;
}

interface PartKindCounts {
  weapon: number;
  defense: number;
  systems: number;
  cargo: number; // universal-only — see PART_TYPE_SLOT_KIND above
}

function countParts(partIds: PartId[]): PartKindCounts {
  const counts: PartKindCounts = { weapon: 0, defense: 0, systems: 0, cargo: 0 };
  for (const id of partIds) {
    const bucket = PART_TYPE_SLOT_KIND[getPart(id).type];
    if (bucket) counts[bucket]++;
    else counts.cargo++;
  }
  return counts;
}

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
  // Iteration 52.3: a frame's own innate trait, if it has one — folded in
  // immediately after the base stats above so parts/upgrades still stack
  // on top of it exactly as before. Formalizes what used to be a one-off
  // hardcoded check here (`if (frameId === 'interceptor') stats.jink =
  // true`) — the Interceptor's `innate` (frames.ts) now expresses the same
  // thing declaratively, the zero-behavior-change proof the pattern works.
  if (frame.innate) Object.assign(stats, frame.innate.grants);

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
      // 61.2: Emergency Vectoring — the combat engine already consumes
      // `jink` (Interceptor/Valkyrie's innate), so this is the entire
      // engine-facing change; the redundancy guard (upgradeRedundantOn,
      // below) is what keeps it from ever landing on a hull that already
      // has jink innately.
      case 'vectoring':
        stats.jink = true;
        break;
      // 'regen' is reducer-level (applied when a reward is computed) — it
      // has no combat-stat effect.
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

// Iteration 23 (Aegis Relay, Piloting harmonic) / 63.1 (Command matrix,
// Vector sync array): a fleet-wide aura part adds its bonus to EVERY
// ship's matching stat, for the whole fight — summed across however many
// are carried (multiple stack). Folded in once here, at fleet-derive
// time, the same place the ace-pilot bonus already folds in — not a live
// combat-engine hook, so it doesn't vanish if the carrier dies mid-fight
// (see iteration-23.md for why that's a deliberate trade; 63.1's two new
// auras follow the identical rule). One shared summer parameterized by
// which Part field to read, rather than three near-identical functions.
function fleetAuraBonus(
  fleet: PlayerShipState[],
  field: 'fleetShieldAura' | 'fleetComputerAura' | 'fleetInitAura',
): number {
  return fleet.reduce((sum, ship) => sum + ship.equipped.reduce((s, id) => s + (getPart(id)[field] ?? 0), 0), 0);
}

export function deriveFleetStats(fleet: PlayerShipState[], commanderId?: CommanderId, protocols?: ProtocolId[]): ShipStats[] {
  const auraShield = fleetAuraBonus(fleet, 'fleetShieldAura');
  // 63.1: the initiative aura folds in HERE (fleet-derive time), not as a
  // separate combat-engine hook — Outspeed qualification and activation
  // order both already read from these derived stats, so a Vector sync
  // array's fleet-wide +1 reaches both automatically, with no engine
  // change of its own.
  const auraComputer = fleetAuraBonus(fleet, 'fleetComputerAura');
  const auraInit = fleetAuraBonus(fleet, 'fleetInitAura');
  return fleet.map((ship) => {
    let stats = withAceBonus(
      deriveStats(ship.frameId, ship.equipped, ship.upgrades, protocols),
      ship,
      commanderId,
      protocols,
    );
    if (auraShield > 0) stats = { ...stats, shield: stats.shield + auraShield };
    if (auraComputer > 0) stats = { ...stats, computer: stats.computer + auraComputer };
    if (auraInit > 0) stats = { ...stats, initiative: stats.initiative + auraInit };
    return stats;
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

// 47.6: moved from reducer.ts. `upgradeCapFor`/`withUpgrade` are needed by
// both the reducer's own non-shop cases (CHOOSE_COMMANDER's Warlord
// bonus, PICK_UPGRADE, INTERLUDE_CHOOSE, REPAIR_CHOOSE's overhaul
// branch) and the new reducer/shop.ts (BUY_UPGRADE) — living here (a
// module both already import from) avoids reducer.ts and reducer/shop.ts
// needing to import from each other for these.
//
// Addendum A.4: a ship holds at most 1 permanent upgrade — a second
// acquisition (elite reward, the interlude's Field promotion, or now a
// repair-yard overhaul) replaces the old one rather than stacking. The old
// one is simply gone (destroyed), same as any upgrade lost with its ship.
//
// Iteration 21 (the Warlord, tall): the Flagship alone may hold more than
// the standard 1. 2026-08-08: 2 -> 3 — the Warlord was reading as just a
// worse Engineer (a discount and a free random upgrade, nothing that
// actually built toward "one hull carrying what used to be spread across a
// fleet"). A fourth pick still replaces rather than being refused outright
// — same "oldest simply gone" rule as the base case, just with room for
// more before it kicks in. `slice(-cap)` keeps only the most recent `cap`
// entries either way, so this one function covers every cap without a
// separate branch. Exported so FleetPanel/FleetOverlay can show exactly
// how many augment slots are still open, not just the ones already filled.
export function upgradeCapFor(ship: PlayerShipState, commanderId: CommanderId | undefined): number {
  return commanderId === 'warlord' && ship.frameId === 'cruiser' ? 3 : 1;
}

// 61.2: the one shared place every 'vectoring' redundancy check goes
// through — jink is a boolean, so granting it a second time (via the
// augment) to a hull whose frame innate already grants it (Interceptor,
// Valkyrie — frames.ts) is a dead pick. Exported so PICK_UPGRADE/
// REPAIR_CHOOSE's overhaul branch (reducer.ts) can reject the dispatch
// outright (a real "invalid pick," same as any other guard in this
// codebase) and the UI target pickers (RewardScreen, RepairScreen) can
// disable the option before it's ever dispatched — same predicate, not
// three reimplementations of "does this frame innately grant jink."
export function upgradeRedundantOn(ship: PlayerShipState, upgradeId: UpgradeId): boolean {
  return upgradeId === 'vectoring' && getFrame(ship.frameId).innate?.grants.jink === true;
}

export function withUpgrade(ship: PlayerShipState, upgradeId: UpgradeId, commanderId?: CommanderId): PlayerShipState {
  // 61.2: a no-op safety net for the withUpgrade paths that draw the
  // upgrade randomly (INTERLUDE_CHOOSE, the Warlord's CHOOSE_COMMANDER
  // pick) rather than the player choosing 'vectoring' outright — those
  // can't "reject the dispatch" the way PICK_UPGRADE/REPAIR_CHOOSE do
  // (the player already committed to a ship, not an upgrade), so the
  // redundant grant is simply skipped rather than applied uselessly.
  if (upgradeRedundantOn(ship, upgradeId)) return ship;
  const cap = upgradeCapFor(ship, commanderId);
  return { ...ship, upgrades: [...ship.upgrades, upgradeId].slice(-cap) };
}

// Iteration 15.3: overhaul is locked out once every ship already carries a
// full complement of upgrades — swapping a player's own earned pick for a
// random one is never the better choice, so the option is withheld rather
// than offered as a trap. "Full complement" is per-ship since iteration 21
// (the Warlord's Flagship holds 2, not 1).
export function everyShipAtUpgradeCap(fleet: PlayerShipState[], commanderId: CommanderId | undefined): boolean {
  return fleet.length > 0 && fleet.every((s) => s.upgrades.length >= upgradeCapFor(s, commanderId));
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
// Iteration 52.1: returns the full typed layout (frame's own slotLayout
// plus one 'universal' per bonus slot) rather than just a count — bonus
// slots have never had a type and don't gain one now, so they're always
// appended as 'universal'. `effectiveSlots` below stays a thin `.length`
// wrapper so every "how many empty slots" call site keeps compiling
// unchanged.
// Iteration 59.3 (hull marks, replacing 52.5's refit): `mark` (2 | 3,
// absent = mark I) adds its own bonus slots on top of bay/Lone-flagship/
// Warlord — `mark - 1` universal slots, so mark II is +1 and mark III is
// +2 (cumulative: going I -> II -> III grants +1 each step). Marks don't
// change frameId, so a marked Flagship stacks with Lone-flagship/Warlord's
// own frameId==='cruiser' bonuses same as any other bonus source here —
// no special-casing needed. Threaded as a trailing optional param (not a
// full ship object) so every existing positional call site keeps compiling
// unchanged; only the few that actually have a marked ship in hand pass it.
export function effectiveSlotLayout(
  frameId: FrameId,
  upgrades: UpgradeId[],
  protocols?: ProtocolId[],
  commanderId?: CommanderId,
  mark?: 2 | 3,
): SlotKind[] {
  const frame = getFrame(frameId);
  const bayCount = upgrades.filter((u) => u === 'bay').length;
  const lonelyFlagshipBonus = frameId === 'cruiser' && hasProtocol(protocols, 'lone-flagship') ? 2 : 0;
  const warlordBonus = frameId === 'cruiser' && commanderId === 'warlord' ? 1 : 0;
  const markBonus = mark ? mark - 1 : 0;
  const bonusSlots = bayCount + lonelyFlagshipBonus + warlordBonus + markBonus;
  return [...frame.slotLayout, ...(Array(bonusSlots).fill('universal') as SlotKind[])];
}

export function effectiveSlots(
  frameId: FrameId,
  upgrades: UpgradeId[],
  protocols?: ProtocolId[],
  commanderId?: CommanderId,
  mark?: 2 | 3,
): number {
  return effectiveSlotLayout(frameId, upgrades, protocols, commanderId, mark).length;
}

// The most weapons a layout can ever carry — its dedicated weapon slots
// plus every universal slot, since universal accepts anything (open
// question #3 in plans/iteration-52.md: a universal-heavy hull can go
// all-weapons by construction; a hull that needs a HARD cap regardless
// needs zero universal slots, same as Bastion above). Exported for UI
// (frame cards can show "up to N weapons") and tests that want to assert
// against the real ceiling instead of a removed `maxWeapons` field.
export function weaponCeiling(layout: SlotKind[]): number {
  return layout.filter((k) => k === 'weapon' || k === 'universal').length;
}

// Iteration 57.2: total power drawn by an equipped set — the sum of each
// part's rarity-derived Part.power (types.ts). Exported for the UI's power
// meter (ship cards) alongside `powerBudget` (58.3) for the budget half of
// "used / budget". Never reaches deriveStats/the combat engine — power is a
// build-time constraint only, same as slot count. Reactors draw 0 (their
// `power` override, parts.ts), so they never count against this sum.
export function equippedPower(equipped: PartId[]): number {
  return equipped.reduce((sum, id) => sum + getPart(id).power, 0);
}

// Iteration 58.3: the portion of a budget contributed by equipped reactors
// specifically — split out from powerBudget below so the UI can show "+N
// from reactors" without re-deriving the frame's own innate number a
// second time (FleetPanel/FleetOverlay/ShipyardMarkSection all want both
// halves separately, not just the sum).
export function equippedPowerGen(equipped: PartId[]): number {
  return equipped.reduce((sum, id) => sum + (getPart(id).powerGen ?? 0), 0);
}

// Iteration 58.3: `frame.power` (innate) is no longer the whole budget —
// equipped reactors add to it. Every budget consumer, build-time gate
// (layoutFeasibility below) and UI display alike, must call this rather
// than reading `getFrame(id).power` directly, or a reactor's grant would
// silently not display/enforce. Deliberately NOT `effectiveSlotLayout`'s
// bonus-slot-aware layout — a bay/Lone-flagship/Warlord bonus slot could
// itself HOLD a reactor (ordinary equip legality), but the bonus slot's
// mere existence grants no power of its own, same asymmetry
// effectiveSlotLayout's own comment already documents for the slot side.
export function powerBudget(frameId: FrameId, equipped: PartId[]): number {
  return getFrame(frameId).power + equippedPowerGen(equipped);
}

interface LayoutFeasibility {
  slotOk: boolean;
  powerOk: boolean;
}

// Shared by layoutCanHold and equipBlockReason below — split into its two
// component checks so equipBlockReason can say WHICH one failed (57.3: "not
// enough power" must be a distinct, stated reason, not folded into the
// slot-layout messaging).
function layoutFeasibility(
  frameId: FrameId,
  equipped: PartId[],
  upgrades: UpgradeId[],
  protocols?: ProtocolId[],
  commanderId?: CommanderId,
  mark?: 2 | 3,
): LayoutFeasibility {
  const slots = countSlotLayout(effectiveSlotLayout(frameId, upgrades, protocols, commanderId, mark));
  const parts = countParts(equipped);
  const overflow =
    Math.max(0, parts.weapon - slots.weapon) +
    Math.max(0, parts.defense - slots.defense) +
    Math.max(0, parts.systems - slots.systems) +
    parts.cargo;
  return {
    slotOk: overflow <= slots.universal,
    // 57.2/58.3: the power budget is the frame's own innate `power` field
    // PLUS whatever's equipped in `equipped` generates (powerBudget) —
    // deliberately NOT effectiveSlotLayout's bonus-slot-inflated layout.
    // Bonus slots (bay upgrades, Lone flagship, Warlord, and — 59.3 — a
    // hull mark) grant room but not generation capacity of their own; see
    // effectiveSlotLayout's own comment for the matching asymmetry on the
    // slot side. Someone will eventually read "a bay upgrade doesn't add
    // power" as a bug — it isn't; a marked-up ship wants a reactor.
    powerOk: equippedPower(equipped) <= powerBudget(frameId, equipped),
  };
}

// Iteration 52.1: the one feasibility predicate every "can this part go on
// this ship" call site now shares — EQUIP (reducer.ts), scripts/sim's
// agent.canFit and budget.hasRoom. Replaces the old pair of checks
// (`equipped.length >= effectiveSlots(...)` and a separate `maxWeapons`
// cap) with the single overflow condition 52.1 derives: each category
// (weapon/defense/systems) maps to its own dedicated slots plus the shared
// universal pool; cargo (the commodity lot) draws from the universal pool
// only, having no dedicated kind of its own.
// Iteration 57.2: also gates on the power budget (layoutFeasibility above)
// — one predicate, both rules, so every call site above picks power up for
// free with no change of its own.
export function canEquip(
  frameId: FrameId,
  equipped: PartId[],
  partId: PartId,
  upgrades: UpgradeId[],
  protocols?: ProtocolId[],
  commanderId?: CommanderId,
  mark?: 2 | 3,
): boolean {
  return layoutCanHold(frameId, [...equipped, partId], upgrades, protocols, commanderId, mark);
}

// Whether a WHOLE equipped set — not one candidate item added to what's
// already there — fits a frame's typed-slot layout all at once. `canEquip`
// above is this with the candidate folded into `equipped` first.
// (52.5's hull refit used to be this function's other direct caller,
// checking a ship's current loadout against a prospective new frame; 59.2
// removed the refit outright, in favor of 59.3's hull marks, which never
// change frameId and so never need this "whole set against a NEW frame"
// check — only canEquip's own single-candidate path.)
export function layoutCanHold(
  frameId: FrameId,
  equipped: PartId[],
  upgrades: UpgradeId[],
  protocols?: ProtocolId[],
  commanderId?: CommanderId,
  mark?: 2 | 3,
): boolean {
  const { slotOk, powerOk } = layoutFeasibility(frameId, equipped, upgrades, protocols, commanderId, mark);
  return slotOk && powerOk;
}

const SLOT_KIND_LABEL: Record<Exclude<SlotKind, 'universal'>, string> = {
  weapon: 'weapon',
  defense: 'defense',
  systems: 'systems',
};

// 52.2: the UI is asked to say WHY a part can't be equipped rather than
// just disabling the control — a dead click is the exact failure mode
// iteration 47.1 already had to fix once (the Lone-flagship slot bug).
// Returns null when the part is actually equippable (canEquip already
// says yes); otherwise a short human reason, cheapest-to-explain first: a
// completely full ship, then "no free slot of this specific kind."
// Iteration 57.3: a THIRD reason, "not enough power" — checked only once
// the slot-layout question is settled, so a part that fails both (rare:
// most out-of-slot parts are also over budget) reports the slot reason,
// same arbitrary-but-deterministic priority the two slot reasons above
// already have between each other.
export function equipBlockReason(
  frameId: FrameId,
  equipped: PartId[],
  partId: PartId,
  upgrades: UpgradeId[],
  protocols?: ProtocolId[],
  commanderId?: CommanderId,
  mark?: 2 | 3,
): string | null {
  if (canEquip(frameId, equipped, partId, upgrades, protocols, commanderId, mark)) return null;
  const { slotOk } = layoutFeasibility(frameId, [...equipped, partId], upgrades, protocols, commanderId, mark);
  if (!slotOk) {
    const layout = effectiveSlotLayout(frameId, upgrades, protocols, commanderId, mark);
    if (equipped.length >= layout.length) return 'Ship is full — no empty slots.';
    const bucket = PART_TYPE_SLOT_KIND[getPart(partId).type];
    const label = bucket ? SLOT_KIND_LABEL[bucket] : 'universal';
    return `No free ${label} slot for this part.`;
  }
  return 'Not enough power for this part.';
}

// Iteration 58.3: the one genuinely new guard — until reactors existed,
// UNEQUIP could never make a ship illegal (removing a part can only free a
// slot and can only reduce draw), so it had no legality check of its own.
// A reactor breaks that: removing IT can shrink the budget out from under
// whatever's still equipped. Slot legality is never a concern on removal
// (freeing a slot can't make a layout MORE illegal), so this only ever has
// to check power, and — since the frame's own innate power never changes —
// this only ever refuses when `partId` is itself a reactor whose gen the
// rest of the loadout was actually relying on.
export function canUnequip(frameId: FrameId, equipped: PartId[], partId: PartId): boolean {
  const remaining = removeOnce(equipped, partId);
  return equippedPower(remaining) <= powerBudget(frameId, remaining);
}

// Same no-dead-click discipline as equipBlockReason — the reducer's UNEQUIP
// refuses silently (a no-op dispatch), so the UI needs its own stated
// reason to avoid a dead click on the unequip control.
export function unequipBlockReason(frameId: FrameId, equipped: PartId[], partId: PartId): string | null {
  if (canUnequip(frameId, equipped, partId)) return null;
  return 'Shut down equipment first — removing this reactor would leave the ship over budget.';
}

export function equippedWeaponCount(equippedPartIds: PartId[]): number {
  return equippedPartIds.filter((id) => Boolean(getPart(id).weapon)).length;
}

// 47.3b: byte-identical copies used to live in RewardScreen.tsx and
// InterludeScreen.tsx (plus a third, twice-inlined, in RepairScreen.tsx) —
// every "attach a permanent upgrade to a ship" picker needs the same
// warning. Addendum A.4: at most 1 permanent upgrade per ship (2026-08-12:
// or 3, for the Warlord's Flagship — upgradeCapFor) — only a pick that
// pushes a ship's own count OVER its own cap replaces (destroys) anything
// (withUpgrade's `.slice(-cap)` only ever evicts once already at cap), so
// say so only then. Bug fixed 2026-08-12: this used to check
// `ship.upgrades.length === 0` regardless of cap — a Warlord's Flagship
// with 1 of 3 augment slots filled was warned "replaces X" for a pick that
// would actually just fill its 2nd slot.
export function shipUpgradeNote(ship: PlayerShipState, commanderId?: CommanderId): string | null {
  const cap = upgradeCapFor(ship, commanderId);
  if (ship.upgrades.length < cap) return null;
  return `replaces ${getUpgrade(ship.upgrades[0]).name}`;
}

export function playerShipLabel(fleet: PlayerShipState[], index: number): string {
  const ship = fleet[index];
  if (!ship) return 'your ship';
  // Iteration 18: named ships ("ISV Resolute"). The frame-#N fallback keeps
  // pre-18 saves (whose ships have no name) rendering exactly as before.
  // 59.3: frameDisplayName, not a bare getFrame(...).name — an unnamed
  // marked ship (rare; almost every fixture/save's ships are named) should
  // still read "Interceptor II #2", not silently drop its mark.
  return ship.name ?? `${frameDisplayName(ship.frameId, ship.mark)} #${index + 1}`;
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

// 2026-08-12: the Flagship must carry at least one computer-type part and
// one hull-type part before the fleet can engage — the same "mandatory
// baseline loadout" idea fleetHasWeapon already enforces fleet-wide,
// scoped to the one ship that's always in the run. It's already
// satisfied from the start (STARTING_LOADOUT is ['ion','ion','comp1',
// 'injector'] — comp1 is a computer part, injector is a hull part) and
// stays satisfied unless the player actively unequips both without
// replacing them, or the Flagship is rebuilt bare after a flagship
// recovery (RESOLVE_FLAGSHIP_RECOVERY — a fresh hull, no loadout).
// Returns null when compliant OR when there's no Flagship in the fleet at
// all (nothing to enforce); otherwise which requirement(s) are missing,
// for the UI to name specifically rather than a generic "can't engage."
export function flagshipMissingRequiredParts(fleet: PlayerShipState[]): 'computer' | 'hull' | 'both' | null {
  const flagship = fleet.find((s) => s.frameId === 'cruiser');
  if (!flagship) return null;
  const hasComputer = flagship.equipped.some((id) => getPart(id).type === 'computer');
  const hasHull = flagship.equipped.some((id) => getPart(id).type === 'hull');
  if (hasComputer && hasHull) return null;
  if (!hasComputer && !hasHull) return 'both';
  return hasComputer ? 'hull' : 'computer';
}

// 2026-08-08: mercenary escorts are hired outside the fleet cap (see
// BUY_MERCENARY) and shouldn't count against it once aboard either — a
// mercenary is a temporary hire, not a commissioned hull. Shared by
// reducer/shop.ts's BUY_SHIP gate and ShopScreen's "fleet full" display so
// the two can't drift out of sync on what counts.
export function commissionedFleetSize(fleet: PlayerShipState[]): number {
  return fleet.filter((s) => !s.mercenary).length;
}
