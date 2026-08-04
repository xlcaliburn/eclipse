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
}

export const COMMANDERS: Record<CommanderId, Commander> = {
  merchant: {
    id: 'merchant',
    name: 'The Merchant',
    description:
      '+2 credits per combat won. Shop rerolls cost 1 credit instead of 2. Carries 2 commodity lots instead of ' +
      '1, buys them for 3 credits instead of 4, and hires mercenaries for 8 credits instead of 12. Doctrine: ' +
      'buy power, don’t earn it — shop-to-shop, skip the marginal fights, arrive at the boss rich.',
  },
  engineer: {
    id: 'engineer',
    name: 'The Engineer',
    description:
      'Every surviving ship repairs 1 damage after each combat won (stacks with regenerative plating). Any ' +
      'repair that heals past what a ship needs banks the excess as temporary armor for its next fight (cap 2 ' +
      'per ship) — even a full heal at a repair yard banks a point. Doctrine: take the fights everyone else ' +
      'routes around; the carryover spiral works for you instead of against you.',
  },
  warlord: {
    id: 'warlord',
    name: 'The Warlord',
    description:
      'The Flagship can hold 2 permanent upgrades instead of 1, starts with one already fitted, and the ' +
      'Dreadnought costs 5 credits less. Doctrine: one terrifying capital ship. No screen to hide behind — focus ' +
      'fire, missile alphas, and area weapons all hit harder against one or two hulls.',
  },
  spymaster: {
    id: 'spymaster',
    name: 'The Spymaster',
    description:
      'Vision extends 2 columns instead of 1. Every combat win uncovers something: a lane, the next enemy ' +
      'upgrade, the boss ahead, or more of the chart. Salvage claims cost no heat — they know the patrol ' +
      'schedules. Doctrine: fight the minimum, farm every wreck risk-free, arrive rich and unwatched.',
  },
  admiral: {
    id: 'admiral',
    name: 'The Admiral',
    description:
      'Starts with a free Interceptor (ion cannon fitted) — the fleet begins at 2 ships. Fleet cap raised to 5. ' +
      'Ship frames cost 25% less. Any ship with 3 or more kills gains +1 initiative — an ace pilot. Doctrine: ' +
      'cheap hulls early, elite nodes are food, and losing a veteran actually hurts.',
  },
};

// Warlord's old id is kept (a reworked doctrine on the same commander, not
// a new one) — only the Admiral is genuinely new, so the shuffle pool below
// grows from 4 to 5 with one addition.
const COMMANDER_IDS: CommanderId[] = ['merchant', 'engineer', 'warlord', 'spymaster', 'admiral'];

export function getCommander(id: CommanderId): Commander {
  return COMMANDERS[id];
}

function shuffle<T>(items: T[], rng: RngFn): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 3 of the 5 commanders, seeded — the player picks one of these three to
// start the run with.
export function drawCommanderChoices(rng: RngFn): CommanderId[] {
  return shuffle(COMMANDER_IDS, rng).slice(0, 3);
}
