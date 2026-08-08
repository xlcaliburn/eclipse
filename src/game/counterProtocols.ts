import { pickOne } from './rng';
import type { RngFn } from './rng';

// Iteration 30: act 2's answer to iteration 28's protocol draft. Whatever
// tier the player drafts (silver/gold/prismatic), the enemy fleet gains a
// same-tier "counter-protocol" for all of act 2 — a smaller, tier-matched
// answer drawn from its own pool, not a literal mirror of the player's pick
// (most player protocols — shop discounts, fleet caps — have no sensible
// enemy-side mirror anyway). Shown on the draft card *before* the pick:
// transparency law, the player weighs "big buff + big enemy answer" against
// "small buff + small enemy answer" with full information.
//
// Mirrors protocols.ts structurally on purpose — same shape, same draw
// pattern, same reasoning for keeping the three tier pools separate lists.

export type CounterProtocolTier = 'silver' | 'gold' | 'prismatic';

export type CounterProtocolId =
  // Silver — one escalation's worth
  | 'hardened-veterans'
  | 'targeting-arrays'
  | 'evasive-doctrine'
  // Gold — a build-shaped answer
  | 'flak-screens'
  | 'piercing-munitions'
  | 'overdrive-signals'
  // Prismatic — rule-breaker feel, still pure stats
  | 'ablative-plating'
  | 'attack-wings'
  | 'overcharged-munitions';

export interface CounterProtocolDef {
  id: CounterProtocolId;
  tier: CounterProtocolTier;
  name: string;
  blurb: string;
}

export const COUNTER_PROTOCOLS: Record<CounterProtocolId, CounterProtocolDef> = {
  'hardened-veterans': {
    id: 'hardened-veterans',
    tier: 'silver',
    name: 'Hardened veterans',
    blurb: 'Every enemy ship gains +1 HP.',
  },
  'targeting-arrays': {
    id: 'targeting-arrays',
    tier: 'silver',
    name: 'Targeting arrays',
    blurb: 'Every enemy ship gains +1 computer.',
  },
  'evasive-doctrine': {
    id: 'evasive-doctrine',
    tier: 'silver',
    name: 'Evasive doctrine',
    blurb: 'Every enemy ship gains +1 piloting.',
  },
  'flak-screens': {
    id: 'flak-screens',
    tier: 'gold',
    name: 'Flak screens',
    blurb: 'Every enemy ship gains flak 1 — answers missile builds.',
  },
  'piercing-munitions': {
    id: 'piercing-munitions',
    tier: 'gold',
    name: 'Piercing munitions',
    blurb: "Every enemy cannon ignores 1 point of your ships' piloting — answers piloting stacking.",
  },
  'overdrive-signals': {
    id: 'overdrive-signals',
    tier: 'gold',
    name: 'Overdrive signals',
    blurb: 'Every enemy ship gains +2 initiative — threatens Outspeed against slow fleets.',
  },
  'ablative-plating': {
    id: 'ablative-plating',
    tier: 'prismatic',
    name: 'Ablative plating',
    blurb: 'Every enemy ship negates the first hit it takes each combat.',
  },
  'attack-wings': {
    id: 'attack-wings',
    tier: 'prismatic',
    name: 'Attack wings',
    blurb: 'Every enemy group gains +1 ship — a solo enemy gains a wingman instead.',
  },
  'overcharged-munitions': {
    id: 'overcharged-munitions',
    tier: 'prismatic',
    name: 'Overcharged munitions',
    blurb: 'Every enemy cannon die deals +1 damage.',
  },
};

export function getCounterProtocol(id: CounterProtocolId): CounterProtocolDef {
  return COUNTER_PROTOCOLS[id];
}

const SILVER_IDS: CounterProtocolId[] = ['hardened-veterans', 'targeting-arrays', 'evasive-doctrine'];
const GOLD_IDS: CounterProtocolId[] = ['flak-screens', 'piercing-munitions', 'overdrive-signals'];
const PRISMATIC_IDS: CounterProtocolId[] = ['ablative-plating', 'attack-wings', 'overcharged-munitions'];

// Three offers, always [silver, gold, prismatic] — index-paired with
// drawProtocolOffers's own [silver, gold, prismatic] output (protocols.ts),
// since that's the fixed tier order both draws always return. Called
// immediately after drawProtocolOffers, same rng stream, same 9.1
// reload-can't-reroll discipline as everything else drawn at CONTINUE.
export function drawCounterProtocols(rng: RngFn): CounterProtocolId[] {
  return [pickOne(SILVER_IDS, rng), pickOne(GOLD_IDS, rng), pickOne(PRISMATIC_IDS, rng)];
}
