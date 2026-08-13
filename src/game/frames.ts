import type { Rarity, ShipStats } from './types';

// Internal id stays 'cruiser' (renaming would churn every test fixture) —
// its display name is "Flagship" everywhere the player sees it: it's the
// one-per-fleet ship the run's upgrades accrete onto. The iteration-9
// purchasable frame is internally 'light-cruiser' (display name "Cruiser",
// free again since the Flagship rename) — a distinct id, since 'cruiser'
// is already taken.
//
// Iteration 52: 'frigate' | 'aegis' | 'tender' | 'ew-cutter' |
// 'disruptor-cutter' were LEGACY (retired iteration 36) but are un-retired
// here — typed slots (52.1) and innate traits (52.3) are exactly the
// "genuine base-level reason to exist" the iteration-36 retirement comment
// asked for. Each keeps its id (safe — 52.1 bumps SAVE_VERSION, so no old
// save can carry a loadout that resolves against the wrong shape) but is
// renamed/repriced/re-laid-out to its 52.4 roster identity: frigate ->
// Frigate, ew-cutter -> Picket, tender -> Sloop, disruptor-cutter ->
// Disruptor, aegis -> Aegis (promoted to legendary). 5 genuinely new
// frames (Gunboat, Destroyer, Battleship, Valkyrie, Titan) round the
// roster out to 17 purchasable.
export type FrameId =
  | 'cruiser'
  | 'interceptor'
  | 'bastion'
  | 'dreadnought'
  | 'light-cruiser'
  | 'freighter'
  | 'derelict'
  | 'corvette'
  | 'frigate'
  | 'aegis'
  | 'tender'
  | 'ew-cutter'
  | 'disruptor-cutter'
  | 'gunboat'
  | 'destroyer'
  | 'battleship'
  | 'valkyrie'
  | 'titan';

// Iteration 52.1: which PartType a slot of this kind accepts (see ship.ts's
// PART_TYPE_SLOT_KIND for the concrete mapping). 'cargo' (the commodity
// lot) is deliberately not its own kind — it's universal-only, so it never
// gets a dedicated socket, only ever draws from the shared universal pool.
export type SlotKind = 'universal' | 'weapon' | 'defense' | 'systems';

export interface Frame {
  id: FrameId;
  name: string;
  // Iteration 52.1: replaces the old `slots: number` + `maxWeapons?:
  // number` pair — both are now derived (frameSlots below for the count;
  // the weapon ceiling is `count('weapon') + count('universal')`, computed
  // where it's used, ship.ts's canEquip). A typed layout expresses
  // "durable protector, one gun" or "escort carrier, no guns of its own"
  // directly, instead of a slot count plus a separate cap that could drift
  // out of sync with it.
  slotLayout: SlotKind[];
  baseInitiative: number;
  baseHp: number;
  cost: number;
  rarity: Rarity;
  blurb: string;
  // Iteration 52.3: a hull-intrinsic bonus, distinct from anything a part
  // grants — folded into deriveStats (ship.ts) immediately after the
  // frame's own base stats, so parts/upgrades stack on top exactly as
  // before. Declarative `grants` only: every field used below is a
  // ShipStats the combat engine already reads, so this needs zero engine
  // changes. A trait needing a new engine hook would be a separate,
  // called-out addition, not something to smuggle in here.
  innate?: { name: string; description: string; grants: Partial<ShipStats> };
  // Iteration 57.1 (ship power budgets): the hull's own INNATE generation
  // budget — a loadout is legal only if sum(part.power) <= this PLUS
  // whatever equipped reactors generate (ship.ts's powerBudget, iteration
  // 58.3). Enforced in ship.ts's canEquip/layoutCanHold, never in
  // deriveStats — build-time only, like slot count.
  // Iteration 58.1: standardized to `slotCount + TIER_INDEX[rarity]`
  // (types.ts) for every frame except Bastion and the Flagship (both
  // documented exceptions at their own entries below) — replaces 57's 18
  // hand-tuned numbers (which ran roughly `slots + 2*tier`) now that
  // reactors (58.2) make up the difference and more for a hull that
  // chooses to spend a slot on one.
  power: number;
}

// frame.slotLayout.length, named so call sites read as intent ("how many
// slots does this frame have") rather than reaching into the array shape
// directly. ship.ts's effectiveSlotLayout/effectiveSlots layer the bonus-
// slot math (bay/Lone-flagship/Warlord) on top of this.
export function frameSlots(frame: Frame): number {
  return frame.slotLayout.length;
}

export const FRAMES: Record<FrameId, Frame> = {
  cruiser: {
    id: 'cruiser',
    name: 'Flagship',
    // Iteration 63.4 (user direction: "flag ship should be no exception,
    // it should also have at least 1 defense and 1 system slot mandatory")
    // — was universal-heavy (`W W U U U U`, 52.1) purely to avoid breaking
    // scripts/balance.ts's hand-equipped fixture fleets; re-audited against
    // the actual fixtures instead of just avoiding them: STARTING_LOADOUT
    // (ion, ion, comp1, injector) and every hand-built cruiser fixture in
    // balance.ts/reducer.test.ts fit `W W D S U U` with room to spare (the
    // overflow math spills any extra defense/systems items into the 2
    // remaining universal slots) — see plans/iteration-63.md's 63.4 fit
    // table. `flagshipMissingRequiredParts` (ship.ts) already enforces a
    // computer + hull part before the fleet can engage; this layout change
    // reinforces that same intent structurally rather than duplicating it.
    slotLayout: ['weapon', 'weapon', 'defense', 'systems', 'universal', 'universal'],
    baseInitiative: 0,
    // 2026-08-08: 3 -> 4. Hull plating dropped out of STARTING_LOADOUT
    // (parts.ts) — its +1 HP moved here instead, onto the frame's own base,
    // so the starting Flagship's total HP is unchanged.
    baseHp: 4,
    cost: 14,
    rarity: 'common', // never sold — the starting ship, rarity is unused but required
    // Iteration 58.1: the Flagship is the roster's OTHER documented
    // exception (with Bastion below) — formula would say 6+0=6 (its
    // `rarity` field is a placeholder, "unused but required", so the
    // formula can't even resolve a tier for it), but it keeps a flat,
    // hand-set 8 for the same "never sold, not really a tier" reason 57.1
    // originally flat-listed 10 here.
    power: 8,
    blurb: 'Roomy workhorse, slow.',
  },
  interceptor: {
    id: 'interceptor',
    name: 'Interceptor',
    slotLayout: ['weapon', 'systems', 'universal'],
    baseInitiative: 2,
    baseHp: 2,
    cost: 6,
    rarity: 'common',
    power: 3, // 58.1: slots(3) + TIER_INDEX.common(0) — unchanged by the formula cut
    // 52.3: formalizes what was already a one-off hardcoded check in
    // deriveStats (`if (frameId === 'interceptor') stats.jink = true`) —
    // the zero-behavior-change proof the innate-trait pattern works.
    innate: {
      name: 'Jink',
      description: 'Once per combat, the first hit that would land on this ship misses instead.',
      grants: { jink: true },
    },
    blurb: 'Fast and fragile — dodges the first hit of each fight.',
  },
  // Iteration 36: reprice 12 -> 9cr. Used to arrive pre-fitted with the
  // lure beacon (a bundled 5cr identity part) — now hulls are pure bases
  // (see STARTING_FIT in reducer.ts), so the bundle is gone, but a 6-HP
  // wall is still the roster's best durability base and doesn't refund
  // the part's full value.
  // Iteration 41: 9 -> 12cr — every purchasable hull now arrives with at
  // least one weapon (an empty "durable protector" that can't fight back
  // read wrong), bumped by the Ion cannon's own 3cr price.
  // Iteration 52: typed slots replace the old `maxWeapons: 1` — this
  // layout has exactly one weapon slot and (deliberately) NO universal
  // slot, so the 1-weapon cap is structural, not a separate rule bolted on
  // (see ship.ts's canEquip: with zero universal slots there is no overflow
  // budget for a 2nd weapon, full stop). 52.1 otherwise requires every
  // frame to keep >=1 universal slot (so it can carry a commodity lot) —
  // Bastion is the one deliberate exception, chosen over diluting its
  // "durable protector, one gun" identity for a lot-carrying edge case a
  // 3-slot tank was never the hull for anyway. See ship.test.ts/
  // reducer.test.ts's Bastion coverage for the regression this preserves.
  bastion: {
    id: 'bastion',
    name: 'Bastion',
    // 2026-08-13: 3 -> 4 slots (added a 3rd defense slot) — brought to
    // parity with the roster's other rares (Disruptor, Gunboat both sit at
    // 4). Deliberately NOT a universal/systems slot — see the zero-
    // universal comment above, which still holds: Bastion still can't host
    // a reactor, so the flat-power exception's underlying reason is
    // unchanged (only its arithmetic below happens to now agree with the
    // formula — that's a coincidence of this slot count, not the exception
    // resolving itself).
    slotLayout: ['weapon', 'defense', 'defense', 'defense'],
    baseInitiative: 0,
    baseHp: 6,
    cost: 12,
    rarity: 'rare',
    // Iteration 58.1: Bastion is the ONE frame that deviates from the
    // `slots + TIER_INDEX[rarity]` formula — it keeps its full pre-58 5, on
    // the same "sealed hull, oversized stock plant" reasoning that already
    // justifies its zero-universal-slot exception above: with no systems/
    // universal slots at all, Bastion can never host a reactor (58.2), so
    // it would otherwise be the one hull permanently worse off from the
    // innate cut with no way to compensate.
    // 2026-08-13: at 4 slots the formula now gives 4+TIER_INDEX.rare(1)=5 —
    // the SAME 5 as the hand-set exception value, so this stays a plain
    // `5` rather than switching to a formula comment; the coincidence
    // doesn't mean the exception is gone (still 0 universal/systems, still
    // can't host a reactor), just that the two numbers happen to match now.
    power: 5,
    innate: {
      name: 'Reactive plating',
      description: 'Negates the first hit this ship takes each combat.',
      grants: { reactiveArmor: 1 },
    },
    blurb: 'Durable protector — innately shrugs off the first hit each fight.',
  },
  // 2026-08-06: repriced as the top of a deliberate 3-step progression —
  // "interceptors, then something more midrange, then finally Dreadnoughts
  // if you're somehow super rich" — and every frame with 5+ slots got a
  // real premium on top of that (a high-slot hull was previously cheaper
  // per slot than several LOWER-slot specialty hulls, which read as
  // underpriced rather than "cheap for a reason"). Arrives pre-fitted with
  // a small starting loadout (mirrors STARTING_FIT in reducer.ts) so a
  // 30cr purchase doesn't land as an empty hull needing a second shopping
  // pass to be worth anything.
  // Iteration 52 STAGE (b): demoted legendary -> epic — Battleship/
  // Valkyrie/Aegis/Titan are the new giants, and the act-2-shipyard gate
  // that used to hardcode 'dreadnought' now applies to legendary tier
  // generally (drawFrameOffers/BUY_SHIP in reducer/shop.ts), so this
  // demotion also frees the Dreadnought to appear in an act-1 shipyard.
  // (Stage (a) measured this hull still at legendary — see the plan's
  // stage-a/stage-b balance tables for the attributable delta.)
  // `shieldPierce` was a documented-dormant ShipStats field (types.ts)
  // awaiting exactly this — a part/trait to revive it; this is that
  // revival.
  dreadnought: {
    id: 'dreadnought',
    name: 'Dreadnought',
    slotLayout: ['weapon', 'weapon', 'weapon', 'weapon', 'defense', 'defense', 'universal', 'universal'],
    baseInitiative: 0,
    baseHp: 8,
    cost: 30,
    rarity: 'epic',
    power: 10, // 58.1: slots(8) + TIER_INDEX.epic(2)
    innate: {
      name: 'Siege plating',
      description: 'This ship\'s attacks ignore 1 point of enemy piloting.',
      grants: { shieldPierce: 1 },
    },
    blurb: 'One giant instead of Flagship-plus-escorts — innately pierces 1 point of enemy piloting.',
  },
  // The midrange step: no gimmick, no cap, priced as the real "second
  // ship" investment between a cheap Interceptor and a premium Dreadnought.
  // Iteration 52: the deliberate "no gimmick" baseline every other hull's
  // identity is read against — see 52.4's roster comment.
  'light-cruiser': {
    id: 'light-cruiser',
    name: 'Cruiser',
    // 63.4: was `W W U U` (2 of 4 = 50% universal) — restrictive-hull pass,
    // universal slots trimmed to the roster's ≤1/3 norm. Starting fit
    // (ion, shield1) still fits: ion->W, shield1->D.
    slotLayout: ['weapon', 'weapon', 'defense', 'universal'],
    baseInitiative: 1,
    baseHp: 4,
    cost: 22,
    rarity: 'epic',
    power: 6, // 58.1: slots(4) + TIER_INDEX.epic(2)
    blurb: 'No gimmick — the only escort-tier hull that can carry a real multi-weapon loadout.',
  },
  // 5 slots for less than a 3-slot Bastion used to be the exact
  // underpricing this pass corrects — still cheaper than the Cruiser (its
  // ceiling is genuinely lower: a cargo hull leaning into utility slots,
  // not raw combat), but no longer a strictly-better slot count for less.
  // Iteration 41: 15 -> 18cr, an Ion cannon bundled in (see Bastion's note).
  // 2026-08-13: 5 -> 4 slots, dedicated weapon slot dropped entirely — user
  // direction: bring Freighter to the same 4-slot rare parity as Bastion/
  // Disruptor/Gunboat, and "if anything the freighter should actually be
  // weaponless and not be stronger than the other ones." It keeps both
  // universal slots (still the roster's biggest universal share among
  // rares, its one real remaining edge — a player CAN still socket a
  // weapon into a universal slot, the hull just no longer arrives with, or
  // guarantees, one). STARTING_FIT.freighter (reducer/shop.ts) drops its
  // bundled ion cannon to match — arrives genuinely unarmed now.
  // Repriced 18 -> 13cr: 18cr was justified against 5 slots plus a bundled
  // weapon; at 4 slots with no guaranteed weapon and no innate, that
  // pricing no longer holds up against its rare-tier peers — Disruptor
  // (13cr, 4 slots, 1 universal, has an innate) and Gunboat (14cr, 4 slots,
  // 1 universal, 3 dedicated weapons) both out-fight it turn one. Landed on
  // 13cr, level with Disruptor: Freighter's 2-universal flexibility edge is
  // real but roughly offsets Disruptor's innate, and neither should price
  // above Gunboat's guaranteed 3-weapon combat identity. Checked against
  // `npm run balance` — see that pass's notes for the fixture read.
  freighter: {
    id: 'freighter',
    name: 'Freighter',
    // 63.4: was `W U U U S` (3 of 5 = 60% universal) — trimmed to 2, still
    // keeping a real cargo-runner flexibility edge over the rest of the
    // roster (it's the only hull besides the Sloop with 2+ universal).
    // 2026-08-13: dedicated weapon slot removed (see repricing note above)
    // — 2 universal, 1 defense, 1 systems remain.
    slotLayout: ['defense', 'systems', 'universal', 'universal'],
    baseInitiative: 0,
    baseHp: 3,
    cost: 13,
    rarity: 'rare',
    power: 5, // 2026-08-13: recomputed for the slot-count drop — slots(4) + TIER_INDEX.rare(1)
    blurb: 'Built for freight, not fighting — no dedicated weapon slot, arrives unarmed.',
  },
  // Iteration 41: 3 -> 4cr, arrives with a weapon — even the cheapest hull
  // in the yard can throw one punch. 61.3: flipped from light-missile to
  // ion, the roster's new non-speed-biased default.
  derelict: {
    id: 'derelict',
    name: 'Derelict',
    // 63.4: was `U U` (100% universal — the roster's worst offender).
    // Gets exactly one dedicated weapon slot now; still the roster's
    // floor hull otherwise. Starting fit (ion) fits: ion->W.
    slotLayout: ['weapon', 'universal'],
    baseInitiative: 0,
    baseHp: 2,
    cost: 4,
    rarity: 'common',
    power: 2, // 58.1: slots(2) + TIER_INDEX.common(0) — unchanged by the formula cut
    blurb: 'Barely flight-worthy — the weakest hull in the yard. Arrives fitted with an ion cannon.',
  },

  // Iteration 36: replaces the five retired support hulls below as the
  // roster's one cheap utility carrier — the natural home for an aura or
  // active part now that those parts are player-assembled, not bundled.
  // Iteration 41: 6 -> 8cr, a weapon bundled in. 61.3: the Corvette's
  // baseInitiative (1) is below the speed-biased threshold, and its
  // capacitor innate is evasion flavor, not speed — a judgment call
  // (recorded in plans/iteration-61.md) to flip it to the ion default with
  // the rest rather than treat it as speed-biased. The old weapon mention
  // is dropped from the blurb below (60's declutter trimmed to flavor-only
  // lines; the starting fit is already previewed in the shop card itself).
  // Iteration 52: innate capacitorShield:1 — a free taste of the Piloting
  // capacitor's "cheap, temporary evasion" identity on the roster's own
  // cheap utility hull.
  corvette: {
    id: 'corvette',
    name: 'Corvette',
    // 63.4: was `U U S` (2 of 3 = 67% universal). No dedicated weapon slot
    // (deliberately — a cheap utility hull, not a fighter): its starting
    // ion cannon spills into the one remaining universal slot instead,
    // leaving the defense/systems slots open for the player's own build.
    slotLayout: ['defense', 'systems', 'universal'],
    baseInitiative: 1,
    baseHp: 2,
    cost: 8,
    rarity: 'common',
    power: 3, // 58.1: slots(3) + TIER_INDEX.common(0)
    innate: {
      name: 'Piloting capacitor (innate)',
      description: '+1 piloting during the missile phase and the first cannon round only.',
      grants: { capacitorShield: 1 },
    },
    blurb: 'A cheap, thin utility hull. Innate opening-round evasion.',
  },

  // --- Iteration 52: revived (see the FrameId union's own comment) -------
  frigate: {
    id: 'frigate',
    name: 'Frigate',
    slotLayout: ['weapon', 'weapon', 'universal'],
    baseInitiative: 0,
    baseHp: 3,
    cost: 7,
    rarity: 'common',
    power: 3, // 58.1: slots(3) + TIER_INDEX.common(0) — unchanged by the formula cut
    blurb: 'Twin-gun common escort — more raw guns than an Interceptor, no systems slot at all.',
  },
  // Legendary — promoted from common (see the FrameId union's own comment).
  // Taunt is normally reserved for the Lure beacon part (52.3's design rule:
  // a binary flag granted innately obsoletes the part whose whole identity
  // it is) — the exception here is deliberate: a 42cr legendary doesn't
  // undercut a cheap lure beacon for the other 16 hulls the way a cheap
  // Bastion would have.
  aegis: {
    id: 'aegis',
    name: 'Aegis',
    // 63.4: was `D D D W U U S` (2 of 7 = 29% universal) — trimmed to 1.
    // Starting fit (ion, shield1) still fits: ion->W, shield1->D.
    slotLayout: ['defense', 'defense', 'defense', 'weapon', 'systems', 'systems', 'universal'],
    baseInitiative: 0,
    baseHp: 10,
    cost: 42,
    rarity: 'legendary',
    power: 10, // 58.1: slots(7) + TIER_INDEX.legendary(3)
    innate: {
      name: 'Aegis field',
      description: 'While this ship is alive, all enemy weapons target it.',
      grants: { taunt: true },
    },
    blurb: 'The roster\'s wall — innately draws every enemy shot.',
  },
  // 2026-08-12: a flexibility premium — every universal slot costs +2cr
  // over what a restricted (typed) slot would, off a 6cr baseline for a
  // fully-restricted 3-slot common hull. Picket's own 1-universal price
  // is unchanged by this rule (6 + 2x1 = 8, what it already cost); Sloop's
  // 3 universal slots move it 9 -> 12 (6 + 2x3). The point isn't Picket's
  // own number — it's that Sloop's build space is a strict superset of
  // Picket's (anything a systems slot accepts, a universal slot also
  // does), so it should cost a real premium to have that superset rather
  // than sit 1cr apart. Scoped to these two for now — the rest of the
  // roster's hand-tuned prices carry their own balance history and a
  // wholesale reprice off this formula is a separate, bigger pass.
  // 63.4 (restrictive hulls — "universal slots should be treated as
  // premium, and should be the minority in most cases"): the Sloop is the
  // one deliberate exception, not an oversight — its whole identity IS
  // full flexibility, and the premium pricing directly above already
  // makes that flexibility cost real credits rather than being free. Every
  // other frame in the roster was trimmed toward ≤1/3 universal this same
  // pass; this is the one left alone on purpose.
  tender: {
    id: 'tender',
    name: 'Sloop',
    slotLayout: ['universal', 'universal', 'universal'],
    baseInitiative: 1,
    baseHp: 3,
    cost: 12,
    rarity: 'common',
    power: 3, // 58.1: slots(3) + TIER_INDEX.common(0)
    blurb: 'Fully universal — build it as anything. No innate; the flexibility is the whole pitch.',
  },
  'ew-cutter': {
    id: 'ew-cutter',
    name: 'Picket',
    slotLayout: ['systems', 'systems', 'universal'],
    baseInitiative: 2,
    baseHp: 2,
    cost: 8,
    rarity: 'common',
    power: 3, // 58.1: slots(3) + TIER_INDEX.common(0)
    blurb: 'A computer/drive specialist — no dedicated weapon slot.',
  },
  'disruptor-cutter': {
    id: 'disruptor-cutter',
    name: 'Disruptor',
    slotLayout: ['systems', 'systems', 'defense', 'universal'],
    baseInitiative: 1,
    baseHp: 3,
    cost: 13,
    rarity: 'rare',
    power: 5, // 58.1: slots(4) + TIER_INDEX.rare(1)
    innate: {
      name: 'Point defense (innate)',
      description: 'Cancels 1 enemy missile die each combat.',
      grants: { flak: 1 },
    },
    blurb: 'EW support hull. Innately cancels 1 enemy missile die per fight.',
  },

  // --- Iteration 52: genuinely new frames ---------------------------------
  gunboat: {
    id: 'gunboat',
    name: 'Gunboat',
    slotLayout: ['weapon', 'weapon', 'weapon', 'universal'],
    baseInitiative: 1,
    baseHp: 3,
    cost: 14,
    rarity: 'rare',
    power: 5, // 58.1: slots(4) + TIER_INDEX.rare(1)
    blurb: 'All guns — the roster\'s highest weapon density for its cost.',
  },
  destroyer: {
    id: 'destroyer',
    name: 'Destroyer',
    // 63.4: was `W W S U U` (2 of 5 = 40% universal) — trimmed to 1, and
    // gained a SECOND systems slot in the swap (the speed hull leans into
    // drives/reactors competing for the same socket, the intended 58
    // interplay). Starting fit (light-missile) still fits: ->W.
    slotLayout: ['weapon', 'weapon', 'systems', 'systems', 'universal'],
    baseInitiative: 3,
    baseHp: 5,
    cost: 24,
    rarity: 'epic',
    power: 7, // 58.1: slots(5) + TIER_INDEX.epic(2)
    blurb: 'Fast epic striker — the highest base initiative below Valkyrie.',
  },
  battleship: {
    id: 'battleship',
    name: 'Battleship',
    slotLayout: ['weapon', 'weapon', 'weapon', 'defense', 'defense', 'universal'],
    baseInitiative: 0,
    baseHp: 7,
    cost: 28,
    rarity: 'epic',
    power: 8, // 58.1: slots(6) + TIER_INDEX.epic(2)
    blurb: 'Heavy epic. No innate; differentiated from the Dreadnought by layout alone.',
  },
  valkyrie: {
    id: 'valkyrie',
    name: 'Valkyrie',
    // 63.4: was `W W W S U U` (2 of 6 = 33% universal) — trimmed to 1, a
    // second systems slot in the swap (same speed-hull reasoning as the
    // Destroyer above). Starting fit (light-missile) fits: ->W.
    slotLayout: ['weapon', 'weapon', 'weapon', 'systems', 'systems', 'universal'],
    baseInitiative: 4,
    baseHp: 6,
    cost: 38,
    rarity: 'legendary',
    power: 9, // 58.1: slots(6) + TIER_INDEX.legendary(3)
    innate: {
      name: 'Jink',
      description: 'Once per combat, the first hit that would land on this ship misses instead.',
      grants: { jink: true },
    },
    blurb: 'Legendary striker — the roster\'s fastest base initiative. Innately dodges the first hit each fight.',
  },
  titan: {
    id: 'titan',
    name: 'Titan',
    // 63.4: was `W W W W D D U U U` (3 of 9 = 33% universal) — trimmed to
    // 2 (still the roster's other deliberately-flexible hull besides the
    // Sloop/Freighter, matching its status as the 48cr endpoint). Starting
    // fit (ion, ion, shield1) still fits: ion,ion->W,W; shield1->D.
    slotLayout: ['weapon', 'weapon', 'weapon', 'weapon', 'defense', 'defense', 'systems', 'universal', 'universal'],
    baseInitiative: 0,
    baseHp: 12,
    cost: 48,
    rarity: 'legendary',
    power: 12, // 58.1: slots(9) + TIER_INDEX.legendary(3)
    innate: {
      name: 'Ablative plating (innate)',
      description: '+3 temporary HP each combat, absorbed before real HP.',
      grants: { ablative: 3 },
    },
    blurb: 'The roster\'s largest hull. Innately shrugs off 3 damage every fight.',
  },
};

export const MAX_FLEET_SIZE = 4;

// Every frame a shop can offer — the Flagship ('cruiser') is the one
// exception, never purchasable (it's the single starting ship the run's
// upgrades accrete onto). Single source of truth for both the reducer's
// random shop-offer draw and any UI that needs the full purchasable set.
// Iteration 52 STAGE (b): grown 7 -> 17 (16 here + the never-purchasable
// Flagship) — un-retiring the 5 legacy ids and adding 5 new frames widens
// the act-1 shipyard draw from 5-of-6 to 5-of-~13 without touching a
// single rarity weight (see plans/iteration-52.md's "why no rarity
// re-weighting"). (Stage (a) measured the original 7 only — see the plan's
// stage-a/stage-b balance tables for the attributable delta.)
export const PURCHASABLE_FRAME_IDS: Exclude<FrameId, 'cruiser'>[] = [
  'interceptor',
  'bastion',
  'dreadnought',
  'light-cruiser',
  'freighter',
  'derelict',
  'corvette',
  'frigate',
  'aegis',
  'tender',
  'ew-cutter',
  'disruptor-cutter',
  'gunboat',
  'destroyer',
  'battleship',
  'valkyrie',
  'titan',
];

export function getFrame(id: FrameId): Frame {
  return FRAMES[id];
}

// Iteration 59.3 (hull marks): the class designation a player sees, not the
// ship's own christened name ("ISV Resolute" — shipNames.ts, untouched by
// this). Mark I (mark absent/undefined) is the plain frame name; II/III
// append the roman numeral. One source of truth for every display call site
// that used to read `getFrame(id).name` directly for a real fleet ship (a
// frame CARD in a shop offer, which previews a hull nobody owns yet, has no
// mark to show and keeps reading `.name` directly).
export function frameDisplayName(frameId: FrameId, mark?: 2 | 3): string {
  const name = getFrame(frameId).name;
  if (mark === 2) return `${name} II`;
  if (mark === 3) return `${name} III`;
  return name;
}
