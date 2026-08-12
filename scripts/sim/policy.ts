import type { CommanderId } from '../../src/game/commanders';
import type { FrameId } from '../../src/game/frames';
import type { PartId } from '../../src/game/types';

// Iteration 45.2: one config object per build archetype, consumed by
// agent.ts's decision functions. This is deliberately a data table, not N
// separate decision engines — every archetype shares the same route/shop/
// combat/draft LOGIC (agent.ts), differing only in what it prioritizes.
// That keeps the six archetypes honest comparisons of "what to buy," not
// six independently-tuned bots that might differ in skill as well as
// build.
export interface PolicyConfig {
  label: string;
  // Shop priority, cheapest-useful-first — bought in order as credits and
  // slots allow (mirrors budget.ts's list, but this one drives REAL shop
  // offers via the reducer, so items not currently in stock are simply
  // skipped rather than assumed available).
  partPriority: PartId[];
  // Preferred escort frame when buying a new hull, tried in order (falls
  // back to the next when unavailable / can't afford it this visit).
  framePriority: Exclude<FrameId, 'cruiser'>[];
  fleetCap: number; // this archetype's own soft cap, <= the commander's real cap
  // Damage-ratio (0-1, ship damage / max HP) above which a repair/heal
  // option is chosen over spending on new gear.
  repairThreshold: number;
  // Route-choice node-type score deltas, layered on the shared floor
  // (ported from the old actRun.ts chooseNode) — same table shape as that
  // function's commander bias switch, generalized to archetype.
  routeBias: Partial<Record<'combat' | 'elite' | 'shop' | 'shipyard' | 'repair' | 'event', number>>;
}

const BASE_PART_PRIORITY: PartId[] = [
  'hull1',
  'shield1',
  'plasma',
  'comp2',
  'hull2',
  'shield2',
  'plasma',
  'comp3',
  'antimatter',
  'init3',
];

export const ARCHETYPES: Record<string, PolicyConfig> = {
  balanced: {
    label: 'Balanced (the floor)',
    partPriority: BASE_PART_PRIORITY,
    // Iteration 52.6: widened past the original 3 — with 17 purchasable
    // frames now drawing from the SAME shop-offer slots, leaving this list
    // untouched would only dilute how often interceptor/corvette/bastion
    // themselves appear (more competing ids sharing the draw), with no
    // offsetting upside from the new roster — exactly the "silently
    // under-build" risk 52.6 flags. Frigate (common, a real 2nd weapon
    // slot for 7cr) and Gunboat (rare, 3 dedicated weapon slots) are
    // straightforward upgrades on the existing picks' own doctrine, not a
    // new one.
    framePriority: ['interceptor', 'corvette', 'bastion', 'frigate', 'gunboat'],
    fleetCap: 3,
    repairThreshold: 0.4,
    routeBias: {},
  },
  'tank-taunt': {
    label: 'Tank-taunt (Bastion + lure)',
    partPriority: ['lure', 'hull2', 'shield2', 'reactive', 'plasma', 'hull2', 'shield2', 'hull3', 'shield3', 'plasma'],
    // Aegis (legendary, innate taunt) is this archetype's own doctrine
    // taken to its logical endpoint — added last since it's only ever
    // reachable act-2-shipyard, late.
    framePriority: ['bastion', 'interceptor', 'aegis'],
    fleetCap: 2,
    repairThreshold: 0.5,
    routeBias: { repair: 15 },
  },
  'alpha-missile': {
    label: 'Alpha-missile (racks + flak)',
    partPriority: ['missile', 'torpedo', 'flak', 'missile', 'comp2', 'torpedo', 'hull1', 'comp3', 'flak2', 'torpedo'],
    // Gunboat's 3 dedicated weapon slots are a direct fit for a
    // volume-of-fire doctrine, missile or cannon alike.
    framePriority: ['interceptor', 'corvette', 'gunboat'],
    fleetCap: 3,
    repairThreshold: 0.4,
    routeBias: {},
  },
  outspeed: {
    label: 'Outspeed (init ladder + drives)',
    partPriority: ['init3', 'ion', 'comp2', 'init2', 'plasma', 'hull1', 'shield1', 'comp3', 'init2', 'plasma'],
    // Destroyer (epic, base initiative 3 — the highest below Valkyrie) is
    // this archetype's doctrine as a hull identity, not just a part stack.
    framePriority: ['interceptor', 'corvette', 'destroyer'],
    fleetCap: 3,
    repairThreshold: 0.4,
    routeBias: {},
  },
  wide: {
    label: 'Wide (hull count first)',
    partPriority: ['ion', 'ion', 'ion', 'ion', 'ion', 'ion', 'comp1', 'hull1', 'comp1', 'hull1'],
    // Derelict (4cr, the cheapest hull in the yard) and Frigate (7cr, twin
    // guns) both fit "as many bodies as credits allow" better than a 2nd
    // and 3rd Interceptor/Corvette repeat did.
    framePriority: ['interceptor', 'corvette', 'derelict', 'frigate'],
    fleetCap: 4,
    repairThreshold: 0.35,
    routeBias: { shop: 15, shipyard: 15 }, // wide needs more shop visits to fill more hulls
  },
  tall: {
    // 2026-08-08: was "Tall (Flagship + Foundry)" — the Foundry (a
    // permanent stat-fuse purchase, shipyard-only) was removed from the
    // game entirely; this archetype's identity is now just "one hull,
    // everything into it," same doctrine minus that one purchase option.
    label: 'Tall (Flagship, single hull)',
    partPriority: ['plasma', 'comp2', 'hull2', 'shield1', 'plasma', 'comp3', 'antimatter', 'init3', 'hull3', 'shield2'],
    framePriority: [], // never buys an escort — everything into the Flagship
    fleetCap: 1,
    repairThreshold: 0.4,
    // 2026-08-08: was `{ shipyard: 20 }` ("the Foundry lives there") — with
    // the Foundry gone and this archetype never buying a hull
    // (framePriority: []), a shipyard visit has nothing for it (shipyards
    // sell no parts) — no reason to prioritize one over a store any more.
    routeBias: {},
  },
};

// Commander-specific route-score deltas, ported verbatim from the old
// actRun.ts's chooseNode switch — kept here (not agent.ts) so the whole
// route-scoring table lives in one data-shaped place.
export const COMMANDER_ROUTE_BIAS: Partial<Record<CommanderId, Partial<Record<'combat' | 'elite' | 'shop' | 'shipyard' | 'event', number>>>> = {
  merchant: { shop: 30, shipyard: 30, combat: -15 },
  engineer: { combat: 20, elite: 10 },
  spymaster: { event: 5 },
  admiral: { elite: 15 },
};

// Every commander drafts the silver protocol by default — the floor every
// player can guarantee, per iteration 31-M3's own measurement convention.
// index 0 is always silver (drawProtocolOffers's fixed [silver, gold,
// prismatic] order — see protocols.ts).
export const DEFAULT_PROTOCOL_INDEX: 0 | 1 | 2 = 0;
