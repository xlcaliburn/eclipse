export type CardId = 'bulkheads' | 'volley';

export type CardKind = 'contingent' | 'instant';

// Iteration 7: cards are found, never bought — the shop no longer sells
// them, so there's no credit price to track. The pool is deliberately tiny
// and effects too swingy to make good permanent equipment (`overdrive`,
// `uplink`, `patch`, `ram`, and `pds` were retired — migrated to active
// parts, or in `pds`'s case already absorbed by the iteration-5 flak
// battery).
export interface Card {
  id: CardId;
  name: string;
  kind: CardKind;
  description: string;
}

export const CARDS: Card[] = [
  {
    id: 'bulkheads',
    name: 'Emergency bulkheads',
    kind: 'contingent',
    description: 'The first time one of your ships would be destroyed this fight, it survives at 1 HP instead.',
  },
  {
    id: 'volley',
    name: 'Second volley',
    kind: 'instant',
    description: 'Play before a cannon round: this round, every player ship\'s cannon dice fire twice.',
  },
];

const CARDS_BY_ID: Record<CardId, Card> = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, Card>;

export function getCard(id: CardId): Card {
  const card = CARDS_BY_ID[id];
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export const MAX_HAND_SIZE = 5;
