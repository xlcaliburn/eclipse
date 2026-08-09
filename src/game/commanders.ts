import { shuffle } from './rng';
import type { RngFn } from './rng';

// Iteration 21: the Warlord split into two — a wide fleet-of-cheap-hulls
// doctrine (the Admiral, new) and a tall one-capital-ship doctrine (the
// Warlord, reworked; keeps the id so old saves' commanderId still resolves).
// Five commanders now map onto four subsystems the game actually has —
// trade, attrition, veterancy/aggression (split wide/tall), heat/info —
// each changing which node the player routes toward, not just a stat.
export type CommanderId = 'merchant' | 'engineer' | 'warlord' | 'spymaster' | 'admiral';

export interface Commander {
  id: CommanderId;
  name: string;
  description: string;
  // 2026-08-08: the flavor description alone left players guessing at the
  // actual numbers behind it — these are the same mechanical effects,
  // spelled out plainly, point by point. Shown on the commander-select
  // screen alongside the prose above, not instead of it.
  bullets: string[];
}

export const COMMANDERS: Record<CommanderId, Commander> = {
  merchant: {
    id: 'merchant',
    name: 'The Merchant',
    description: 'Money is the doctrine — better prices everywhere, and a fleet that can simply buy its way through.',
    bullets: [
      'Commodity lots cost 3cr instead of 4cr',
      'Mercenary hires cost 3cr instead of 5cr',
      '+1 credit on every fight won',
    ],
  },
  engineer: {
    id: 'engineer',
    name: 'The Engineer',
    description: 'The fleet quietly repairs past where it should stop — damage that should be fatal barely slows it down.',
    bullets: [
      '+1 extra heal on every surviving ship after a win, stacking with Regenerative plating',
      "Healing past a ship's damage banks the excess as temporary HP instead of wasting it",
    ],
  },
  warlord: {
    id: 'warlord',
    name: 'The Warlord',
    description: 'Everything rides on one hull, built up past what a single ship should carry.',
    bullets: [
      'The Flagship can carry 3 augments instead of 1',
      'The Flagship gets +1 extra item slot',
      'Starts with one random augment already fitted to the Flagship',
      'The Dreadnought costs 5cr less',
    ],
  },
  spymaster: {
    id: 'spymaster',
    name: 'The Spymaster',
    description:
      'Sees further than anyone, on the map and in the fight — every wreck along the way is free money nobody notices, and every battle plays out on better intelligence.',
    bullets: [
      'Sees 2 columns ahead on the map instead of 1',
      'A free piece of intel after every fight won',
      'Salvage-claim events cost no heat',
      '3 command points per fight instead of 2',
      "Unlocks the Exploit weakness order — mark an enemy ship; your whole fleet gains +2 computer against it for the round",
      'Forewarned: +1 computer for the whole fleet during the missile phase and the first cannon round',
    ],
  },
  admiral: {
    id: 'admiral',
    name: 'The Admiral',
    description: 'Starts wide with extra hulls already in formation — more ships, cheaper ships, and veterans who only get sharper.',
    bullets: [
      'Fleet cap 5 instead of 4',
      'Starts with two free, ion-fitted Interceptors — the fleet begins at 3 ships',
      'Every hull costs 25% less',
      'Any ship with 3+ kills gains +1 initiative',
    ],
  },
};

// Warlord's old id is kept (a reworked doctrine on the same commander, not
// a new one) — only the Admiral is genuinely new, so the shuffle pool below
// grows from 4 to 5 with one addition.
const COMMANDER_IDS: CommanderId[] = ['merchant', 'engineer', 'warlord', 'spymaster', 'admiral'];

export function getCommander(id: CommanderId): Commander {
  return COMMANDERS[id];
}

// 3 of the 5 commanders, seeded — the player picks one of these three to
// start the run with.
export function drawCommanderChoices(rng: RngFn): CommanderId[] {
  return shuffle(COMMANDER_IDS, rng).slice(0, 3);
}
