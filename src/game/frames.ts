import type { Rarity } from './types';

// Internal id stays 'cruiser' (renaming would churn every test fixture) —
// its display name is "Flagship" everywhere the player sees it: it's the
// one-per-fleet ship the run's upgrades accrete onto. The iteration-9
// purchasable frame is internally 'light-cruiser' (display name "Cruiser",
// free again since the Flagship rename) — a distinct id, since 'cruiser'
// is already taken.
//
// Iteration 36: 'frigate' | 'aegis' | 'tender' | 'ew-cutter' |
// 'disruptor-cutter' are LEGACY — retired from the shop (see
// PURCHASABLE_FRAME_IDS below) but kept here so a save carrying one still
// loads and derives stats correctly. 'corvette' replaces them as the
// roster's one cheap utility carrier.
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
  | 'disruptor-cutter';

export interface Frame {
  id: FrameId;
  name: string;
  slots: number;
  baseInitiative: number;
  baseHp: number;
  cost: number;
  rarity: Rarity;
  blurb: string;
  maxWeapons?: number; // undefined = no cap
}

export const FRAMES: Record<FrameId, Frame> = {
  cruiser: {
    id: 'cruiser',
    name: 'Flagship',
    slots: 6,
    baseInitiative: 0,
    baseHp: 3,
    cost: 14,
    rarity: 'common', // never sold — the starting ship, rarity is unused but required
    blurb: 'Roomy workhorse. 6 slots, slow.',
  },
  interceptor: {
    id: 'interceptor',
    name: 'Interceptor',
    slots: 3,
    baseInitiative: 2,
    baseHp: 2,
    cost: 6,
    rarity: 'common',
    blurb: 'Fast and fragile. 3 slots, fires early, and dodges the first hit of each fight.',
  },
  // Iteration 36: reprice 12 -> 9cr. Used to arrive pre-fitted with the
  // lure beacon (a bundled 5cr identity part) — now hulls are pure bases
  // (see STARTING_FIT in reducer.ts), so the bundle is gone, but a 6-HP
  // wall is still the roster's best durability base and doesn't refund
  // the part's full value.
  // Iteration 41: 9 -> 12cr — every purchasable hull now arrives with at
  // least one weapon (an empty "durable protector" that can't fight back
  // read wrong), bumped by the Ion cannon's own 3cr price.
  bastion: {
    id: 'bastion',
    name: 'Bastion',
    slots: 3,
    baseInitiative: 0,
    baseHp: 6,
    cost: 12,
    rarity: 'rare',
    maxWeapons: 1,
    blurb: 'Durable protector. 3 slots, at most 1 weapon. Arrives fitted with an ion cannon.',
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
  dreadnought: {
    id: 'dreadnought',
    name: 'Dreadnought',
    slots: 8,
    baseInitiative: 0,
    baseHp: 8,
    cost: 30,
    rarity: 'legendary',
    maxWeapons: 4,
    blurb: 'One giant instead of Flagship-plus-escorts. 8 slots, max 4 weapons. Arrives fitted with 2 ion cannons and a Gauss shield.',
  },
  // The midrange step: no gimmick, no cap, priced as the real "second
  // ship" investment between a cheap Interceptor and a premium Dreadnought.
  'light-cruiser': {
    id: 'light-cruiser',
    name: 'Cruiser',
    slots: 4,
    baseInitiative: 1,
    baseHp: 4,
    cost: 22,
    rarity: 'epic',
    blurb: 'No gimmick — the only escort that can carry a real multi-weapon loadout. Arrives fitted with an ion cannon and a Gauss shield.',
  },
  // 5 slots for less than a 3-slot Bastion used to be the exact
  // underpricing this pass corrects — still cheaper than the Cruiser (its
  // ceiling is genuinely lower: a cargo hull leaning into utility slots,
  // not raw combat), but no longer a strictly-better slot count for less.
  // Iteration 41: 15 -> 18cr, an Ion cannon bundled in (see Bastion's note).
  freighter: {
    id: 'freighter',
    name: 'Freighter',
    slots: 5,
    baseInitiative: 0,
    baseHp: 3,
    cost: 18,
    rarity: 'rare',
    maxWeapons: 2,
    blurb: 'Built for freight, not fighting. 5 slots, at most 2 weapons. Arrives fitted with an ion cannon.',
  },
  // Iteration 41: 3 -> 4cr, arrives with a Light missile — even the
  // cheapest hull in the yard can throw one punch.
  derelict: {
    id: 'derelict',
    name: 'Derelict',
    slots: 2,
    baseInitiative: 0,
    baseHp: 2,
    cost: 4,
    rarity: 'common',
    blurb: 'Barely flight-worthy. 2 slots, the weakest hull in the yard. Arrives fitted with a light missile.',
  },

  // Iteration 36: replaces the five retired support hulls below as the
  // roster's one cheap utility carrier — the natural home for an aura or
  // active part now that those parts are player-assembled, not bundled.
  // Iteration 41: 6 -> 8cr, a Light missile bundled in.
  corvette: {
    id: 'corvette',
    name: 'Corvette',
    slots: 3,
    baseInitiative: 1,
    baseHp: 2,
    cost: 8,
    rarity: 'common',
    maxWeapons: 1,
    blurb: 'A cheap, thin utility hull. 3 slots, at most 1 weapon. Arrives fitted with a light missile.',
  },

  // --- Legacy support hulls (iteration 23, retired iteration 36) ---------
  // Each used to arrive pre-fitted with a bundled signature part — identity
  // that now lives on the part alone (any hull can carry it). Stripped of
  // that bundle, frigate/ew-cutter/disruptor-cutter are stat-identical to
  // the new Corvette and aegis is a worse Derelict at 3x the price, so none
  // has a base identity left to keep. Removed from PURCHASABLE_FRAME_IDS —
  // no shop ever offers one again — but kept here (with a full Frame entry)
  // so an existing save carrying one still loads and derives stats
  // correctly. Do not resurrect without giving each a genuine base-level
  // reason to exist (see plans/parking-lot.md's "per-hull innate quirks").
  frigate: {
    id: 'frigate',
    name: 'Signal Frigate',
    slots: 3,
    baseInitiative: 1,
    baseHp: 2,
    cost: 7,
    rarity: 'common',
    maxWeapons: 1,
    blurb: 'A coordination hull, not a combatant. 3 slots, at most 1 weapon.',
  },
  aegis: {
    id: 'aegis',
    name: 'Aegis Relay',
    slots: 2,
    baseInitiative: 0,
    baseHp: 2,
    cost: 9,
    rarity: 'common',
    maxWeapons: 1,
    blurb: 'Thin hull built to broadcast a shield harmonic. 2 slots.',
  },
  tender: {
    id: 'tender',
    name: 'Repair Tender',
    slots: 3,
    baseInitiative: 0,
    baseHp: 3,
    cost: 8,
    rarity: 'common',
    maxWeapons: 1,
    blurb: 'Carries drone repair bays, not warheads. 3 slots, at most 1 weapon.',
  },
  'ew-cutter': {
    id: 'ew-cutter',
    name: 'EW Cutter',
    slots: 3,
    baseInitiative: 1,
    baseHp: 2,
    cost: 8,
    rarity: 'common',
    maxWeapons: 1,
    blurb: 'Jams enemy targeting systems before the shooting starts. 3 slots, at most 1 weapon.',
  },
  'disruptor-cutter': {
    id: 'disruptor-cutter',
    name: 'Disruptor Cutter',
    slots: 3,
    baseInitiative: 1,
    baseHp: 2,
    cost: 8,
    rarity: 'common',
    maxWeapons: 1,
    blurb: 'Strips enemy shields before the shooting starts. 3 slots, at most 1 weapon.',
  },
};

export const MAX_FLEET_SIZE = 4;

// Every frame a shop can offer — the Flagship ('cruiser') is the one
// exception, never purchasable (it's the single starting ship the run's
// upgrades accrete onto). Single source of truth for both the reducer's
// random shop-offer draw and any UI that needs the full purchasable set.
// Iteration 36: the five legacy support hulls above are deliberately
// excluded — see their FRAMES comment.
export const PURCHASABLE_FRAME_IDS: Exclude<FrameId, 'cruiser'>[] = [
  'interceptor',
  'bastion',
  'dreadnought',
  'light-cruiser',
  'freighter',
  'derelict',
  'corvette',
];

export function getFrame(id: FrameId): Frame {
  return FRAMES[id];
}
