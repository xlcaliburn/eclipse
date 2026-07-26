import { combatEnemyPool, hardestEnemyForAmbush } from './enemies';
import { globalColumn } from './map';
import { deriveStats } from './ship';
import { getPart } from './parts';
import { CARDS, getCard, MAX_HAND_SIZE } from './cards';
import type { RngFn } from './rng';
import type { EnemyDef, PartId, PlayerShipState, RunState } from './types';

export type EventId =
  | 'derelict-cruiser'
  | 'asteroid-field'
  | 'ancient-cache'
  | 'abandoned-arsenal'
  | 'intercepted-signal'
  | 'recon-probe'
  | 'sabotage-raid'
  | 'defector';

export interface EventDef {
  id: EventId;
  title: string;
  flavor: string;
  choiceALabel: string;
  choiceBLabel: string;
}

export const EVENTS: EventDef[] = [
  {
    id: 'derelict-cruiser',
    title: 'Derelict cruiser',
    flavor: 'A gutted hull drifts in the dark, systems long dead.',
    choiceALabel: 'Salvage the hull (+4 credits)',
    choiceBLabel: 'Crack the reactor (risky)',
  },
  {
    id: 'asteroid-field',
    title: 'Asteroid field',
    flavor: 'A dense field blocks the direct route.',
    choiceALabel: 'Thread the field (risky)',
    choiceBLabel: 'Detour (-2 credits)',
  },
  {
    id: 'ancient-cache',
    title: 'Ancient cache',
    flavor: 'A sealed Ancient container, still humming with power.',
    choiceALabel: 'Force it open — attracts a patrol',
    choiceBLabel: 'Leave it',
  },
  {
    id: 'abandoned-arsenal',
    title: 'Abandoned arsenal',
    flavor: 'Racks of unused reaction-card modules line the walls.',
    choiceALabel: 'Take a weapon crate',
    choiceBLabel: 'Sell the scrap (+3 credits)',
  },
  {
    id: 'intercepted-signal',
    title: 'Intercepted signal',
    flavor: 'Encrypted chatter about enemy fleet movements crosses your scanners.',
    choiceALabel: 'Decrypt it — reveal the next escalation',
    choiceBLabel: 'Sell the codes (+5 credits)',
  },
  {
    id: 'recon-probe',
    title: 'Recon probe',
    flavor: 'A dormant scout drone, still fuelled.',
    choiceALabel: "Launch it — scout next column's enemies",
    choiceBLabel: 'Strip it for parts (+4 credits)',
  },
  {
    id: 'sabotage-raid',
    title: 'Shipyard raid',
    flavor: 'A crippled enemy shipyard, still guarded but weakly.',
    choiceALabel: 'Hit the yard — cancel the next escalation (risky)',
    choiceBLabel: 'Too risky (+3 credits)',
  },
  {
    id: 'defector',
    title: 'Defector pilot',
    flavor: 'An enemy pilot signals for asylum, offering everything they know.',
    choiceALabel: 'Take them aboard — reveal all escalations',
    choiceBLabel: 'Turn them in (+6 credits)',
  },
];

const EVENTS_BY_ID: Record<EventId, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<
  EventId,
  EventDef
>;

export function getEvent(id: EventId): EventDef {
  return EVENTS_BY_ID[id];
}

export function drawEvent(rng: RngFn, excludeId?: EventId): EventId {
  const pool = EVENTS.filter((e) => e.id !== excludeId);
  const options = pool.length > 0 ? pool : EVENTS;
  return options[Math.floor(rng() * options.length)].id;
}

const FIVE_CREDIT_PARTS: PartId[] = ['plasma', 'missile', 'comp2', 'shield2', 'hull2'];
const SEVEN_CREDIT_PARTS: PartId[] = ['comp3', 'init3'];

function clampCredits(credits: number): number {
  return Math.max(0, credits);
}

function pickRandomShipIndex(fleet: PlayerShipState[], rng: RngFn): number {
  return Math.floor(rng() * fleet.length);
}

// Applies damage to one ship, capped so it always survives with >= 1 HP.
function applyCappedDamage(fleet: PlayerShipState[], shipIndex: number, amount: number): PlayerShipState[] {
  return fleet.map((ship, i) => {
    if (i !== shipIndex) return ship;
    const hp = deriveStats(ship.frameId, ship.equipped, ship.upgrades).hp;
    const maxDamage = hp - 1;
    return { ...ship, damage: Math.min(maxDamage, ship.damage + amount) };
  });
}

function randomPart(rng: RngFn, pool: PartId[]): PartId {
  return pool[Math.floor(rng() * pool.length)];
}

// Finds the scheduled escalation that lands soonest (by global column, so
// act 1's escalations — which land first chronologically — are always
// compared correctly against act 2's) and hasn't been revealed yet, or -1
// if none remain.
export function nextUnrevealedIndex(state: RunState): number {
  let bestIndex = -1;
  let bestGlobalColumn = Infinity;
  state.escalations.forEach((esc, i) => {
    if (esc.revealed) return;
    const global = globalColumn(esc.act, esc.landsAfterColumn);
    if (global < bestGlobalColumn) {
      bestGlobalColumn = global;
      bestIndex = i;
    }
  });
  return bestIndex;
}

export interface EventResolution {
  state: RunState;
  outcomeText: string;
  // Set when this choice leads straight into a fight (e.g. the ancient
  // cache's alarm attracts a patrol). The enemy is granted before the fight
  // and kept regardless of its outcome — losing the fight still ends the run.
  ambushEnemy?: EnemyDef;
}

// Pure resolver: given the event, the choice made, current run state, and an
// injected RNG, returns the updated state and flavor text for the outcome
// screen. Never destroys a ship (damage is always capped at hp - 1) and
// never sends credits negative.
export function resolveEventChoice(
  eventId: EventId,
  choiceIndex: 0 | 1,
  state: RunState,
  rng: RngFn,
): EventResolution {
  switch (eventId) {
    case 'derelict-cruiser': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: state.credits + 4 },
          outcomeText: 'You strip the hull for 4 credits.',
        };
      }
      if (rng() < 0.5) {
        const partId = randomPart(rng, FIVE_CREDIT_PARTS);
        return {
          state: { ...state, inventory: [...state.inventory, partId] },
          outcomeText: `The reactor yields a working ${getPart(partId).name}.`,
        };
      }
      const shipIndex = pickRandomShipIndex(state.fleet, rng);
      return {
        state: { ...state, fleet: applyCappedDamage(state.fleet, shipIndex, 2) },
        outcomeText: 'The reactor arcs back — a ship takes damage.',
      };
    }

    case 'asteroid-field': {
      if (choiceIndex === 1) {
        return {
          state: { ...state, credits: clampCredits(state.credits - 2) },
          outcomeText: 'The detour costs 2 credits in burned fuel.',
        };
      }
      if (rng() < 0.5) {
        return {
          state: { ...state, credits: state.credits + 5 },
          outcomeText: 'You thread the field and find 5 credits of salvage.',
        };
      }
      const shipIndex = pickRandomShipIndex(state.fleet, rng);
      return {
        state: { ...state, fleet: applyCappedDamage(state.fleet, shipIndex, 2) },
        outcomeText: 'A collision damages a ship.',
      };
    }

    case 'ancient-cache': {
      if (choiceIndex === 1) {
        return { state, outcomeText: 'You leave the cache sealed.' };
      }
      const partId = randomPart(rng, SEVEN_CREDIT_PARTS);
      const col = state.position?.col ?? 0;
      return {
        state: { ...state, inventory: [...state.inventory, partId] },
        outcomeText: `The cache yields a ${getPart(partId).name} — but the surge attracts a patrol.`,
        ambushEnemy: hardestEnemyForAmbush(state.act, col),
      };
    }

    case 'abandoned-arsenal': {
      if (choiceIndex === 1) {
        return {
          state: { ...state, credits: state.credits + 3 },
          outcomeText: 'You sell the scrap for 3 credits.',
        };
      }
      if (state.hand.length >= MAX_HAND_SIZE) {
        return { state, outcomeText: 'Your hand is full — you leave the crate behind.' };
      }
      const cardId = CARDS[Math.floor(rng() * CARDS.length)].id;
      return {
        state: { ...state, hand: [...state.hand, cardId] },
        outcomeText: `You take a ${getCard(cardId).name} module.`,
      };
    }

    case 'intercepted-signal': {
      if (choiceIndex === 1) {
        return {
          state: { ...state, credits: state.credits + 5 },
          outcomeText: 'You sell the codes for 5 credits.',
        };
      }
      const index = nextUnrevealedIndex(state);
      if (index === -1) {
        return { state, outcomeText: 'The signal is noise — nothing left to decrypt.' };
      }
      const escalations = state.escalations.map((e, i) => (i === index ? { ...e, revealed: true } : e));
      const revealedId = escalations[index].id;
      return {
        state: { ...state, escalations },
        outcomeText: `Decrypted: enemy forces are preparing "${revealedId}" after column ${escalations[index].landsAfterColumn}.`,
      };
    }

    case 'recon-probe': {
      if (choiceIndex === 1) {
        return {
          state: { ...state, credits: state.credits + 4 },
          outcomeText: 'You strip the drone for 4 credits.',
        };
      }
      const nextCol = (state.position?.col ?? -1) + 1;
      const names = combatEnemyPool(state.act, nextCol)
        .map((e) => e.name)
        .join(', ');
      return {
        state,
        outcomeText: `Scouting shows the next column's combat fleets draw from: ${names}.`,
      };
    }

    case 'sabotage-raid': {
      if (choiceIndex === 1) {
        return {
          state: { ...state, credits: state.credits + 3 },
          outcomeText: 'You decide it is too risky and move on for 3 credits.',
        };
      }
      const index = nextUnrevealedIndex(state);
      const shipIndex = pickRandomShipIndex(state.fleet, rng);
      const fleet = applyCappedDamage(state.fleet, shipIndex, 2);
      if (index === -1) {
        return {
          state: { ...state, fleet },
          outcomeText: 'The raid finds nothing left to sabotage, but the guards still catch you on the way out.',
        };
      }
      const escalations = state.escalations.filter((_, i) => i !== index);
      return {
        state: { ...state, escalations, fleet },
        outcomeText: 'You cripple the yard, cancelling a scheduled enemy upgrade — but take damage escaping.',
      };
    }

    case 'defector': {
      if (choiceIndex === 1) {
        return {
          state: { ...state, credits: state.credits + 6 },
          outcomeText: 'You turn them in for 6 credits.',
        };
      }
      const escalations = state.escalations.map((e) => ({ ...e, revealed: true }));
      return {
        state: { ...state, escalations },
        outcomeText: 'The defector spills everything they know about enemy plans.',
      };
    }

    default:
      return { state, outcomeText: '' };
  }
}
