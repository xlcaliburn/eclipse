import type { RngFn } from './rng';

export type CommanderId = 'merchant' | 'engineer' | 'warlord' | 'spymaster';

export interface Commander {
  id: CommanderId;
  name: string;
  description: string;
}

export const COMMANDERS: Record<CommanderId, Commander> = {
  merchant: {
    id: 'merchant',
    name: 'The Merchant',
    description: '+2 credits per combat won. Shop rerolls cost 1 credit instead of 2.',
  },
  engineer: {
    id: 'engineer',
    name: 'The Engineer',
    description: 'Every surviving ship repairs 1 damage after each combat won (stacks with regenerative plating).',
  },
  warlord: {
    id: 'warlord',
    name: 'The Warlord',
    description: 'Starts with a free Interceptor (ion cannon fitted) — the fleet begins at 2 ships.',
  },
  spymaster: {
    id: 'spymaster',
    name: 'The Spymaster',
    description: 'Vision extends 2 columns instead of 1. Earns double intel from every combat win.',
  },
};

const COMMANDER_IDS: CommanderId[] = ['merchant', 'engineer', 'warlord', 'spymaster'];

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

// 3 of the 4 commanders, seeded — the player picks one of these three to
// start the run with.
export function drawCommanderChoices(rng: RngFn): CommanderId[] {
  return shuffle(COMMANDER_IDS, rng).slice(0, 3);
}
