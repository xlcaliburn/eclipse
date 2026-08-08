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
  // Combat: withdraw once round 1 resolves if the player fleet's surviving
  // HP fraction is below this multiple of the enemy's — e.g. 0.5 means
  // "retreat once we're worse off than half the enemy's remaining
  // strength," matching a real player's "this is going badly" read.
  withdrawHpRatio: number;
  // Whether this archetype holds stat-ladder parts unequipped for a later
  // Foundry fuse (shipyard-only) instead of always equipping on sight —
  // the Foundry only has anything to consume if something was held back.
  hoardsForFoundry: boolean;
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
    framePriority: ['interceptor', 'corvette', 'bastion'],
    fleetCap: 3,
    repairThreshold: 0.4,
    withdrawHpRatio: 0.4,
    hoardsForFoundry: false,
    routeBias: {},
  },
  'tank-taunt': {
    label: 'Tank-taunt (Bastion + lure)',
    partPriority: ['lure', 'hull2', 'shield2', 'reactive', 'plasma', 'hull2', 'shield2', 'hull3', 'shield3', 'plasma'],
    framePriority: ['bastion', 'interceptor'],
    fleetCap: 2,
    repairThreshold: 0.5,
    withdrawHpRatio: 0.3, // a tank absorbs more before bailing
    hoardsForFoundry: false,
    routeBias: { repair: 15 },
  },
  'alpha-missile': {
    label: 'Alpha-missile (racks + flak)',
    partPriority: ['missile', 'torpedo', 'flak', 'missile', 'comp2', 'torpedo', 'hull1', 'comp3', 'flak2', 'torpedo'],
    framePriority: ['interceptor', 'corvette'],
    fleetCap: 3,
    repairThreshold: 0.4,
    withdrawHpRatio: 0.4,
    hoardsForFoundry: false,
    routeBias: {},
  },
  outspeed: {
    label: 'Outspeed (init ladder + drives)',
    partPriority: ['init3', 'ion', 'comp2', 'init2', 'plasma', 'hull1', 'shield1', 'comp3', 'init2', 'plasma'],
    framePriority: ['interceptor', 'corvette'],
    fleetCap: 3,
    repairThreshold: 0.4,
    withdrawHpRatio: 0.4,
    hoardsForFoundry: false,
    routeBias: {},
  },
  wide: {
    label: 'Wide (hull count first)',
    partPriority: ['ion', 'ion', 'ion', 'ion', 'ion', 'ion', 'comp1', 'hull1', 'comp1', 'hull1'],
    framePriority: ['interceptor', 'corvette', 'interceptor', 'corvette'],
    fleetCap: 4,
    repairThreshold: 0.35,
    withdrawHpRatio: 0.4,
    hoardsForFoundry: false,
    routeBias: { shop: 15, shipyard: 15 }, // wide needs more shop visits to fill more hulls
  },
  tall: {
    label: 'Tall (Flagship + Foundry)',
    partPriority: ['plasma', 'comp2', 'hull2', 'shield1', 'plasma', 'comp3', 'antimatter', 'init3', 'hull3', 'shield2'],
    framePriority: [], // never buys an escort — everything into the Flagship
    fleetCap: 1,
    repairThreshold: 0.4,
    withdrawHpRatio: 0.45, // one hull lost is the whole run — bail earlier
    hoardsForFoundry: true,
    routeBias: { shipyard: 20 }, // the Foundry lives there
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
