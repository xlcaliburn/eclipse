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
  // Iteration 57.1 (ship power budgets): the hull's own generation budget —
  // a loadout is legal only if sum(part.power) <= this. Values are 52's own
  // roster table (plans/iteration-52.md's 52.4), reproduced as the
  // implementation source of truth in plans/iteration-57.md. Enforced in
  // ship.ts's canEquip/layoutCanHold, never in deriveStats — build-time
  // only, like slot count.
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
    // Iteration 52.1: universal-heavy by necessity, not by design intent —
    // scripts/balance.ts's fixture fleets hand-equip the Flagship with up
    // to 6 mixed parts (any of weapon/computer/hull/drive/shield), and
    // those fixtures are how the balance sim measures the game; a more
    // dedicated layout here would silently break every one of them (see
    // 52.6). 2 dedicated weapon slots keep the "at least somewhat capped"
    // feel; the remaining 4 stay universal so any fixture (and any real
    // build) still fits.
    slotLayout: ['weapon', 'weapon', 'universal', 'universal', 'universal', 'universal'],
    baseInitiative: 0,
    // 2026-08-08: 3 -> 4. Hull plating dropped out of STARTING_LOADOUT
    // (parts.ts) — its +1 HP moved here instead, onto the frame's own base,
    // so the starting Flagship's total HP is unchanged.
    baseHp: 4,
    cost: 14,
    rarity: 'common', // never sold — the starting ship, rarity is unused but required
    power: 10, // plans/iteration-57.md's 57.1 table — the one flat-listed exception, not derived from a tier
    blurb: 'Roomy workhorse. 6 slots (2 dedicated weapon), slow.',
  },
  interceptor: {
    id: 'interceptor',
    name: 'Interceptor',
    slotLayout: ['weapon', 'systems', 'universal'],
    baseInitiative: 2,
    baseHp: 2,
    cost: 6,
    rarity: 'common',
    power: 3,
    // 52.3: formalizes what was already a one-off hardcoded check in
    // deriveStats (`if (frameId === 'interceptor') stats.jink = true`) —
    // the zero-behavior-change proof the innate-trait pattern works.
    innate: {
      name: 'Jink',
      description: 'Once per combat, the first hit that would land on this ship misses instead.',
      grants: { jink: true },
    },
    blurb: 'Fast and fragile. 1 weapon, 1 systems, 1 universal slot. Dodges the first hit of each fight.',
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
    slotLayout: ['weapon', 'defense', 'defense'],
    baseInitiative: 0,
    baseHp: 6,
    cost: 12,
    rarity: 'rare',
    power: 5,
    innate: {
      name: 'Reactive plating',
      description: 'Negates the first hit this ship takes each combat.',
      grants: { reactiveArmor: 1 },
    },
    blurb: 'Durable protector. 1 weapon, 2 defense slots, no universal (can\'t carry cargo). Innately shrugs off the first hit each fight.',
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
    power: 12,
    innate: {
      name: 'Siege plating',
      description: 'This ship\'s attacks ignore 1 point of enemy piloting.',
      grants: { shieldPierce: 1 },
    },
    blurb: 'One giant instead of Flagship-plus-escorts. 4 weapon, 2 defense, 2 universal slots. Innately pierces 1 point of enemy piloting.',
  },
  // The midrange step: no gimmick, no cap, priced as the real "second
  // ship" investment between a cheap Interceptor and a premium Dreadnought.
  // Iteration 52: the deliberate "no gimmick" baseline every other hull's
  // identity is read against — see 52.4's roster comment.
  'light-cruiser': {
    id: 'light-cruiser',
    name: 'Cruiser',
    slotLayout: ['weapon', 'weapon', 'universal', 'universal'],
    baseInitiative: 1,
    baseHp: 4,
    cost: 22,
    rarity: 'epic',
    power: 9,
    blurb: 'No gimmick — the only escort-tier hull that can carry a real multi-weapon loadout. 2 weapon, 2 universal slots.',
  },
  // 5 slots for less than a 3-slot Bastion used to be the exact
  // underpricing this pass corrects — still cheaper than the Cruiser (its
  // ceiling is genuinely lower: a cargo hull leaning into utility slots,
  // not raw combat), but no longer a strictly-better slot count for less.
  // Iteration 41: 15 -> 18cr, an Ion cannon bundled in (see Bastion's note).
  freighter: {
    id: 'freighter',
    name: 'Freighter',
    slotLayout: ['weapon', 'universal', 'universal', 'universal', 'systems'],
    baseInitiative: 0,
    baseHp: 3,
    cost: 18,
    rarity: 'rare',
    power: 7,
    blurb: 'Built for freight, not fighting. 1 weapon, 1 systems, 3 universal slots. Arrives fitted with an ion cannon.',
  },
  // Iteration 41: 3 -> 4cr, arrives with a Light missile — even the
  // cheapest hull in the yard can throw one punch.
  derelict: {
    id: 'derelict',
    name: 'Derelict',
    slotLayout: ['universal', 'universal'],
    baseInitiative: 0,
    baseHp: 2,
    cost: 4,
    rarity: 'common',
    power: 2,
    blurb: 'Barely flight-worthy. 2 universal slots — no dedicated weapon slot at all, the weakest hull in the yard. Arrives fitted with a light missile.',
  },

  // Iteration 36: replaces the five retired support hulls below as the
  // roster's one cheap utility carrier — the natural home for an aura or
  // active part now that those parts are player-assembled, not bundled.
  // Iteration 41: 6 -> 8cr, a Light missile bundled in.
  // Iteration 52: innate capacitorShield:1 — a free taste of the Piloting
  // capacitor's "cheap, temporary evasion" identity on the roster's own
  // cheap utility hull.
  corvette: {
    id: 'corvette',
    name: 'Corvette',
    slotLayout: ['universal', 'universal', 'systems'],
    baseInitiative: 1,
    baseHp: 2,
    cost: 8,
    rarity: 'common',
    power: 4,
    innate: {
      name: 'Piloting capacitor (innate)',
      description: '+1 piloting during the missile phase and the first cannon round only.',
      grants: { capacitorShield: 1 },
    },
    blurb: 'A cheap, thin utility hull. 2 universal, 1 systems slot. Innate opening-round evasion. Arrives fitted with a light missile.',
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
    power: 3,
    blurb: 'Twin-gun common escort. 2 weapon, 1 universal slot — more raw guns than an Interceptor, no systems slot at all.',
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
    slotLayout: ['defense', 'defense', 'defense', 'weapon', 'universal', 'universal', 'systems'],
    baseInitiative: 0,
    baseHp: 10,
    cost: 42,
    rarity: 'legendary',
    power: 15,
    innate: {
      name: 'Aegis field',
      description: 'While this ship is alive, all enemy weapons target it.',
      grants: { taunt: true },
    },
    blurb: 'The roster\'s wall. 3 defense, 1 weapon, 2 universal, 1 systems slot. Innately draws every enemy shot.',
  },
  tender: {
    id: 'tender',
    name: 'Sloop',
    slotLayout: ['universal', 'universal', 'universal'],
    baseInitiative: 1,
    baseHp: 3,
    cost: 9,
    rarity: 'common',
    power: 4,
    blurb: 'Fully universal — 3 slots, build it as anything. No innate; the flexibility is the whole pitch.',
  },
  'ew-cutter': {
    id: 'ew-cutter',
    name: 'Picket',
    slotLayout: ['systems', 'systems', 'universal'],
    baseInitiative: 2,
    baseHp: 2,
    cost: 8,
    rarity: 'common',
    power: 4,
    blurb: 'A computer/drive specialist. 2 systems, 1 universal slot — no dedicated weapon slot.',
  },
  'disruptor-cutter': {
    id: 'disruptor-cutter',
    name: 'Disruptor',
    slotLayout: ['systems', 'systems', 'defense', 'universal'],
    baseInitiative: 1,
    baseHp: 3,
    cost: 13,
    rarity: 'rare',
    power: 6,
    innate: {
      name: 'Point defense (innate)',
      description: 'Cancels 1 enemy missile die each combat.',
      grants: { flak: 1 },
    },
    blurb: 'EW support hull. 2 systems, 1 defense, 1 universal slot. Innately cancels 1 enemy missile die per fight.',
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
    power: 6,
    blurb: 'All guns. 3 weapon, 1 universal slot — the roster\'s highest weapon density for its cost.',
  },
  destroyer: {
    id: 'destroyer',
    name: 'Destroyer',
    slotLayout: ['weapon', 'weapon', 'systems', 'universal', 'universal'],
    baseInitiative: 3,
    baseHp: 5,
    cost: 24,
    rarity: 'epic',
    power: 10,
    blurb: 'Fast epic striker. 2 weapon, 1 systems, 2 universal slots, the highest base initiative below Valkyrie.',
  },
  battleship: {
    id: 'battleship',
    name: 'Battleship',
    slotLayout: ['weapon', 'weapon', 'weapon', 'defense', 'defense', 'universal'],
    baseInitiative: 0,
    baseHp: 7,
    cost: 28,
    rarity: 'epic',
    power: 11,
    blurb: 'Heavy epic — 3 weapon, 2 defense, 1 universal slot. No innate; differentiated from the Dreadnought by layout alone.',
  },
  valkyrie: {
    id: 'valkyrie',
    name: 'Valkyrie',
    slotLayout: ['weapon', 'weapon', 'weapon', 'systems', 'universal', 'universal'],
    baseInitiative: 4,
    baseHp: 6,
    cost: 38,
    rarity: 'legendary',
    power: 14,
    innate: {
      name: 'Jink',
      description: 'Once per combat, the first hit that would land on this ship misses instead.',
      grants: { jink: true },
    },
    blurb: 'Legendary striker. 3 weapon, 1 systems, 2 universal slots, the roster\'s fastest base initiative. Innately dodges the first hit each fight.',
  },
  titan: {
    id: 'titan',
    name: 'Titan',
    slotLayout: ['weapon', 'weapon', 'weapon', 'weapon', 'defense', 'defense', 'universal', 'universal', 'universal'],
    baseInitiative: 0,
    baseHp: 12,
    cost: 48,
    rarity: 'legendary',
    power: 18,
    innate: {
      name: 'Ablative plating (innate)',
      description: '+3 temporary HP each combat, absorbed before real HP.',
      grants: { ablative: 3 },
    },
    blurb: 'The roster\'s largest hull. 4 weapon, 2 defense, 3 universal slots. Innately shrugs off 3 damage every fight.',
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
