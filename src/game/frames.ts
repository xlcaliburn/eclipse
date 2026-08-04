// Internal id stays 'cruiser' (renaming would churn every test fixture) —
// its display name is "Flagship" everywhere the player sees it: it's the
// one-per-fleet ship the run's upgrades accrete onto. The iteration-9
// purchasable frame is internally 'light-cruiser' (display name "Cruiser",
// free again since the Flagship rename) — a distinct id, since 'cruiser'
// is already taken.
export type FrameId =
  | 'cruiser'
  | 'interceptor'
  | 'bastion'
  | 'dreadnought'
  | 'light-cruiser'
  | 'freighter'
  | 'derelict'
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
    blurb: 'Roomy workhorse. 6 slots, slow.',
  },
  interceptor: {
    id: 'interceptor',
    name: 'Interceptor',
    slots: 3,
    baseInitiative: 2,
    baseHp: 2,
    cost: 6,
    blurb: 'Fast and fragile. 3 slots, fires early, and dodges the first hit of each fight.',
  },
  bastion: {
    id: 'bastion',
    name: 'Bastion',
    slots: 3,
    baseInitiative: 0,
    baseHp: 6,
    cost: 12,
    maxWeapons: 1,
    blurb: 'Durable protector. 3 slots, at most 1 weapon, arrives with a lure beacon.',
  },
  dreadnought: {
    id: 'dreadnought',
    name: 'Dreadnought',
    slots: 8,
    baseInitiative: 0,
    baseHp: 8,
    cost: 20,
    maxWeapons: 4,
    blurb: 'One giant instead of Flagship-plus-escorts. 8 slots, max 4 weapons.',
  },
  'light-cruiser': {
    id: 'light-cruiser',
    name: 'Cruiser',
    slots: 4,
    baseInitiative: 1,
    baseHp: 4,
    cost: 10,
    blurb: 'No gimmick — the only escort that can carry a real multi-weapon loadout.',
  },
  freighter: {
    id: 'freighter',
    name: 'Freighter',
    slots: 5,
    baseInitiative: 0,
    baseHp: 3,
    cost: 8,
    maxWeapons: 2,
    blurb: 'Built for freight, not fighting. 5 slots for the price of light armor, at most 2 weapons.',
  },
  derelict: {
    id: 'derelict',
    name: 'Derelict',
    slots: 2,
    baseInitiative: 0,
    baseHp: 2,
    cost: 3,
    blurb: 'Barely flight-worthy. 2 slots, the weakest hull in the yard — you get what you pay for.',
  },

  // --- Support hulls (iteration 23): cheap, thin, capped at 1 weapon —
  // none of these out-fight a Cruiser. They buy a fleet-wide effect
  // instead, via the signature active part each arrives pre-fitted with. ---
  frigate: {
    id: 'frigate',
    name: 'Signal Frigate',
    slots: 3,
    baseInitiative: 1,
    baseHp: 2,
    cost: 7,
    maxWeapons: 1,
    blurb: 'A coordination hull, not a combatant. 3 slots, at most 1 weapon, arrives with a tactical relay pre-wired.',
  },
  aegis: {
    id: 'aegis',
    name: 'Aegis Relay',
    slots: 2,
    baseInitiative: 0,
    baseHp: 2,
    cost: 9,
    maxWeapons: 1,
    blurb: "Broadcasts a shield harmonic to the whole fleet. 2 slots, thin hull — everyone feels it when this one goes down.",
  },
  tender: {
    id: 'tender',
    name: 'Repair Tender',
    slots: 3,
    baseInitiative: 0,
    baseHp: 3,
    cost: 8,
    maxWeapons: 1,
    blurb: "Carries drone repair bays, not warheads. 3 slots, at most 1 weapon, keeps the fleet's most-battered hull in the fight.",
  },
  'ew-cutter': {
    id: 'ew-cutter',
    name: 'EW Cutter',
    slots: 3,
    baseInitiative: 1,
    baseHp: 2,
    cost: 8,
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
    maxWeapons: 1,
    blurb: 'Strips enemy shields before the shooting starts. 3 slots, at most 1 weapon.',
  },
};

export const MAX_FLEET_SIZE = 4;

// Every frame a shop can offer — the Flagship ('cruiser') is the one
// exception, never purchasable (it's the single starting ship the run's
// upgrades accrete onto). Single source of truth for both the reducer's
// random shop-offer draw and any UI that needs the full purchasable set.
export const PURCHASABLE_FRAME_IDS: Exclude<FrameId, 'cruiser'>[] = [
  'interceptor',
  'bastion',
  'dreadnought',
  'light-cruiser',
  'freighter',
  'derelict',
  'frigate',
  'aegis',
  'tender',
  'ew-cutter',
  'disruptor-cutter',
];

export function getFrame(id: FrameId): Frame {
  return FRAMES[id];
}
