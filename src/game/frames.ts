// Internal id stays 'cruiser' (renaming would churn every test fixture) —
// its display name is "Flagship" everywhere the player sees it: it's the
// one-per-fleet ship the run's upgrades accrete onto. The iteration-9
// purchasable frame is internally 'light-cruiser' (display name "Cruiser",
// free again since the Flagship rename) — a distinct id, since 'cruiser'
// is already taken.
export type FrameId = 'cruiser' | 'interceptor' | 'bastion' | 'dreadnought' | 'light-cruiser';

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
};

export const MAX_FLEET_SIZE = 4;

export function getFrame(id: FrameId): Frame {
  return FRAMES[id];
}
