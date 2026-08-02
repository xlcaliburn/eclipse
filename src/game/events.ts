import { combatEnemyPool, EASY_POOL, EASY_POOL_ACT2, HARD_POOL, HARD_POOL_ACT2, hardestEnemyForAmbush } from './enemies';
import { actColumns, globalColumn } from './map';
import type { MapPosition } from './map';
import { deriveFleetStats, deriveStats } from './ship';
import { getPart } from './parts';
import { CARDS, getCard, MAX_HAND_SIZE } from './cards';
import type { CardId } from './cards';
import type { FrameId } from './frames';
import type { RngFn } from './rng';
import type { AmbushBonus, EnemyDef, PartId, PlayerShipState, RunState } from './types';

export type EventId =
  | 'derelict-cruiser'
  | 'asteroid-field'
  | 'ancient-cache'
  | 'abandoned-arsenal'
  | 'intercepted-signal'
  | 'recon-probe'
  | 'sabotage-raid'
  | 'defector'
  | 'defector-pursuit'
  | 'distress-beacon'
  | 'repair-tender'
  | 'militia-requisition';

// --- Requirement predicate library (14.1) -----------------------------
// A small reusable set, deliberately limited to what the 14.2 content table
// actually asks for — no speculative kinds. Every check derives from real
// fleet/run state via existing helpers, never a bespoke closure per event.
export type EventRequirement =
  | { kind: 'partEquipped'; partId: PartId }
  | { kind: 'everyShipInitiativeAtLeast'; value: number }
  | { kind: 'anyShipComputerAtLeast'; value: number }
  | { kind: 'framePresent'; frameId: FrameId }
  | { kind: 'handAtLeast'; value: number }
  | { kind: 'handBelowMax' }
  | { kind: 'creditsAtLeast'; value: number };

export function meetsRequirement(req: EventRequirement, state: RunState): boolean {
  switch (req.kind) {
    case 'partEquipped':
      return state.fleet.some((s) => s.equipped.includes(req.partId));
    case 'everyShipInitiativeAtLeast':
      return state.fleet.length > 0 && deriveFleetStats(state.fleet).every((s) => s.initiative >= req.value);
    case 'anyShipComputerAtLeast':
      return deriveFleetStats(state.fleet).some((s) => s.computer >= req.value);
    case 'framePresent':
      return state.fleet.some((s) => s.frameId === req.frameId);
    case 'handAtLeast':
      return state.hand.length >= req.value;
    case 'handBelowMax':
      return state.hand.length < MAX_HAND_SIZE;
    case 'creditsAtLeast':
      return state.credits >= req.value;
    default:
      return false;
  }
}

// --- Option list (14.1) ------------------------------------------------
export interface EventOption {
  label: string; // includes any deterministic cost in text
  requirement?: EventRequirement; // unmet -> shown locked with reqText
  reqText?: string; // "requires Cloaking field"
  chooseShip?: boolean; // UI collects a ship index before dispatch
  chooseCard?: boolean; // UI collects a card from hand before dispatch
}

export interface EventDef {
  id: EventId;
  title: string;
  flavor: string;
  options: EventOption[];
}

export const EVENTS: EventDef[] = [
  {
    id: 'derelict-cruiser',
    title: 'Derelict cruiser',
    flavor: 'A gutted hull drifts in the dark, systems long dead.',
    options: [
      { label: 'Salvage the hull (+4 credits)' },
      { label: 'Crack the reactor — pick a ship to board it; the housing looks ready to arc', chooseShip: true },
      {
        label: 'Damage control bay: restore its systems — a part, +2 credits, no risk',
        requirement: { kind: 'partEquipped', partId: 'dcbay' },
        reqText: 'requires Damage control bay',
      },
    ],
  },
  {
    id: 'asteroid-field',
    title: 'Asteroid field',
    flavor: 'A dense field blocks the direct route.',
    options: [
      { label: 'Detour around it (-2 credits)' },
      { label: 'Thread the field — pick a ship to lead the run through the rocks', chooseShip: true },
      {
        label: 'Full burn — every ship threads the gap in formation (+5 credits, clean)',
        requirement: { kind: 'everyShipInitiativeAtLeast', value: 2 },
        reqText: 'requires every ship at initiative 2+',
      },
    ],
  },
  {
    id: 'ancient-cache',
    title: 'Ancient cache',
    flavor: 'A sealed Ancient container, still humming with power.',
    options: [
      { label: 'Leave it sealed' },
      { label: 'Force it open — the seal screams; that will draw eyes' },
      {
        label: 'Cloaking field: slip in and pull the core quietly',
        requirement: { kind: 'partEquipped', partId: 'cloak' },
        reqText: 'requires Cloaking field',
      },
    ],
  },
  {
    id: 'abandoned-arsenal',
    title: 'Abandoned arsenal',
    flavor: 'Racks of unused reaction-card modules line the walls.',
    options: [
      { label: 'Sell the scrap (+3 credits)' },
      {
        label: 'Take a crate — a reaction card, sight unseen',
        requirement: { kind: 'handBelowMax' },
        reqText: 'requires a free hand slot',
      },
      {
        label: 'Restock — trade in a card of your choice, then take the crate',
        requirement: { kind: 'handAtLeast', value: 1 },
        reqText: 'requires a reaction card to trade in',
        chooseCard: true,
      },
    ],
  },
  {
    id: 'intercepted-signal',
    title: 'Intercepted signal',
    flavor: 'Encrypted chatter about enemy fleet movements crosses your scanners.',
    options: [
      { label: 'Sell the codes (+5 credits)' },
      { label: 'Decrypt it — reveal the next escalation' },
      {
        label: 'Deep-decrypt — reveal the next two escalations',
        requirement: { kind: 'anyShipComputerAtLeast', value: 3 },
        reqText: 'requires a ship with computer 3+',
      },
    ],
  },
  {
    id: 'recon-probe',
    title: 'Recon probe',
    flavor: 'A dormant scout drone, still fuelled.',
    options: [
      { label: 'Strip it for parts (+4 credits)' },
      { label: "Launch it — chart the next column's enemies and node types" },
      {
        label: 'Pace it in — chart the next two columns instead of one',
        requirement: { kind: 'framePresent', frameId: 'interceptor' },
        reqText: 'requires an Interceptor in the fleet',
      },
    ],
  },
  {
    id: 'sabotage-raid',
    title: 'Shipyard raid',
    flavor: 'A crippled enemy shipyard, still guarded but weakly.',
    options: [
      { label: 'Move on (+3 credits)' },
      {
        label: 'Hit the yard — pick a ship to make the run; point-defense will clip it on the way out',
        chooseShip: true,
      },
      {
        label: 'The Bastion breaches — its armor shrugs off the point-defense, no damage taken',
        requirement: { kind: 'framePresent', frameId: 'bastion' },
        reqText: 'requires a Bastion in the fleet',
      },
    ],
  },
  {
    id: 'defector',
    title: 'Defector pilot',
    flavor: 'An enemy pilot signals for asylum, offering everything they know.',
    options: [
      { label: 'Turn them in (+6 credits)' },
      { label: 'Take them aboard — reveal every escalation; their old wing will come looking' },
    ],
  },
  {
    // Never drawn from the random pool — only reached via `defector`'s
    // "take them aboard" choice, one node later (RunState.pendingEventId).
    id: 'defector-pursuit',
    title: 'The pursuit',
    flavor: 'Their old wing has tracked you down.',
    options: [
      { label: 'Stand and fight — a hunt squad drops out of warp' },
      {
        label: 'Cloaking field: slip away clean',
        requirement: { kind: 'partEquipped', partId: 'cloak' },
        reqText: 'requires Cloaking field',
      },
      {
        label: 'Pay them off (-6 credits)',
        requirement: { kind: 'creditsAtLeast', value: 6 },
        reqText: 'requires 6+ credits',
      },
    ],
  },
  {
    id: 'distress-beacon',
    title: 'Distress beacon',
    flavor: 'A weak signal repeats on an open channel — someone is under fire nearby.',
    options: [
      { label: 'Ignore it' },
      { label: "Drive the raiders off — the beacon's owner is still fighting" },
      {
        label: 'Lure beacon: draw the raiders off with a false signal — no fight, +4 credits gratitude',
        requirement: { kind: 'partEquipped', partId: 'lure' },
        reqText: 'requires Lure beacon',
      },
    ],
  },
  {
    id: 'repair-tender',
    title: 'Repair tender',
    flavor: 'A civilian tender offers field repairs, for a price.',
    options: [
      { label: 'Move on' },
      {
        label: 'Pay for repairs — pick a ship to patch up (4 credits, repairs 3 damage)',
        requirement: { kind: 'creditsAtLeast', value: 4 },
        reqText: 'requires 4+ credits',
        chooseShip: true,
      },
      {
        label: 'Damage control bay: trade technique notes — pick a ship to patch up, free',
        requirement: { kind: 'partEquipped', partId: 'dcbay' },
        reqText: 'requires Damage control bay',
        chooseShip: true,
      },
    ],
  },
  {
    id: 'militia-requisition',
    title: 'Militia requisition',
    flavor: 'A local militia post is collecting reaction-card modules for the front.',
    options: [
      { label: 'Refuse' },
      {
        label: 'Donate a reaction card of your choice (+7 credits)',
        requirement: { kind: 'handAtLeast', value: 1 },
        reqText: 'requires a reaction card to donate',
        chooseCard: true,
      },
    ],
  },
];

const EVENTS_BY_ID: Record<EventId, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<
  EventId,
  EventDef
>;

export function getEvent(id: EventId): EventDef {
  return EVENTS_BY_ID[id];
}

// The defector's pursuit is only ever reached via RunState.pendingEventId
// (set by `defector`'s "take them aboard" choice) — it never enters the
// random pool a normal node draw picks from.
const RANDOM_EVENTS: EventDef[] = EVENTS.filter((e) => e.id !== 'defector-pursuit');

export function drawEvent(rng: RngFn, excludeId?: EventId): EventId {
  const pool = RANDOM_EVENTS.filter((e) => e.id !== excludeId);
  const options = pool.length > 0 ? pool : RANDOM_EVENTS;
  return options[Math.floor(rng() * options.length)].id;
}

const FIVE_CREDIT_PARTS: PartId[] = ['plasma', 'missile', 'comp2', 'shield2', 'hull2'];
const SEVEN_CREDIT_PARTS: PartId[] = ['comp3', 'init3'];

function clampCredits(credits: number): number {
  return Math.max(0, credits);
}

// Applies damage to one chosen ship, capped so it always survives with
// >= 1 HP. The design law for this iteration: costs are chosen (the player
// picked this ship for this option), never random.
function applyCappedDamage(fleet: PlayerShipState[], shipIndex: number, amount: number): PlayerShipState[] {
  return fleet.map((ship, i) => {
    if (i !== shipIndex) return ship;
    const hp = deriveStats(ship.frameId, ship.equipped, ship.upgrades).hp;
    const maxDamage = hp - 1;
    return { ...ship, damage: Math.min(maxDamage, ship.damage + amount) };
  });
}

function applyRepair(fleet: PlayerShipState[], shipIndex: number, amount: number): PlayerShipState[] {
  return fleet.map((ship, i) => (i === shipIndex ? { ...ship, damage: Math.max(0, ship.damage - amount) } : ship));
}

function randomPart(rng: RngFn, pool: PartId[]): PartId {
  return pool[Math.floor(rng() * pool.length)];
}

function randomCard(rng: RngFn): CardId {
  return CARDS[Math.floor(rng() * CARDS.length)].id;
}

function pickFromPool(pool: EnemyDef[], rng: RngFn): EnemyDef {
  return pool[Math.floor(rng() * pool.length)];
}

// The defector-pursuit's "hunt squad": a random pick from the current act's
// hard pool, regardless of the column it happens to land on — the old wing
// comes for you at full strength, not scaled down for an early ambush.
function huntSquadForAmbush(act: 1 | 2, rng: RngFn): EnemyDef {
  return pickFromPool(act === 1 ? HARD_POOL : HARD_POOL_ACT2, rng);
}

// distress-beacon's raiders: an easy-pool enemy, so the "drive them off"
// option is a genuine small-stakes fight, not a trap.
function easyRaidersForAmbush(act: 1 | 2, rng: RngFn): EnemyDef {
  return pickFromPool(act === 1 ? EASY_POOL : EASY_POOL_ACT2, rng);
}

// All node positions in one column, for recon-probe's "chart the column"
// options — distinct from the existing lane-based deep scan.
function columnPositions(state: RunState, col: number): MapPosition[] {
  const columns = actColumns(state.map, state.act);
  if (col < 0 || col >= columns.length) return [];
  return columns[col].map((n) => ({ col: n.col, row: n.row }));
}

function mergeRevealed(existing: MapPosition[], added: MapPosition[]): MapPosition[] {
  const merged = [...existing];
  for (const pos of added) {
    if (!merged.some((p) => p.col === pos.col && p.row === pos.row)) merged.push(pos);
  }
  return merged;
}

function enemyPoolNames(state: RunState, col: number): string {
  return combatEnemyPool(state.act, col)
    .map((e) => e.name)
    .join(', ');
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

// Reveals the single earliest-unrevealed escalation, if any. Returns the
// (possibly unchanged) state and the revealed escalation's flavor text, or
// undefined if nothing was left to reveal.
function revealNextEscalation(state: RunState): { state: RunState; text?: string } {
  const index = nextUnrevealedIndex(state);
  if (index === -1) return { state };
  const escalations = state.escalations.map((e, i) => (i === index ? { ...e, revealed: true } : e));
  const revealedId = escalations[index].id;
  return {
    state: { ...state, escalations },
    text: `enemy forces are preparing "${revealedId}" after column ${escalations[index].landsAfterColumn}`,
  };
}

export interface EventChoiceSelection {
  shipIndex?: number;
  cardId?: CardId;
}

export interface EventResolution {
  state: RunState;
  outcomeText: string;
  // Set when this choice leads straight into a fight (e.g. the ancient
  // cache's alarm attracts a patrol). The enemy is granted before the fight
  // and kept regardless of its outcome — losing the fight still ends the run.
  ambushEnemy?: EnemyDef;
  ambushBonus?: AmbushBonus;
}

// Pure resolver: given the event, the choice made, current run state, any
// ship/card the player pre-selected, and an injected RNG, returns the
// updated state and flavor text for the outcome screen. Never destroys a
// ship (damage is always capped at hp - 1) and never sends credits negative.
// The reducer has already validated the requirement and sub-selection before
// calling this — it trusts `selection` but not blindly (falls back safely
// if a field is somehow missing).
export function resolveEventChoice(
  eventId: EventId,
  choiceIndex: number,
  state: RunState,
  rng: RngFn,
  selection: EventChoiceSelection = {},
): EventResolution {
  switch (eventId) {
    case 'derelict-cruiser': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: state.credits + 4 },
          outcomeText: 'You strip the hull for 4 credits.',
        };
      }
      if (choiceIndex === 1) {
        const shipIndex = selection.shipIndex ?? 0;
        if (rng() < 0.5) {
          const partId = randomPart(rng, FIVE_CREDIT_PARTS);
          return {
            state: { ...state, inventory: [...state.inventory, partId] },
            outcomeText: `The reactor yields a working ${getPart(partId).name}.`,
          };
        }
        return {
          state: { ...state, fleet: applyCappedDamage(state.fleet, shipIndex, 2) },
          outcomeText: 'The reactor arcs back — the boarding ship takes damage.',
        };
      }
      // choiceIndex 2: Damage control bay — restore its systems, no risk.
      const partId = randomPart(rng, FIVE_CREDIT_PARTS);
      return {
        state: { ...state, credits: state.credits + 2, inventory: [...state.inventory, partId] },
        outcomeText: `Your damage control team restores a working ${getPart(partId).name} and strips 2 credits of scrap, no risk.`,
      };
    }

    case 'asteroid-field': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: clampCredits(state.credits - 2) },
          outcomeText: 'The detour costs 2 credits in burned fuel.',
        };
      }
      if (choiceIndex === 1) {
        const shipIndex = selection.shipIndex ?? 0;
        if (rng() < 0.5) {
          return {
            state: { ...state, credits: state.credits + 5 },
            outcomeText: 'You thread the field and find 5 credits of salvage.',
          };
        }
        return {
          state: { ...state, fleet: applyCappedDamage(state.fleet, shipIndex, 2) },
          outcomeText: 'A collision damages the lead ship.',
        };
      }
      // choiceIndex 2: full burn — every ship clears initiative 2, clean.
      return {
        state: { ...state, credits: state.credits + 5 },
        outcomeText: 'Every ship threads the gap in formation — 5 credits of salvage, no scrapes.',
      };
    }

    case 'ancient-cache': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You leave the cache sealed.' };
      }
      const partId = randomPart(rng, SEVEN_CREDIT_PARTS);
      if (choiceIndex === 1) {
        const col = state.position?.col ?? 0;
        return {
          state: { ...state, inventory: [...state.inventory, partId] },
          outcomeText: `The cache yields a ${getPart(partId).name} — but the surge attracts a patrol.`,
          ambushEnemy: hardestEnemyForAmbush(state.act, col),
        };
      }
      // choiceIndex 2: cloaked entry — same part, no ambush.
      return {
        state: { ...state, inventory: [...state.inventory, partId] },
        outcomeText: `Cloaked, you pull a ${getPart(partId).name} from the core without tripping the alarm.`,
      };
    }

    case 'abandoned-arsenal': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: state.credits + 3 },
          outcomeText: 'You sell the scrap for 3 credits.',
        };
      }
      if (choiceIndex === 1) {
        const cardId = randomCard(rng);
        return {
          state: { ...state, hand: [...state.hand, cardId] },
          outcomeText: `You take a ${getCard(cardId).name} module.`,
        };
      }
      // choiceIndex 2: restock — trade in a chosen card, then take the crate.
      const cardId = selection.cardId;
      const handWithoutTraded = cardId ? removeOnce(state.hand, cardId) : state.hand;
      const newCardId = randomCard(rng);
      return {
        state: { ...state, hand: [...handWithoutTraded, newCardId] },
        outcomeText: `You trade in your ${cardId ? getCard(cardId).name : 'card'} and take a ${getCard(newCardId).name} module instead.`,
      };
    }

    case 'intercepted-signal': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: state.credits + 5 },
          outcomeText: 'You sell the codes for 5 credits.',
        };
      }
      if (choiceIndex === 1) {
        const { state: nextState, text } = revealNextEscalation(state);
        return {
          state: nextState,
          outcomeText: text ? `Decrypted: ${text}.` : 'The signal is noise — nothing left to decrypt.',
        };
      }
      // choiceIndex 2: deep-decrypt — reveal the next two.
      const first = revealNextEscalation(state);
      const second = revealNextEscalation(first.state);
      if (!first.text) {
        return { state: first.state, outcomeText: 'The signal is noise — nothing left to decrypt.' };
      }
      if (!second.text) {
        return { state: second.state, outcomeText: `Decrypted: ${first.text}. Nothing further remains.` };
      }
      return { state: second.state, outcomeText: `Decrypted: ${first.text}; and ${second.text}.` };
    }

    case 'recon-probe': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: state.credits + 4 },
          outcomeText: 'You strip the drone for 4 credits.',
        };
      }
      const nextCol = (state.position?.col ?? -1) + 1;
      if (choiceIndex === 1) {
        const revealedNodes = mergeRevealed(state.revealedNodes, columnPositions(state, nextCol));
        return {
          state: { ...state, revealedNodes },
          outcomeText: `Scouting charts the next column: enemy fleets there draw from ${enemyPoolNames(state, nextCol)}, and every node in the lane is now visible.`,
        };
      }
      // choiceIndex 2: pace it in — chart the next two columns.
      const revealedNodes = mergeRevealed(
        mergeRevealed(state.revealedNodes, columnPositions(state, nextCol)),
        columnPositions(state, nextCol + 1),
      );
      return {
        state: { ...state, revealedNodes },
        outcomeText: `The Interceptor paces the drone two columns deep: fleets draw from ${enemyPoolNames(state, nextCol)}, then ${enemyPoolNames(state, nextCol + 1)} — both lanes now charted.`,
      };
    }

    case 'sabotage-raid': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: state.credits + 3 },
          outcomeText: 'You decide it is too risky and move on for 3 credits.',
        };
      }
      const { state: cancelledState, text } = revealAndCancel(state);
      if (choiceIndex === 1) {
        const shipIndex = selection.shipIndex ?? 0;
        const fleet = applyCappedDamage(cancelledState.fleet, shipIndex, 2);
        return {
          state: { ...cancelledState, fleet },
          outcomeText: text
            ? `You cripple the yard, cancelling ${text} — but point-defense clips your ship on the way out.`
            : 'The raid finds nothing left to sabotage, but the guards still catch your ship on the way out.',
        };
      }
      // choiceIndex 2: the Bastion breaches — same cancel, no damage.
      return {
        state: cancelledState,
        outcomeText: text
          ? `The Bastion breaches the yard, cancelling ${text} — its armor shrugs off the point-defense.`
          : 'The Bastion finds nothing left to sabotage, but shrugs off the point-defense regardless.',
      };
    }

    case 'defector': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: state.credits + 6 },
          outcomeText: 'You turn them in for 6 credits.',
        };
      }
      const escalations = state.escalations.map((e) => ({ ...e, revealed: true }));
      return {
        state: { ...state, escalations, pendingEventId: 'defector-pursuit' },
        outcomeText: 'The defector spills everything they know about enemy plans — and warns their old wing will come looking.',
      };
    }

    case 'defector-pursuit': {
      if (choiceIndex === 0) {
        return {
          state,
          outcomeText: 'You turn to fight. Win, and the bounty on their own hunters becomes yours.',
          ambushEnemy: huntSquadForAmbush(state.act, rng),
          ambushBonus: { credits: 8 },
        };
      }
      if (choiceIndex === 1) {
        return {
          state,
          outcomeText: 'Your cloak flickers online — the hunt squad sweeps past without a flicker of contact.',
        };
      }
      // choiceIndex 2: pay them off.
      return {
        state: { ...state, credits: clampCredits(state.credits - 6) },
        outcomeText: 'You pay the ransom the old wing demands. They peel off.',
      };
    }

    case 'distress-beacon': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You leave the beacon behind.' };
      }
      if (choiceIndex === 1) {
        const partId = randomPart(rng, FIVE_CREDIT_PARTS);
        return {
          state,
          outcomeText: `You peel off toward the beacon. Win, and its owner rewards you with credits and a ${getPart(partId).name}.`,
          ambushEnemy: easyRaidersForAmbush(state.act, rng),
          ambushBonus: { credits: 6, partId },
        };
      }
      // choiceIndex 2: lure beacon — no fight.
      return {
        state: { ...state, credits: state.credits + 4 },
        outcomeText: 'Your lure beacon draws the raiders onto a false trail; the grateful survivors wire over 4 credits.',
      };
    }

    case 'repair-tender': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You move on.' };
      }
      const shipIndex = selection.shipIndex ?? 0;
      if (choiceIndex === 1) {
        return {
          state: {
            ...state,
            credits: clampCredits(state.credits - 4),
            fleet: applyRepair(state.fleet, shipIndex, 3),
          },
          outcomeText: 'The tender patches up your chosen ship for 4 credits.',
        };
      }
      // choiceIndex 2: Damage control bay — same repair, free.
      return {
        state: { ...state, fleet: applyRepair(state.fleet, shipIndex, 3) },
        outcomeText: 'Your crews trade technique notes with the tender — a free repair for your chosen ship.',
      };
    }

    case 'militia-requisition': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You refuse the requisition.' };
      }
      const cardId = selection.cardId;
      const hand = cardId ? removeOnce(state.hand, cardId) : state.hand;
      return {
        state: { ...state, hand, credits: state.credits + 7 },
        outcomeText: `You donate your ${cardId ? getCard(cardId).name : 'card'} module for 7 credits.`,
      };
    }

    default:
      return { state, outcomeText: '' };
  }
}

// Cancels the earliest scheduled-but-unrevealed escalation, if any — shared
// by both Shipyard raid options (one damaged, one clean).
function revealAndCancel(state: RunState): { state: RunState; text?: string } {
  const index = nextUnrevealedIndex(state);
  if (index === -1) return { state };
  const cancelled = state.escalations[index];
  const escalations = state.escalations.filter((_, i) => i !== index);
  return { state: { ...state, escalations }, text: `a scheduled enemy upgrade ("${cancelled.id}")` };
}

function removeOnce<T>(list: T[], item: T): T[] {
  const index = list.indexOf(item);
  if (index === -1) return list;
  const copy = [...list];
  copy.splice(index, 1);
  return copy;
}
