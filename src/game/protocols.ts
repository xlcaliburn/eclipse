import type { CommanderId } from './commanders';
import type { PlayerShipState } from './types';
import type { RngFn } from './rng';

// Iteration 28: the act-1 boss reward gains a second layer on top of
// iteration 24's guaranteed upgrade — a one-time, 1-of-3 augment draft
// spanning three tiers (silver stat value / gold build-arounds / prismatic
// rule-breakers with a stated structural cost). Once per run: act 2 ends at
// the final boss, so there is no second draft. See plans/iteration-28.md.

export type ProtocolTier = 'silver' | 'gold' | 'prismatic';

export type ProtocolId =
  // Silver
  | 'reinforced-bulkheads'
  | 'munitions-contracts'
  | 'salvage-rigs'
  | 'rapid-drydocks'
  // Gold
  | 'overspeed-protocols'
  | 'ace-pipeline'
  | 'twin-linked-mounts'
  | 'bastion-doctrine'
  | 'deep-space-relays'
  // Prismatic
  | 'ghost-fleet-protocol'
  | 'lone-flagship'
  | 'armada-mandate'
  | 'alpha-doctrine';

export interface ProtocolDef {
  id: ProtocolId;
  tier: ProtocolTier;
  name: string;
  blurb: string;
  // Prismatics only — the visible structural cost, shown on the draft card
  // right alongside the benefit. Silver/gold protocols have no cost line;
  // their price is simply "not picking one of the other two offers."
  cost?: string;
}

export const PROTOCOLS: Record<ProtocolId, ProtocolDef> = {
  'reinforced-bulkheads': {
    id: 'reinforced-bulkheads',
    tier: 'silver',
    name: 'Reinforced bulkheads',
    blurb: '+1 max HP on every ship, current and future.',
  },
  'munitions-contracts': {
    id: 'munitions-contracts',
    tier: 'silver',
    name: 'Munitions contracts',
    blurb: 'Parts cost 2cr less in every shop (never below 1cr).',
  },
  'salvage-rigs': {
    id: 'salvage-rigs',
    tier: 'silver',
    name: 'Salvage rigs',
    blurb: '+2cr for every combat won.',
  },
  'rapid-drydocks': {
    id: 'rapid-drydocks',
    tier: 'silver',
    name: 'Rapid drydocks',
    blurb: 'A full repair also banks +1 over-repair on every ship, like the Engineer doctrine.',
  },
  'overspeed-protocols': {
    id: 'overspeed-protocols',
    tier: 'gold',
    name: 'Overspeed protocols',
    blurb: 'Your ships need only a 3-point initiative edge (not 4) to earn an Outspeed bonus activation.',
  },
  'ace-pipeline': {
    id: 'ace-pipeline',
    tier: 'gold',
    name: 'Ace pipeline',
    blurb: 'Any ship with 3+ kills gains +1 initiative, like the Admiral doctrine.',
  },
  'twin-linked-mounts': {
    id: 'twin-linked-mounts',
    tier: 'gold',
    name: 'Twin-linked mounts',
    blurb: "Each ship's first equipped weapon fires one extra die.",
  },
  'bastion-doctrine': {
    id: 'bastion-doctrine',
    tier: 'gold',
    name: 'Bastion doctrine',
    blurb: 'Taunting ships gain +1 piloting.',
  },
  'deep-space-relays': {
    id: 'deep-space-relays',
    tier: 'gold',
    name: 'Deep-space relays',
    blurb: 'Act 2 opens with every node type already visible — the fog is gone from the moment you cross over.',
  },
  'ghost-fleet-protocol': {
    id: 'ghost-fleet-protocol',
    tier: 'prismatic',
    name: 'Ghost fleet protocol',
    blurb: 'A ship that would be destroyed withdraws instead, critically damaged but alive.',
    cost: 'Every repair costs double for the rest of the run.',
  },
  'lone-flagship': {
    id: 'lone-flagship',
    tier: 'prismatic',
    name: 'Lone flagship',
    blurb: 'Immediately scraps every escort for half their frame value; the Flagship permanently gains +2 slots and +2 max HP.',
    cost: 'Fleet cap becomes 1 for the rest of the run.',
  },
  'armada-mandate': {
    id: 'armada-mandate',
    tier: 'prismatic',
    name: 'Armada mandate',
    blurb: 'Fleet cap +2 and every purchasable frame costs 50% less.',
    cost: 'Every shop stocks one fewer part.',
  },
  'alpha-doctrine': {
    id: 'alpha-doctrine',
    tier: 'prismatic',
    name: 'Alpha doctrine',
    blurb: 'Your cannons fire in the opening missile phase too — a true alpha strike.',
    cost: 'Your ships count piloting 0 during the opening exchange (the missile phase and cannon round 1).',
  },
};

export function getProtocol(id: ProtocolId): ProtocolDef {
  return PROTOCOLS[id];
}

export function hasProtocol(protocols: ProtocolId[] | undefined, id: ProtocolId): boolean {
  return !!protocols?.includes(id);
}

const SILVER_IDS: ProtocolId[] = ['reinforced-bulkheads', 'munitions-contracts', 'salvage-rigs', 'rapid-drydocks'];
const GOLD_IDS: ProtocolId[] = [
  'overspeed-protocols',
  'ace-pipeline',
  'twin-linked-mounts',
  'bastion-doctrine',
  'deep-space-relays',
];
const PRISMATIC_IDS: ProtocolId[] = ['ghost-fleet-protocol', 'lone-flagship', 'armada-mandate', 'alpha-doctrine'];

function pickOne(pool: ProtocolId[], rng: RngFn): ProtocolId {
  return pool[Math.floor(rng() * pool.length)];
}

// Three offers, always exactly one silver / one gold / one prismatic — the
// draft's whole point is that every offer is a real tier choice, not a
// chance at one. Filters offers that are redundant or nonsensical for the
// current run before drawing, same precedent as iteration 21's
// commander-conditional signature shop stock:
//   - Ace pipeline is dead weight under the Admiral (already has it).
//   - Lone Flagship needs a Flagship in the fleet to scrap escorts around;
//     if it was lost and recovery was declined, there's nothing to pivot
//     onto, so it's excluded rather than offered as a trap.
// Continues whatever rng stream the caller passes in — the reducer threads
// the run's own rng, so two players sharing a seed see the same offers
// (and diverge only on which they pick).
export function drawProtocolOffers(rng: RngFn, commanderId: CommanderId | undefined, fleet: PlayerShipState[]): ProtocolId[] {
  const hasFlagship = fleet.some((s) => s.frameId === 'cruiser');
  const gold = GOLD_IDS.filter((id) => !(id === 'ace-pipeline' && commanderId === 'admiral'));
  const prismatic = PRISMATIC_IDS.filter((id) => !(id === 'lone-flagship' && !hasFlagship));
  return [pickOne(SILVER_IDS, rng), pickOne(gold, rng), pickOne(prismatic, rng)];
}
