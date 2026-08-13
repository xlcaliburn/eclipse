// 47.6: reducer.ts split — the shop cases (BUY_PART through LEAVE_SHOP)
// plus the pricing/pool/rarity helpers they alone use, extracted into
// their own module per plans/iteration-47.md's 47.6. reducer.ts keeps the
// RunAction union, initialRunState, the rng helpers, and the main switch;
// this file owns everything that's genuinely shop-only. Two exceptions
// the plan itself calls out — `drawShopOffers`/`drawFrameOffers` (called
// from PICK_NODE when a shop/shipyard node is entered) and
// `hullScrapValue` (called from PROTOCOL_CHOOSE's Lone flagship pick) —
// stay here (their logic IS shop pricing/drawing) and reducer.ts imports
// them back; that's a one-directional import (reducer.ts -> this file),
// never the reverse, so there's no real circularity. `runRng` (rng.ts,
// 47.6) and `withUpgrade`/`upgradeCapFor` (ship.ts, 47.6) were moved to a
// shared module for the same reason — reducer.ts's own non-shop cases need
// them too, and neither module should import from the other.
//
// Every external consumer that used to import these names from
// '../game/reducer' (ShopScreen.tsx and its StoreSections/
// ShipyardSections split, scripts/sim/agent.ts, reducer.test.ts, ...)
// keeps working unchanged — reducer.ts re-exports everything below that
// had an external consumer. No file outside reducer.ts/reducer/shop.ts
// needed to change.

import type { CommanderId } from '../commanders';
import { getFrame, MAX_FLEET_SIZE, PURCHASABLE_FRAME_IDS } from '../frames';
import type { FrameId } from '../frames';
import { globalColumn } from '../map';
import { COMMODITY_LOT_PART_ID, getPart, isSalvageablePart, PARTS } from '../parts';
import { hasProtocol } from '../protocols';
import type { ProtocolId } from '../protocols';
import type { RngFn } from '../rng';
import type { RunAction } from '../reducer';
import { commissionedFleetSize } from '../ship';
import { shipName } from '../shipNames';
import type { PartId, PlayerShipState, Rarity, RunState } from '../types';
import { mapShip, removeOnce } from '../util';

// Iteration 41: 6 -> 8 — one more weapon slot, one more defense slot, to
// match the roster's own growth (light-missile joining the weapon pool,
// etc.) without either category crowding out the other.
export const SHOP_OFFER_COUNT = 8;

// A purchased ship arrives pre-fitted with a small stat loadout — never an
// identity part. Iteration 36: hulls stopped bundling a specific part
// (Bastion's lure beacon, the support hulls' signature actives) as their
// whole role — identity now lives entirely on the part, which any hull can
// carry. What's left here is pure "arrives combat-ready" QoL: an
// Interceptor with a light missile, a Dreadnought/Cruiser with a fuller
// starting fit matching their frames.ts blurb.
// Iteration 41: every purchasable hull now arrives with at least one
// weapon — an unarmed ship in the shop read wrong, however cheap.
// 61.3 (user direction): standardized on ion as the default weapon —
// "everything should default to ion, however the speed-biased ships like
// interceptor should be missile based." Speed-biased = baseInitiative >= 2
// (frames.ts): Interceptor (2), Destroyer (3), Valkyrie (4) carry
// light-missile; every other hull, including the Corvette (init 1 — its
// capacitor innate is evasion flavor, not speed, a judgment call recorded
// in plans/iteration-61.md), carries ion. Frame prices are the single
// source of truth for what a starting fit is "worth" — see frames.ts's own
// per-frame reprice notes; 61.3 made no repricing changes (ion 3cr vs.
// light-missile 2cr is within noise).
// Exported so ShopScreen's frame cards can preview what a hull arrives
// fitted with — see the "Expand your fleet" section, iteration 41.
export const STARTING_FIT: Record<Exclude<FrameId, 'cruiser'>, PartId[]> = {
  interceptor: ['light-missile'],
  bastion: ['ion'],
  dreadnought: ['ion', 'ion', 'shield1'],
  // 2026-08-06 (the same midrange-progression repricing): now arrives with
  // Gauss coils alongside its ion cannon — a real starting stat, not just
  // a bare identity part, matching the Dreadnought's fuller fit above.
  'light-cruiser': ['ion', 'shield1'],
  // 2026-08-13: was ['ion'] — frames.ts dropped Freighter's dedicated
  // weapon slot and its price along with it (see that file's freighter
  // comment); it now arrives genuinely unarmed rather than pre-fitted, the
  // player fits it themselves via a universal slot if they want a gun on it.
  freighter: [],
  derelict: ['ion'],
  corvette: ['ion'],
  // Iteration 52 STAGE (b): the 10 new/revived purchasable hulls' arrival
  // fits — every one legal against its own frame's slotLayout (see the
  // guard test in ship.test.ts).
  frigate: ['ion'],
  // No dedicated weapon slot (S S U) — the weapon rides in the universal
  // slot, same pattern as Derelict/Corvette above.
  'ew-cutter': ['ion'],
  tender: ['ion'],
  'disruptor-cutter': ['ion'],
  aegis: ['ion', 'shield1'],
  gunboat: ['ion'],
  destroyer: ['light-missile'],
  battleship: ['ion'],
  valkyrie: ['light-missile'],
  titan: ['ion', 'ion', 'shield1'],
};

// Iteration 20 (commodity runs): buy low at one shop, sell high at any
// later one. The +5cr spread is the reward; the risk is the slot it ties up
// for however many columns pass in between, and that it's lost outright if
// the carrying ship is. The sell price never varies by commander — only the
// Merchant's buy side and capacity change (iteration 21).
export const COMMODITY_LOT_SELL_PRICE = 9;
const BASE_COMMODITY_LOT_BUY_COST = 4;
const MERCHANT_COMMODITY_LOT_BUY_COST = 3;
export function commodityLotBuyCost(commanderId: CommanderId | undefined): number {
  return commanderId === 'merchant' ? MERCHANT_COMMODITY_LOT_BUY_COST : BASE_COMMODITY_LOT_BUY_COST;
}
// 2026-08-06: shop-bought repairs — a credit sink for late-run wealth with
// nowhere else to go, same reasoning as the Foundry idea but far simpler:
// straight HP, no permanence, no build implications. Priced per point so a
// ship sitting on 1 damage costs the same 2cr/HP as one sitting on 6 —
// no flat "repair visit" fee to make topping off a scratch not worth it.
export const REPAIR_COST_PER_HP = 2;
const BASE_COMMODITY_LOT_CAP = 1;
// 2026-08-06: was 2 — a doubled cap on top of the Merchant's already-cheaper
// buy price didn't just add a bigger margin, it doubled the whole arbitrage
// loop (buy low, ride a column, sell high, repeat every visit), and that
// compounds hard across a full run. Capped back to the same 1 lot everyone
// else gets; the cheaper buy-in (still 3cr vs 4cr) is enough on its own to
// read as "better prices" without turning into a second income stream.
const MERCHANT_COMMODITY_LOT_CAP = 1;
export function commodityLotCap(commanderId: CommanderId | undefined): number {
  return commanderId === 'merchant' ? MERCHANT_COMMODITY_LOT_CAP : BASE_COMMODITY_LOT_CAP;
}

// Re-priced 2026-08-04: originally priced ABOVE a real Interceptor (the
// stated reasoning was that a one-fight rental "costs nothing but credits"
// and should pay a premium for that) — but a permanent Interceptor is 6cr
// and strictly more ship for the money (unlimited fights, can be equipped
// and carried forward) than a one-fight rental, so charging more for less
// never made sense. Priced below the permanent frame instead, same
// buy-power-cheap logic as the rest of the Merchant's kit.
const BASE_MERCENARY_COST = 5;
const MERCHANT_MERCENARY_COST = 3;
export function mercenaryCost(commanderId: CommanderId | undefined): number {
  return commanderId === 'merchant' ? MERCHANT_MERCENARY_COST : BASE_MERCENARY_COST;
}
const MERCENARY_SHIP_NAME = 'Mercenary escort';
// Exported so ShopScreen can preview what the hire actually arrives
// fitted with (weapon + dice) — one source of truth, not a hardcoded
// ['ion'] duplicated into the UI.
export const MERCENARY_FIT: PartId[] = ['ion'];

// Iteration 21 (the Admiral, wide): fleet cap 5 instead of the standard 4.
// Iteration 28: two prismatic protocols change this further — Armada
// mandate (+2, its whole benefit) and Lone flagship (hard-set to 1, its
// whole cost). Lone flagship wins if somehow both are ever held (not
// currently reachable — only one prismatic can be drafted per run — but
// this is the sane precedence if that ever changes: the protocol whose
// entire premise is "exactly one ship" should never be silently
// overridden by a flat +2).
const ADMIRAL_FLEET_CAP = 5;
const ARMADA_MANDATE_BONUS = 2;
const LONE_FLAGSHIP_CAP = 1;
// Iteration 56.1: `bonusBerths` is RunState.bonusFleetBerths (events.ts's
// naval-yard purchase or derelict-flotilla's win-conditional unlock),
// threaded through by every call site — defaults to 0 so every pre-56
// caller (most of reducer.test.ts) keeps compiling unchanged. Added AFTER
// the Lone flagship early return, never before it: that protocol's whole
// premise is "exactly one ship", so a berth bought earlier in the run must
// not silently undo it. It composes with (not overrides) the Admiral base
// and the Armada mandate bonus, same as those two already compose with
// each other.
export function fleetCap(commanderId: CommanderId | undefined, protocols?: ProtocolId[], bonusBerths = 0): number {
  if (hasProtocol(protocols, 'lone-flagship')) return LONE_FLAGSHIP_CAP;
  const base = commanderId === 'admiral' ? ADMIRAL_FLEET_CAP : MAX_FLEET_SIZE;
  return base + (hasProtocol(protocols, 'armada-mandate') ? ARMADA_MANDATE_BONUS : 0) + bonusBerths;
}

// Iteration 21: purchasable-frame pricing for the two ship-doctrine
// commanders. The Admiral (wide) discounts every frame 25%, rounded down —
// a general shopping discount, since the doctrine is "many cheap hulls."
// The Warlord (tall) discounts only the Dreadnought, flatly — the whole
// doctrine is "one specific ship," not a general one. The two commanders
// are mutually exclusive within a run, so there's no stacking case to
// resolve. The Flagship is never purchasable, so it never reaches this.
const ADMIRAL_FRAME_MULTIPLIER = 0.75; // 25% off
const WARLORD_DREADNOUGHT_DISCOUNT = 5;
// Iteration 28 (Armada mandate): a further 50% off every purchasable
// frame, stacking multiplicatively after any commander discount already
// applied (same "rounds in the player's favor, final price floored"
// discipline as the Admiral's own multiplier below).
const ARMADA_MANDATE_FRAME_MULTIPLIER = 0.5;
// Iteration 33 (2026-08-07): the general store's hull rack is second-hand —
// stacks on top of any commander/protocol discount already applied, same
// "layer on top, floor at the end" discipline as armada-mandate above.
// `shopKind` is optional so call sites that don't care about store vs.
// shipyard (several reducer.test.ts cases) keep compiling unchanged.
const SECOND_HAND_MULTIPLIER = 0.75;
export function frameCost(
  baseCost: number,
  frameId: FrameId,
  commanderId: CommanderId | undefined,
  protocols?: ProtocolId[],
  shopKind?: 'store' | 'shipyard',
): number {
  // Rounds the FINAL price down (not the discount amount down before
  // subtracting) — Math.floor(cost * 0.75), not cost - Math.floor(cost *
  // 0.25). The two differ whenever cost is odd (6cr: 4cr either way is
  // fine, but 7cr gives 5cr vs. 6cr) and "rounds in the player's favor" is
  // the more natural reading of a discount, so this is deliberate.
  let cost = baseCost;
  if (commanderId === 'admiral') cost = Math.floor(cost * ADMIRAL_FRAME_MULTIPLIER);
  else if (commanderId === 'warlord' && frameId === 'dreadnought') cost = Math.max(0, cost - WARLORD_DREADNOUGHT_DISCOUNT);
  if (hasProtocol(protocols, 'armada-mandate')) cost = Math.floor(cost * ARMADA_MANDATE_FRAME_MULTIPLIER);
  if (shopKind === 'store') cost = Math.floor(cost * SECOND_HAND_MULTIPLIER);
  return cost;
}

// Iteration 7: a flat uniform draw over ~30 parts can no longer reliably
// surface an answer to a given threat. The 6 offers are drawn stratified
// instead — 2 weapons, 2 defense (shield/hull), 1 computer-or-drive, 1
// active part — uniform within each stratum. All six offers are unique
// (2026-08-02): a duplicate wastes a slot, and the actives stratum overlaps
// the typed ones (every active part also has a type), so cross-slot
// duplicates were possible too, not just the double weapon/defense draws.
const WEAPON_POOL = PARTS.filter((p) => p.type === 'weapon');
const DEFENSE_POOL = PARTS.filter((p) => p.type === 'shield' || p.type === 'hull');
// Iteration 58.4: reactors join the computer/drive stratum (renamed from
// COMPUTER_DRIVE_POOL) — that slot is 1-of-8 shop offers, unchanged this
// iteration (58.4's own "do NOT change stratum counts" instruction); how
// often that's enough exposure for a reactor specifically is 58's own open
// question #1, not something to fix here.
const SYSTEMS_POOL = PARTS.filter((p) => p.type === 'computer' || p.type === 'drive' || p.type === 'reactor');
const ACTIVE_POOL = PARTS.filter((p) => p.active);

// Iteration 36 (rarity): shop odds per offer slot — legendary finds are
// meant to be rare enough to feel like an event, common ones fill most of
// the catalog. Sums to 1.
const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 0.73,
  rare: 0.2,
  epic: 0.05,
  legendary: 0.02,
};
// Ordered low -> high; index doubles as "distance from common" for the
// fallback walk below. Exported for drawRarityWeighted's tier-walk tests.
export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

// Exported for a direct unit test of the tier-boundary math (same
// discipline as applyCargoReward's export in reducer.ts) — the
// reducer-level integration tests can't cheaply pin an exact rng value
// mid-draw.
export function rollRarity(rng: RngFn): Rarity {
  const roll = rng();
  let cumulative = 0;
  for (const tier of RARITY_ORDER) {
    cumulative += RARITY_WEIGHTS[tier];
    if (roll < cumulative) return tier;
  }
  return 'legendary'; // floating-point guard — cumulative should hit 1 exactly
}

// The single draw every shop offer slot (part or hull) goes through: roll a
// tier by RARITY_WEIGHTS, then draw uniformly from (pool ∩ that tier ∖
// taken). If that's empty — the tier's exhausted, or nothing of that tier
// exists in this particular type-filtered pool — fall back one tier at a
// time toward common, then walk back up past the rolled tier toward
// legendary. The slot always fills as long as the pool itself isn't fully
// taken (every real call site has far more candidates than offer slots).
// 47.5l: generic over the id type itself (was `T extends {id: string}`,
// returning bare `string` — every call site cast the result back to
// PartId/FrameId by hand, including one genuinely unsound
// `as Exclude<FrameId, 'cruiser'>` that the compiler had no way to verify).
// `Id` is inferred from the pool's own element type, so a pool whose `.id`
// is already narrowed (Part['id']: PartId since 47.5k) returns that exact
// type with no cast at all.
function drawRarityWeighted<Id extends string, T extends { id: Id; rarity: Rarity }>(
  pool: T[],
  taken: Set<Id>,
  rng: RngFn,
): Id {
  const rolledIndex = RARITY_ORDER.indexOf(rollRarity(rng));
  const tryOrder = [0, -1, -2, -3, 1, 2, 3].map((offset) => rolledIndex + offset);
  for (const idx of tryOrder) {
    if (idx < 0 || idx >= RARITY_ORDER.length) continue;
    const tier = RARITY_ORDER[idx];
    const candidates = pool.filter((p) => p.rarity === tier && !taken.has(p.id));
    if (candidates.length === 0) continue;
    const id = candidates[Math.floor(rng() * candidates.length)].id;
    taken.add(id);
    return id;
  }
  // Defensive only: every tier (including cross-tier) came up empty, which
  // means the whole pool is already taken. Never crash a shop draw over it.
  const fallback = pool.find((p) => !taken.has(p.id)) ?? pool[0];
  taken.add(fallback.id);
  return fallback.id;
}

// Iteration 21 (signature stock): each commander always finds their
// signature part in stock, at a discount — a cheap alternative to true
// exclusive item pools (a much bigger content/balance surface). No entry
// for the Merchant: 21.2 covers their doctrine entirely via the commodity
// lot (already guaranteed by commodityLotCap/commodityLotBuyCost) and the
// mercenary discount, with no additional part.
const SIGNATURE_PART: Partial<Record<CommanderId, PartId>> = {
  engineer: 'dcbay',
  spymaster: 'cloak',
  warlord: 'siege',
  admiral: 'uplink2',
};
const SIGNATURE_DISCOUNT = 2;

// The offer slot a signature part is force-inserted into if the normal
// stratified draw didn't already surface it — matched to the part's own
// type so a guaranteed slot never distorts the offer's usual balance (one
// weapon slot, one defense slot, etc. either way). Index into the fixed
// 8-slot layout drawShopOffers builds below (iteration 41: 3 weapon / 3
// defense / 1 computer-drive / 1 active).
const SIGNATURE_SLOT: Partial<Record<CommanderId, number>> = {
  engineer: 7, // dcbay: hull + active -> the active slot
  spymaster: 3, // cloak: shield -> the first defense slot
  warlord: 0, // siege: weapon -> the first weapon slot
  admiral: 6, // uplink2: computer + active -> the computer/drive slot
};

// Iteration 28 (Munitions contracts): a flat -2cr on every part in every
// shop, floored at 1cr (never free) — stacks with the signature discount
// above (both are flat, so they simply add).
const MUNITIONS_CONTRACTS_DISCOUNT = 2;
export function partCost(partId: PartId, commanderId: CommanderId | undefined, protocols?: ProtocolId[]): number {
  let cost = getPart(partId).cost;
  if (commanderId && SIGNATURE_PART[commanderId] === partId) cost -= SIGNATURE_DISCOUNT;
  if (hasProtocol(protocols, 'munitions-contracts')) cost -= MUNITIONS_CONTRACTS_DISCOUNT;
  return Math.max(1, cost);
}

// 47.5f: half a part's LIST price (not partCost's discounted price — a
// sell isn't a purchase), floored. Exported so FleetPanel's sell-price
// preview reads from the exact same number SELL_PART actually pays,
// same "one source of truth" reasoning MERCENARY_FIT was exported for.
export function partSellPrice(partId: PartId): number {
  return Math.floor(getPart(partId).cost / 2);
}

// 47.5f: same halving rule as partSellPrice, for a whole hull — currently
// only PROTOCOL_CHOOSE's Lone flagship pick (scrapping every escort) —
// reducer.ts imports this back for that one non-shop case.
export function hullScrapValue(frameId: FrameId): number {
  return Math.floor(getFrame(frameId).cost / 2);
}

// Iteration 59.2: 52.5's hull refit (a shipyard trade-up into a bigger
// frame) is REMOVED — `canRefit`/`refitCost` and the REFIT_SHIP action are
// gone outright, superseded by 59.3's hull marks below (see PLAN.md's
// iteration-52 row for the pointer). Hull progression without a refit is
// "buy the bigger hull" (shipyards now stock rare-or-better, 59.1) or
// scuttle-and-replace; marks are for deepening a ship you're keeping.

// Iteration 59.3 (hull marks, Twilight-Imperium style — replaces the
// refit): a ship's mark (types.ts's PlayerShipState.mark, absent = I) can
// be upgraded I -> II -> III at a shipyard, each step granting +1
// universal slot (ship.ts's effectiveSlotLayout) for a price escalating
// off the frame's own (commander-discounted) cost. No `shopKind` param —
// unlike the old refit's `frameCost` call, a mark upgrade is ALWAYS a
// shipyard action (canUpgradeMark below enforces it), so the store's
// second-hand multiplier can never apply here, full stop.
const MARK_II_MULTIPLIER = 0.5;
const MARK_III_MULTIPLIER = 0.75;
export function markUpgradeCost(
  frameId: FrameId,
  targetMark: 2 | 3,
  commanderId?: CommanderId,
  protocols?: ProtocolId[],
): number {
  const discounted = frameCost(getFrame(frameId).cost, frameId, commanderId, protocols);
  const multiplier = targetMark === 2 ? MARK_II_MULTIPLIER : MARK_III_MULTIPLIER;
  return Math.ceil(discounted * multiplier);
}

// Every rule a legal mark upgrade must hold: a SHIPYARD visit specifically
// (marks are a shipyard-only purchase, same "trade a ship up" identity the
// refit had), not a mercenary (a one-fight rental takes no permanent
// investment, the standing rule every other permanent upgrade already
// follows), and not already at the mark III cap. Unlike the old refit's
// canRefit, there is no Flagship ban and no shopFrameOffers/rarity gate —
// a mark isn't a hull PURCHASE (frameId never changes, so none of the
// invariants that forbade refitting the Flagship apply — see
// withFlagshipRecoveryGate/Lone flagship/SCUTTLE_SHIP's own comments,
// none of which this touches), and it isn't drawn from a limited-stock
// offer list the way a fresh hull or a refit target was.
export function canUpgradeMark(shopKind: 'store' | 'shipyard' | undefined, ship: PlayerShipState): boolean {
  if (shopKind !== 'shipyard') return false;
  if (ship.mercenary) return false;
  return (ship.mark ?? 1) < 3;
}

// Iteration 28 (Armada mandate): shops stock one fewer part — the offer's
// last slot (the active-part slot) is dropped. That slot is also where the
// Engineer's signature part (dcbay) gets force-inserted (see SIGNATURE_SLOT
// above); with Armada mandate active, that insertion simply has nowhere to
// land and is skipped — a deliberate, documented overlap between two
// separate systems, not a bug.
// Iteration 41: 8 slots — 3 weapon / 3 defense / 1 computer-drive / 1
// active (was 2/2/1/1) — bumped alongside SHOP_OFFER_COUNT.
// Exported for direct testing of the draw's uniqueness invariants across
// many seeds — the old test drove this via repeated REROLL actions
// (removed 2026-08-08), which is no longer available as a mechanism.
export function drawShopOffers(rng: RngFn, commanderId?: CommanderId, protocols?: ProtocolId[]): PartId[] {
  const taken = new Set<PartId>();
  const offers = [
    drawRarityWeighted(WEAPON_POOL, taken, rng),
    drawRarityWeighted(WEAPON_POOL, taken, rng),
    drawRarityWeighted(WEAPON_POOL, taken, rng),
    drawRarityWeighted(DEFENSE_POOL, taken, rng),
    drawRarityWeighted(DEFENSE_POOL, taken, rng),
    drawRarityWeighted(DEFENSE_POOL, taken, rng),
    drawRarityWeighted(SYSTEMS_POOL, taken, rng),
    drawRarityWeighted(ACTIVE_POOL, taken, rng),
  ];
  const trimmed = hasProtocol(protocols, 'armada-mandate') ? offers.slice(0, SHOP_OFFER_COUNT - 1) : offers;
  const signaturePart = commanderId ? SIGNATURE_PART[commanderId] : undefined;
  const signatureSlot = commanderId ? SIGNATURE_SLOT[commanderId] : undefined;
  if (signaturePart && signatureSlot !== undefined && signatureSlot < trimmed.length && !trimmed.includes(signaturePart)) {
    trimmed[signatureSlot] = signaturePart;
  }
  return trimmed;
}

// Re-tuned 2026-08-04: the "Expand your fleet" section used to always show
// every purchasable frame — the same four ships, every single visit. 3 of
// the (now 6) purchasable frames instead, drawn fresh per shop visit, no
// commander-signature guarantee (frames aren't commander-specific gear the
// way parts are — every commander benefits from a wide roster showing up).
// 2026-08-06: the Dreadnought used to be act-2-only — a 30cr giant showing
// up (and being affordable to a wealthy player) as early as column 1
// undercuts the interceptor -> midrange -> dreadnought progression the
// repricing above was built around. Excluded from the draw pool entirely in
// act 1 rather than shown-but-disabled, matching how the fleet-cap case
// shows everything and gates only the buy action — this is a genuine "not
// yet", not a "can't afford it yet", so hiding it reads truer than a
// greyed-out card a player can't do anything about all act.
// Iteration 52 (2026-08-12): the hardcoded 'dreadnought' check generalized
// to legendary tier — the Dreadnought was demoted to epic (see frames.ts)
// and Valkyrie/Aegis/Titan are the new legendary giants; without this a
// Titan could appear at act-1 column 1. Stores already never stock
// epic/legendary at all (below), so this only changes shipyard behavior.
// Iteration 33 (2026-08-07): `kind` now also drives count and legendary
// eligibility — a store shows 2, a shipyard shows more (legendary hulls
// eligible once act 2 makes them eligible at all — the two gates AND
// together).
// Iteration 36 (rarity): each offer slot rolls a rarity tier same as a part
// slot does — the legendary-eligibility filter above already excludes them
// from `pool` in an act-1 shipyard, so a legendary roll there simply falls
// back to the next tier down (epic) rather than ever leaking a capital ship
// early.
// 2026-08-08: the store's old pitch was "second-hand" (cheaper, always-
// common bonus, no separate rarity story) — now that hulls carry real
// rarity tiers, that's expressed directly instead: a store simply never
// stocks an epic or legendary hull, full stop, rather than stocking one at
// a fake "common" bonus level. Shipyard count 4 -> 5, both to read as the
// clearly bigger selection and to make room now that a store visit can
// never be the place you find the roster's top tier.
// Iteration 59.1: the shipyard pool excludes commons too — mirroring the
// store's own epic/legendary exclusion, so each shop gains a real tier
// identity (store = common+rare, "cheap hulls"; shipyard = rare+epic(+
// legendary in act 2), "quality hulls"). No RARITY_WEIGHTS change needed
// (52's standing rule) — drawRarityWeighted's own tier-walk already falls
// a rolled common up to the nearest populated tier (rare) when the pool it
// was handed has none, same mechanism that already handles an act-1
// shipyard's legendary exclusion above.
// reducer.ts imports this back — PICK_NODE calls it when a shop/shipyard
// node is entered (a non-shop case; the drawing logic itself is shop
// pricing, so it lives here regardless).
export function drawFrameOffers(rng: RngFn, act: 1 | 2, kind: 'store' | 'shipyard'): Exclude<FrameId, 'cruiser'>[] {
  const legendaryEligible = act === 2 && kind === 'shipyard';
  // 47.5l: pool built as {id, rarity} pairs, not full Frame objects — a
  // pool of `Frame[]` widens `.id` back to the whole FrameId union (Frame's
  // own field type, `getFrame`'s return), losing PURCHASABLE_FRAME_IDS's
  // `Exclude<'cruiser'>` narrowing at the type level even though no
  // 'cruiser' ever appears at the value level. This is the only other
  // field drawRarityWeighted's result depended on below, so nothing is
  // lost by not carrying the rest of Frame through.
  let pool = PURCHASABLE_FRAME_IDS.filter((id) => legendaryEligible || getFrame(id).rarity !== 'legendary').map((id) => ({
    id,
    rarity: getFrame(id).rarity,
  }));
  if (kind === 'store') pool = pool.filter((f) => f.rarity !== 'epic' && f.rarity !== 'legendary');
  if (kind === 'shipyard') pool = pool.filter((f) => f.rarity !== 'common');
  const count = kind === 'shipyard' ? 5 : 2;
  const taken = new Set<Exclude<FrameId, 'cruiser'>>();
  const offers: Exclude<FrameId, 'cruiser'>[] = [];
  for (let i = 0; i < count && taken.size < pool.length; i++) {
    offers.push(drawRarityWeighted(pool, taken, rng));
  }
  return offers;
}

// The shop actions this module owns (59.3 replaced 52.5's REFIT_SHIP with
// UPGRADE_MARK).
export type ShopAction = Extract<
  RunAction,
  {
    type:
      | 'BUY_PART'
      | 'SELL_PART'
      | 'BUY_SHIP'
      | 'UPGRADE_MARK'
      | 'SCUTTLE_SHIP'
      | 'BUY_COMMODITY_LOT'
      | 'SELL_COMMODITY_LOT'
      | 'BUY_MERCENARY'
      | 'BUY_REPAIR'
      | 'LEAVE_SHOP';
  }
>;

// The single entry point reducer.ts's main switch delegates to for all of
// the shop actions above. Bodies are unchanged from their original
// reducer.ts case bodies — only the surrounding imports moved (47.6).
export function handleShopAction(state: RunState, action: ShopAction): RunState {
  switch (action.type) {
    case 'BUY_PART': {
      if (state.phase !== 'shop' || !state.shopOffers) return state;
      const partId = state.shopOffers[action.offerIndex];
      if (!partId) return state;
      const cost = partCost(partId, state.commanderId, state.protocols);
      if (state.credits < cost) return state;
      const shopOffers = [...state.shopOffers];
      shopOffers.splice(action.offerIndex, 1);
      return { ...state, credits: state.credits - cost, inventory: [...state.inventory, partId], shopOffers };
    }

    case 'SELL_PART': {
      if (state.phase !== 'shop') return state;
      // 2026-08-06: a commodity lot bought to inventory isn't a normal
      // part — it has no half-cost salvage value (its listed cost is 0,
      // which would let the generic sell button quietly bin it for
      // nothing). SELL_COMMODITY_LOT is the only way to cash one in,
      // same guard UNEQUIP already carries for the equipped case.
      if (action.partId === COMMODITY_LOT_PART_ID) return state;
      if (!state.inventory.includes(action.partId)) return state;
      const payout = partSellPrice(action.partId);
      return {
        ...state,
        credits: state.credits + payout,
        inventory: removeOnce(state.inventory, action.partId),
      };
    }

    case 'BUY_SHIP': {
      if (state.phase !== 'shop') return state;
      // 2026-08-08: mercenary escorts don't count toward the fleet cap once
      // hired (same as at hire time, see BUY_MERCENARY below) — a temporary
      // rental shouldn't block a real hull purchase.
      if (commissionedFleetSize(state.fleet) >= fleetCap(state.commanderId, state.protocols, state.bonusFleetBerths ?? 0)) return state;
      // 2026-08-06: only 1 of each frame type per shop visit — once bought,
      // it's gone from this visit's offers (below), so a second attempt at
      // the same frameId is refused here rather than silently re-selling
      // something that's no longer on offer.
      if (!state.shopFrameOffers?.includes(action.frameId)) return state;
      const frame = getFrame(action.frameId); // the Flagship ('cruiser') is never purchasable
      // 2026-08-06: legendary hulls are act-2-and-shipyard-only.
      // drawFrameOffers already never puts one in an act-1/store
      // shopFrameOffers, so this is belt-and-suspenders against a stale/
      // forced offers list rather than something normal play can trigger.
      // Iteration 52: generalized off the old hardcoded 'dreadnought' check
      // — see drawFrameOffers's own comment for why.
      if (frame.rarity === 'legendary' && (state.act === 1 || state.shopKind !== 'shipyard')) return state;
      const cost = frameCost(frame.cost, action.frameId, state.commanderId, state.protocols, state.shopKind);
      if (state.credits < cost) return state;
      const commissioned = state.shipsCommissioned ?? state.fleet.length;
      // 61.1: the shipyard random rarity bonus (hullRarityBonus) is
      // removed — a bought hull, store or shipyard, arrives with exactly
      // STARTING_FIT[frameId] and nothing else. See shop.ts's git history
      // for the removed mechanic (iteration 39, reworked 2026-08-08).
      return {
        ...state,
        credits: state.credits - cost,
        fleet: [
          ...state.fleet,
          {
            frameId: action.frameId,
            equipped: [...STARTING_FIT[action.frameId]],
            damage: 0,
            upgrades: [],
            name: shipName(state.map.seed, commissioned, action.frameId),
            kills: 0,
            fightsSurvived: 0,
          },
        ],
        shipsCommissioned: commissioned + 1,
        // 2026-08-06: one buy consumes that offer, same as BUY_PART splicing
        // shopOffers — each frame type is unique within a visit's draw
        // (drawFrameOffers), so filtering it out by id is equivalent to
        // removing exactly the one bought. Otherwise it just sat there,
        // buyable again and again up to fleet cap or credits.
        shopFrameOffers: state.shopFrameOffers?.filter((id) => id !== action.frameId),
      };
    }

    case 'UPGRADE_MARK': {
      // Iteration 59.3: the reducer just re-validates and applies —
      // canUpgradeMark/markUpgradeCost are the single source of truth the
      // UI also reads from, so there's no separate rule set to drift out
      // of sync. Unlike the old REFIT_SHIP, this never touches frameId,
      // damage, or shopFrameOffers — a mark is a permanent modification to
      // the ship the player already has, not a new hull acquisition.
      if (state.phase !== 'shop') return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship || !canUpgradeMark(state.shopKind, ship)) return state;
      const targetMark = ((ship.mark ?? 1) + 1) as 2 | 3;
      const cost = markUpgradeCost(ship.frameId, targetMark, state.commanderId, state.protocols);
      if (state.credits < cost) return state;
      const fleet = mapShip(state.fleet, action.shipIndex, (s) => ({ ...s, mark: targetMark }));
      return { ...state, credits: state.credits - cost, fleet };
    }

    case 'SCUTTLE_SHIP': {
      // Iteration 8 (8.7): decommission a non-Flagship ship — parts return
      // to inventory, upgrades are destroyed (consistent with combat loss),
      // no credit refund. The Flagship guard alone guarantees the fleet can
      // never be emptied, since it's always present and never scuttleable.
      if (state.phase !== 'shop') return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship || ship.frameId === 'cruiser') return state;
      const salvage = ship.equipped.filter(isSalvageablePart);
      const fleet = state.fleet.filter((_, i) => i !== action.shipIndex);
      return { ...state, fleet, inventory: [...state.inventory, ...salvage] };
    }

    case 'BUY_COMMODITY_LOT': {
      // 2026-08-06: buys straight to inventory, like any other part — which
      // ship (if any) carries it is now a separate EQUIP, not a choice made
      // at purchase time. The old version took a shipIndex and loaded it in
      // one step; that per-ship button row read fine with 2 hulls and
      // unreadable with 5.
      if (state.phase !== 'shop') return state;
      const cost = commodityLotBuyCost(state.commanderId);
      if (state.credits < cost) return state;
      // Cap 1 normally, 2 for the Merchant — a second lot for anyone else
      // would just be a second bet on the same trade, not a new decision.
      // Counts inventory copies too, not just equipped ones, so the cap
      // can't be dodged by stockpiling unequipped lots.
      const lotsOwned =
        state.fleet.filter((s) => s.equipped.includes(COMMODITY_LOT_PART_ID)).length +
        state.inventory.filter((id) => id === COMMODITY_LOT_PART_ID).length;
      if (lotsOwned >= commodityLotCap(state.commanderId)) return state;
      return { ...state, credits: state.credits - cost, inventory: [...state.inventory, COMMODITY_LOT_PART_ID] };
    }

    case 'SELL_COMMODITY_LOT': {
      if (state.phase !== 'shop') return state;
      const here = globalColumn(state.act, state.position?.col ?? 0);
      // Sells EVERY lot that's eligible (bought at an earlier station) in
      // one action, not just one — with the Merchant able to carry 2 at
      // once, requiring a second click to clear the second lot would be
      // friction the single-lot case never had. Same-visit flipping is
      // impossible by construction (shops are forward-only nodes the
      // player can't revisit), but the per-ship check stands on its own
      // regardless of how a future map feature might change that.
      let sold = 0;
      const fleet = state.fleet.map((s) => {
        const boughtAt = s.commodityLotBoughtAtGlobalColumn;
        if (!s.equipped.includes(COMMODITY_LOT_PART_ID) || boughtAt === undefined || here <= boughtAt) return s;
        sold++;
        return {
          ...s,
          equipped: removeOnce(s.equipped, COMMODITY_LOT_PART_ID),
          commodityLotBoughtAtGlobalColumn: undefined,
        };
      });
      if (sold === 0) return state;
      return { ...state, fleet, credits: state.credits + sold * COMMODITY_LOT_SELL_PRICE };
    }

    case 'BUY_MERCENARY': {
      if (state.phase !== 'shop') return state;
      // Deliberately NOT capped by fleetCap (2026-08-04) — a mercenary is a
      // one-fight rental, not a permanent addition to the roster (it's
      // already excluded from shipsCommissioned above, and every mustering-
      // out path — CONTINUE, the act-1/2 boundary — drops it regardless of
      // fleet size). A player already at the cap is exactly who most wants
      // a temporary extra hull for one hard fight; blocking that made the
      // cap punish the one purchase it can't actually overcrowd anything
      // with.
      const cost = mercenaryCost(state.commanderId);
      if (state.credits < cost) return state;
      return {
        ...state,
        credits: state.credits - cost,
        fleet: [
          ...state.fleet,
          {
            frameId: 'interceptor',
            equipped: [...MERCENARY_FIT],
            damage: 0,
            upgrades: [],
            name: MERCENARY_SHIP_NAME,
            kills: 0,
            fightsSurvived: 0,
            mercenary: true,
          },
        ],
        // Deliberately NOT counted against shipsCommissioned — the naming
        // counter is for the fleet's real, permanent roster (ships that
        // earn a seeded name); a one-fight hire has a literal name instead
        // and shouldn't shift later ships' names by consuming a slot in
        // that sequence.
      };
    }

    case 'BUY_REPAIR': {
      // 2026-08-06: a credit sink at every trade station — full repair
      // yards are their own map node (free, but you have to route to one);
      // this is the "just pay for it, wherever you are" alternative for a
      // player sitting on more credits than shopping list. Priced per HP so
      // it scales with how hurt the ship actually is, not a flat visit fee.
      if (state.phase !== 'shop') return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship || ship.damage <= 0) return state;
      const cost = ship.damage * REPAIR_COST_PER_HP;
      if (state.credits < cost) return state;
      const fleet = mapShip(state.fleet, action.shipIndex, (s) => ({ ...s, damage: 0 }));
      return { ...state, fleet, credits: state.credits - cost };
    }

    case 'LEAVE_SHOP': {
      if (state.phase !== 'shop') return state;
      return {
        ...state,
        phase: 'map',
        shopOffers: undefined,
        shopFrameOffers: undefined,
        shopKind: undefined,
        currentEnemy: undefined,
      };
    }

    default: {
      // Exhaustiveness guard — every ShopAction member is handled above;
      // if a new one is ever added without a case here, this line fails to
      // compile rather than silently falling through to a no-op.
      return ((_exhaustive: never) => state)(action);
    }
  }
}
