import {
  combatEnemyPool,
  EASY_POOL,
  EASY_POOL_ACT2,
  eliteVariant,
  HARD_POOL,
  HARD_POOL_ACT2,
  hardestEnemyForAmbush,
} from './enemies';
import { addHeat } from './heat';
import { actColumns, globalColumn } from './map';
import type { MapPosition } from './map';
import { applyRepairBanking, deriveFleetStats, deriveStats } from './ship';
import { ANCIENT_ARTIFACT_PART_ID, getPart, isSalvageablePart, PARTS } from './parts';
import { getFrame } from './frames';
import type { FrameId } from './frames';
import type { ProtocolId } from './protocols';
import { pickOne } from './rng';
import type { RngFn } from './rng';
import type { AmbushBonus, EnemyDef, PartId, PlayerShipState, RunState } from './types';
import { mapShip, removeOnce } from './util';

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
  | 'militia-requisition'
  | 'salvage-claim'
  | 'relic-signal'
  | 'relic-vault'
  | 'relic-core'
  // Iteration 49: three low-risk early events (49.3) —
  | 'customs-checkpoint'
  | 'war-surplus-peddler'
  | 'nav-buoy'
  // — and two quest chains (49.4/49.5).
  | 'debt-broker'
  | 'debt-collectors'
  | 'colony-ship'
  | 'colony-raiders'
  | 'colony-arrival';

// Iteration 49.1: which slice of the run an event node belongs to, keyed
// off the entered node's GLOBAL column (act 1 as-is, act 2 offset — see
// map.ts's globalColumn). Bands are deliberately kept in this one function
// so the boundaries stay a single knob to retune: early = the first one-
// or-two event slots (act-1 cols 1-3), mid = the rest of act 1 (cols 4-9),
// late = all of act 2 (global 11+, since act 2 col 0 is already global 11).
export type EventStage = 'early' | 'mid' | 'late';
export function eventStage(act: 1 | 2, col: number): EventStage {
  const g = globalColumn(act, col);
  return g <= 3 ? 'early' : g <= 10 ? 'mid' : 'late';
}

// --- Requirement predicate library (14.1) -----------------------------
// A small reusable set, deliberately limited to what the 14.2 content table
// actually asks for — no speculative kinds. Every check derives from real
// fleet/run state via existing helpers, never a bespoke closure per event.
export type EventRequirement =
  | { kind: 'partEquipped'; partId: PartId }
  | { kind: 'everyShipInitiativeAtLeast'; value: number }
  | { kind: 'anyShipComputerAtLeast'; value: number }
  | { kind: 'framePresent'; frameId: FrameId }
  | { kind: 'inventoryAtLeast'; value: number }
  | { kind: 'inventoryAtMost'; value: number }
  | { kind: 'creditsAtLeast'; value: number };

export function meetsRequirement(req: EventRequirement, state: RunState): boolean {
  switch (req.kind) {
    case 'partEquipped':
      return state.fleet.some((s) => s.equipped.includes(req.partId));
    case 'everyShipInitiativeAtLeast':
      return (
        state.fleet.length > 0 &&
        deriveFleetStats(state.fleet, state.commanderId, state.protocols).every((s) => s.initiative >= req.value)
      );
    case 'anyShipComputerAtLeast':
      return deriveFleetStats(state.fleet, state.commanderId, state.protocols).some((s) => s.computer >= req.value);
    case 'framePresent':
      return state.fleet.some((s) => s.frameId === req.frameId);
    case 'inventoryAtLeast':
      return state.inventory.length >= req.value;
    // 49.2: the inverse of inventoryAtLeast — "nothing loose in the hold"
    // (customs-checkpoint's "nothing to declare"), not spare capacity.
    case 'inventoryAtMost':
      return state.inventory.length <= req.value;
    case 'creditsAtLeast':
      return state.credits >= req.value;
    default:
      return false;
  }
}

function indefiniteArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

// 47.5q: mirrors meetsRequirement's own switch. Most of the ~15 hand-synced
// `requirement`/`reqText` pairs across EVENTS below were pure restatements
// of the requirement — this generates that prose instead, so the pair can
// never drift the way the 2026-08-07 bug (a missing `creditsAtLeast`
// guard, see EventOption's own note above) showed a hand-maintained table
// can. `inventoryAtLeast`'s generic phrasing here is a fallback only — the
// one current use (militia-requisition, "a spare part to donate") keeps
// its own bespoke `reqText` since the context-specific wording reads
// better than anything this generic switch could produce.
export function describeRequirement(req: EventRequirement): string {
  switch (req.kind) {
    case 'partEquipped':
      return `requires ${getPart(req.partId).name}`;
    case 'framePresent': {
      const name = getFrame(req.frameId).name;
      return `requires ${indefiniteArticle(name)} ${name} in the fleet`;
    }
    case 'everyShipInitiativeAtLeast':
      return `requires every ship at initiative ${req.value}+`;
    case 'anyShipComputerAtLeast':
      return `requires a ship with computer ${req.value}+`;
    case 'creditsAtLeast':
      return `requires ${req.value}+ credits`;
    case 'inventoryAtLeast':
      return `requires ${req.value}+ spare part${req.value === 1 ? '' : 's'}`;
    case 'inventoryAtMost':
      return `requires ${req.value} or fewer spare parts`;
    default:
      return '';
  }
}

// The text an EventOption's lock actually shows: a bespoke `reqText`
// override if the option set one, else the generic derivation above.
export function reqTextFor(option: EventOption): string | undefined {
  if (option.reqText) return option.reqText;
  return option.requirement ? describeRequirement(option.requirement) : undefined;
}

// --- Option list (14.1) ------------------------------------------------
export interface EventOption {
  label: string; // includes any deterministic cost in text
  requirement?: EventRequirement; // unmet -> shown locked with reqText
  reqText?: string; // "requires Cloaking field"
  chooseShip?: boolean; // UI collects a ship index before dispatch
  choosePart?: boolean; // UI collects a part from inventory before dispatch
}

export interface EventDef {
  id: EventId;
  title: string;
  flavor: string;
  options: EventOption[];
  // 49.1: an explicit list (not min/max) so the table reads at a glance and
  // can't be misread. For chain-continuation events that never enter the
  // random pool (defector-pursuit / relic-vault / relic-core /
  // debt-collectors / colony-raiders / colony-arrival) this is
  // documentation only — the stages the chain can actually fire them in —
  // since drawEvent's continuation checks bypass the stage-filtered pool
  // entirely.
  stages: EventStage[];
}

export const EVENTS: EventDef[] = [
  {
    id: 'derelict-cruiser',
    title: 'Derelict cruiser',
    flavor: 'A gutted hull drifts in the dark, systems long dead.',
    stages: ['early', 'mid'], // small numbers; a dead node by act 2
    options: [
      { label: 'Salvage the hull (+4 credits)' },
      { label: 'Crack the reactor — pick a ship to board it; the housing looks ready to arc', chooseShip: true },
      {
        label: 'Damage control bay: restore its systems — a part, +2 credits, no risk',
        requirement: { kind: 'partEquipped', partId: 'dcbay' },
      },
    ],
  },
  {
    id: 'asteroid-field',
    title: 'Asteroid field',
    flavor: 'A dense field blocks the direct route.',
    stages: ['early', 'mid'], // same
    options: [
      // 2026-08-07 bug fix: this had no requirement — every other
      // negative-credit option in this file gates on 'creditsAtLeast'
      // (see "Pay them off" / "Buy the final fragment" below); this one
      // was missed, so it stayed pickable at 0cr, taking credits negative.
      { label: 'Detour around it (-2 credits)', requirement: { kind: 'creditsAtLeast', value: 2 } },
      { label: 'Thread the field — pick a ship to lead the run through the rocks', chooseShip: true },
      {
        label: 'Full burn — every ship threads the gap in formation (+5 credits, clean)',
        requirement: { kind: 'everyShipInitiativeAtLeast', value: 2 },
      },
    ],
  },
  {
    id: 'ancient-cache',
    title: 'Ancient cache',
    flavor: 'A sealed Ancient container, still humming with power.',
    stages: ['mid', 'late'], // the risky path is an ELITE fight
    options: [
      { label: 'Leave it sealed' },
      // 2026-08-07: made explicit that this draws an ELITE-strength
      // ambush, not a regular one — the epic/legendary-tier reward is the
      // payoff for that specific risk, so the label has to say so upfront.
      { label: 'Force it open — the seal screams and draws an ELITE patrol' },
      {
        label: 'Cloaking field: slip in and pull the core quietly',
        requirement: { kind: 'partEquipped', partId: 'cloak' },
      },
    ],
  },
  {
    id: 'abandoned-arsenal',
    title: 'Abandoned arsenal',
    flavor: 'Racks of unused ship parts line the walls, stripped from wrecks and never claimed.',
    stages: ['early', 'mid'], // same
    options: [
      { label: 'Sell the scrap (+3 credits)' },
      { label: 'Take a crate — a part, sight unseen' },
    ],
  },
  {
    id: 'intercepted-signal',
    title: 'Intercepted signal',
    flavor: 'Encrypted chatter about enemy fleet movements crosses your scanners.',
    stages: ['mid', 'late'], // escalation reveals matter once the run has shape
    options: [
      { label: 'Sell the codes (+5 credits)' },
      { label: 'Decrypt it — reveal the next escalation' },
      {
        label: 'Deep-decrypt — reveal the next two escalations',
        requirement: { kind: 'anyShipComputerAtLeast', value: 3 },
      },
    ],
  },
  {
    id: 'recon-probe',
    title: 'Recon probe',
    flavor: 'A dormant scout drone, still fuelled.',
    stages: ['early', 'mid', 'late'], // map intel is good at any depth
    options: [
      { label: 'Strip it for parts (+4 credits)' },
      { label: "Launch it — chart the next column's enemies and node types" },
      {
        label: 'Pace it in — chart the next two columns instead of one',
        requirement: { kind: 'framePresent', frameId: 'interceptor' },
      },
    ],
  },
  {
    id: 'sabotage-raid',
    title: 'Shipyard raid',
    flavor: 'A crippled enemy shipyard, still guarded but weakly.',
    stages: ['mid', 'late'], // escalation cancel + chip damage
    options: [
      { label: 'Move on (+3 credits)' },
      {
        label: 'Hit the yard — pick a ship to make the run; point-defense will clip it on the way out',
        chooseShip: true,
      },
      {
        label: 'The Bastion breaches — its armor shrugs off the point-defense, no damage taken',
        requirement: { kind: 'framePresent', frameId: 'bastion' },
      },
    ],
  },
  {
    id: 'defector',
    title: 'Defector pilot',
    flavor: 'An enemy pilot signals for asylum, offering everything they know.',
    stages: ['mid', 'late'], // the pursuit draws from HARD_POOL — lethal early
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
    // Continuation-only (RunState.pendingEventId), fired the very next
    // event node after 'defector' — reachable only mid/late since
    // 'defector' itself never draws early.
    stages: ['mid', 'late'],
    flavor: 'Their old wing has tracked you down.',
    options: [
      { label: 'Stand and fight — a hunt squad drops out of warp' },
      {
        label: 'Cloaking field: slip away clean',
        requirement: { kind: 'partEquipped', partId: 'cloak' },
      },
      {
        label: 'Pay them off (-6 credits)',
        requirement: { kind: 'creditsAtLeast', value: 6 },
      },
    ],
  },
  {
    id: 'distress-beacon',
    title: 'Distress beacon',
    flavor: 'A weak signal repeats on an open channel — someone is under fire nearby.',
    // 2026-08-08: re-tuned from a 6-credit ambush bonus after a playtest
    // report — the fight itself draws from EASY_POOL (trivial risk), but
    // winning it used to pay winReward(col) + 6cr + a free 5cr-tier part,
    // landing within 2cr of a genuine ELITE's total payout (eliteReward(col)
    // + 4cr bonus + a guaranteed part) for a fraction of the danger. +2cr
    // keeps "fight for it" clearly better than the no-fight "lure it away"
    // option (a flat +4cr with zero risk) once the part's value is counted,
    // without pricing an easy fight at elite rates. See
    // plans/iteration-50.md's reward-tier audit.
    stages: ['early', 'mid', 'late'], // easy-pool fight, low-tier reward
    options: [
      { label: 'Ignore it' },
      { label: "Drive the raiders off — the beacon's owner is still fighting" },
      {
        label: 'Lure beacon: draw the raiders off with a false signal — no fight, +4 credits gratitude',
        requirement: { kind: 'partEquipped', partId: 'lure' },
      },
    ],
  },
  {
    id: 'repair-tender',
    title: 'Repair tender',
    flavor: 'A civilian tender offers field repairs, for a price.',
    stages: ['mid', 'late'], // needs accumulated damage + credits
    options: [
      { label: 'Move on' },
      {
        label: 'Pay for repairs — pick a ship to patch up (4 credits, repairs 3 damage)',
        requirement: { kind: 'creditsAtLeast', value: 4 },
        chooseShip: true,
      },
      {
        label: 'Damage control bay: trade technique notes — pick a ship to patch up, free',
        requirement: { kind: 'partEquipped', partId: 'dcbay' },
        chooseShip: true,
      },
      {
        label: 'Full-fleet overhaul — every ship repairs 2 damage (8 credits)',
        requirement: { kind: 'creditsAtLeast', value: 8 },
      },
    ],
  },
  {
    // Iteration 20 (the economy floor): makes the heat track's design
    // literal — safe income exists, priced in pursuit. Self-limiting by
    // construction: at heat 4 ("Hunted") the next non-combat node is
    // intercepted outright (see reducer.ts PICK_NODE), so farming wrecks
    // at Hunted means buying the next ambush.
    id: 'salvage-claim',
    title: 'Unclaimed wreck field',
    flavor: 'A debris field drifts unclaimed — real salvage, if you loiter long enough to strip it.',
    stages: ['mid', 'late'], // heat economy is a mid-game lever
    options: [
      { label: 'Leave it — no sense lingering' },
      { label: 'Strip the field (+8 credits, +1 heat)' },
      { label: 'Thorough sweep — take your time (+12 credits, +2 heat)' },
    ],
  },
  {
    id: 'militia-requisition',
    title: 'Militia requisition',
    flavor: 'A local militia post is collecting spare ship parts for the front.',
    stages: ['mid', 'late'], // needs spare inventory — the original complaint
    options: [
      { label: 'Refuse' },
      {
        label: 'Donate a part of your choice (+7 credits)',
        requirement: { kind: 'inventoryAtLeast', value: 1 },
        reqText: 'requires a spare part to donate',
        choosePart: true,
      },
    ],
  },
  // --- The relic chain (iteration 34) ------------------------------------
  // Three distinct stages, not one repeatable event — an event node
  // resolves once, so the "3 different event nodes" shape the user asked
  // for is guaranteed by construction. Stage 1 sits in the normal random
  // pool (RANDOM_EVENTS); stages 2/3 never do — see drawEvent's
  // continuation check below, the same defector-pursuit precedent every
  // other reducer-scheduled event follows.
  {
    id: 'relic-signal',
    title: 'Ancient beacon',
    flavor: 'A repeating signal pulses from a dead hulk, far older than the war.',
    stages: ['early', 'mid'], // the chain needs runway to finish; already excluded once taken
    options: [
      { label: 'Walk away — sell the coordinates (+4 credits)' },
      { label: 'Take the fragment — prying it loose lights up every scanner in the sector (+1 heat)' },
    ],
  },
  {
    // Never drawn from the random pool — only reached via drawEvent's
    // continuation check once relicFragments === 1.
    id: 'relic-vault',
    title: 'The sealed vault',
    // Continuation-only — no stage restriction on the relic chain's own
    // roll, so this can fire at any stage the chain happens to be live at.
    stages: ['early', 'mid', 'late'],
    flavor: 'The fragment in your hold resonates, pulling you toward a derelict vault sealed since before the war.',
    options: [
      { label: "Strip the vault's fittings instead (+5 credits)" },
      {
        label: "Cut your way in — pick a ship to force the lock; the vault's defenses score its hull",
        chooseShip: true,
      },
      {
        label: 'Cloaking field: slip through the dead defenses — no damage',
        requirement: { kind: 'partEquipped', partId: 'cloak' },
      },
    ],
  },
  {
    // Never drawn from the random pool — only reached via drawEvent's
    // continuation check once relicFragments === 2.
    id: 'relic-core',
    title: 'The reliquary',
    stages: ['early', 'mid', 'late'], // continuation-only, same as relic-vault
    flavor: "Two fragments hum in your hold as you close on a collector's automated reliquary — the final piece is close.",
    options: [
      { label: 'Sell your two fragments to the reliquary (+10 credits)' },
      {
        label: 'Buy the final fragment (-8 credits)',
        requirement: { kind: 'creditsAtLeast', value: 8 },
      },
      { label: 'Take it by force — the reliquary screams an alarm (+2 heat)' },
    ],
  },
  // --- Iteration 49: three low-risk early events (49.3) -------------------
  // Deliberately tiny — they teach a system or hand out pocket change, and
  // age out of the pool after column 3 (stages: ['early']).
  {
    id: 'customs-checkpoint',
    title: 'Customs picket',
    flavor: 'A militia customs picket straddles the lane, waving traffic into an inspection queue.',
    stages: ['early'],
    options: [
      { label: 'Pay the toll (-1 credit)', requirement: { kind: 'creditsAtLeast', value: 1 } },
      { label: 'Slip past the picket (+1 heat)' },
      {
        // The inverse of militia-requisition's problem: a requirement the
        // player actually MEETS early (an empty hold is the default state).
        label: 'Nothing to declare — an empty hold is waved through',
        requirement: { kind: 'inventoryAtMost', value: 0 },
        reqText: 'requires an empty cargo hold',
      },
    ],
  },
  {
    id: 'war-surplus-peddler',
    title: 'War-surplus peddler',
    flavor: 'A tramp freighter flags you down, hold full of surplus of dubious provenance.',
    stages: ['early'],
    options: [
      { label: 'Move on' },
      {
        label: 'Buy a mystery crate (-2 credits)',
        requirement: { kind: 'creditsAtLeast', value: 2 },
      },
      { label: 'Sell them your scrap (+2 credits)' },
    ],
  },
  {
    id: 'nav-buoy',
    title: 'Old navigation buoy',
    flavor: 'A pre-war navigation buoy still blinks its survey beacon on a dead frequency.',
    stages: ['early'],
    options: [
      { label: 'Scrap it (+2 credits)' },
      { label: "Pull its charts — reveal every node in the next column" },
    ],
  },
  // --- Iteration 49.4: the debt broker (risk-inverted — money now, cost
  // later) --------------------------------------------------------------
  {
    id: 'debt-broker',
    title: 'The debt broker',
    flavor: 'A licensed credit broker hails you — fleet expansion capital, generous terms, minimal paperwork.',
    stages: ['early'],
    options: [
      { label: 'Decline politely' },
      { label: 'Take the loan (+8 credits — repayment of 12, collected "whenever we find you")' },
    ],
  },
  {
    // Never drawn from the random pool — only reached via drawEvent's
    // continuation check while loanOutstanding is set, mid/late only.
    id: 'debt-collectors',
    title: 'The collectors',
    flavor: 'The broker\'s enforcers drop out of warp, ledger in hand — 12 credits, due now.',
    stages: ['mid', 'late'],
    options: [
      {
        label: 'Settle the debt (-12 credits)',
        requirement: { kind: 'creditsAtLeast', value: 12 },
      },
      { label: 'Fight the enforcers' },
      {
        label: 'Cloaking field: slip away',
        requirement: { kind: 'partEquipped', partId: 'cloak' },
      },
    ],
  },
  // --- Iteration 49.5: the colony ship (kindness compounds across three
  // beats) ----------------------------------------------------------------
  {
    id: 'colony-ship',
    title: 'The colony ship',
    flavor: 'A slow colony convoy crawls across your scanners — holds full of settlers, engines older than the war.',
    stages: ['early'],
    options: [
      { label: 'Sell them your survey charts (+3 credits)' },
      { label: "Escort them through the debris belt — costs you nothing but time; they'll remember" },
    ],
  },
  {
    // Never drawn from the random pool — only reached via drawEvent's
    // continuation check while colonyStage === 1, mid/late only.
    id: 'colony-raiders',
    title: "The convoy's distress call",
    flavor: "The convoy's distress call cuts through — raiders are on them, and yours is the only gun in range.",
    stages: ['mid', 'late'],
    options: [
      { label: "Let it happen — some fights aren't yours" },
      { label: 'Drive the raiders off' },
    ],
  },
  {
    // Never drawn from the random pool — only reached via drawEvent's
    // continuation check while colonyStage === 2, late only.
    id: 'colony-arrival',
    title: 'The colony makes orbit',
    flavor: 'The colony ship makes orbit at last — and the whole settlement knows whose guns got them there.',
    stages: ['late'],
    options: [
      { label: "The founders' gift (+10 credits and a part from their stores)" },
      { label: 'Cash settlement (+14 credits)' },
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

// The defector's pursuit, the relic chain's vault/core, and the two 49.x
// chains' continuation stages are only ever reached via RunState.
// pendingEventId or drawEvent's continuation checks below — none of them
// ever enters the random pool a normal node draw picks from.
const CONTINUATION_ONLY_IDS = new Set<EventId>([
  'defector-pursuit',
  'relic-vault',
  'relic-core',
  'debt-collectors',
  'colony-raiders',
  'colony-arrival',
]);
const RANDOM_EVENTS: EventDef[] = EVENTS.filter((e) => !CONTINUATION_ONLY_IDS.has(e.id));

// Iteration 34 (the relic chain, 34.2): once the chain has started
// (relicFragments 1 or 2) and isn't complete, every event-node draw first
// rolls a 50% continuation check — on a hit, the next stage fires instead
// of the normal pool. Deliberately p=.5, not "stage 2/3 join the normal
// pool": with ~9 reachable event nodes per run and a 14-event pool, three
// uniform draws would complete the chain roughly never. This makes an
// event-seeking player finish it most runs they start it early, while
// still letting it slip away — the one knob to retune if playtesting says
// too tight/loose. Stage 1 (relic-signal) is excluded from the normal
// pool once taken (fragments > 0) — it's a one-shot opener, not something
// that should keep reappearing once the chain is under way. `state` (not
// a bare `excludeId`) is now the parameter because both fragment state and
// lastEventId are needed here — see reducer.ts's PICK_NODE event branch,
// the single call site.
//
// Iteration 49.1: `col` is the ENTERED node's act-local column (not
// pre-move state.position — see reducer.ts's PICK_NODE, the one call
// site) and drives both the stage-filtered pool below and the two new
// chains' continuation checks. Priority order is relic -> debt -> colony,
// FIRST ELIGIBLE CHAIN WINS the node's one continuation roll — an earlier
// chain that's live (its condition holds) shadows a later one entirely
// this node, whether or not its own roll actually hits. This keeps the
// relic chain's own behavior byte-compatible (still just the one
// unconditional `if` up front) while giving debt/colony their own turn
// only when the relic chain isn't currently mid-flight. Pending chains
// that get shadowed just wait for their next eligible event node.
export function drawEvent(rng: RngFn, state: RunState, col: number): EventId {
  const stage = eventStage(state.act, col);
  const fragments = state.relicFragments ?? 0;
  if (fragments === 1 || fragments === 2) {
    if (rng() < 0.5) return fragments === 1 ? 'relic-vault' : 'relic-core';
  } else if (state.loanOutstanding && stage !== 'early') {
    if (rng() < 0.5) return 'debt-collectors';
  } else if (state.colonyStage === 1 && stage !== 'early') {
    if (rng() < 0.5) return 'colony-raiders';
  } else if (state.colonyStage === 2 && stage === 'late') {
    if (rng() < 0.5) return 'colony-arrival';
  }
  const excluded = new Set<EventId>();
  if (state.lastEventId) excluded.add(state.lastEventId);
  if (fragments > 0) excluded.add('relic-signal');
  const stagePool = RANDOM_EVENTS.filter((e) => e.stages.includes(stage));
  const pool = stagePool.filter((e) => !excluded.has(e.id));
  const options = pool.length > 0 ? pool : stagePool.length > 0 ? stagePool : RANDOM_EVENTS;
  return options[Math.floor(rng() * options.length)].id;
}

// 2026-08-07: every no-fight or regular-enemy event reward caps at rare —
// FIVE_CREDIT_PARTS is entirely rare-tier (plasma/missile/comp2/shield2/
// hull2 are all 5-6cr rare parts). The one exception is 'ancient-cache''s
// risky path, which now fights a true ELITE (not just the depth band's
// hardest regular enemy) and draws from ELITE_CACHE_PARTS instead — see
// that event below.
const FIVE_CREDIT_PARTS: PartId[] = ['plasma', 'missile', 'comp2', 'shield2', 'hull2'];
// Epic, with one legendary mixed in — only ever drawn for a fight against
// a genuine elite-strength enemy (eliteVariant), never a regular one.
const ELITE_CACHE_PARTS: PartId[] = ['comp3', 'init3', 'shield3', 'hull3', 'shieldharmonic'];
// 49.3 (war-surplus-peddler's mystery crate): capped at common so it can't
// shortcut the shop economy — the commodity lot / Ancient artifact /
// captured schematic specials are never in `PARTS` to begin with (see
// isSalvageablePart's own note in parts.ts), so this filter already
// excludes them without needing a hand-list.
const COMMON_CRATE_PARTS: PartId[] = PARTS.filter((p) => p.rarity === 'common' && isSalvageablePart(p.id)).map(
  (p) => p.id,
);

function clampCredits(credits: number): number {
  return Math.max(0, credits);
}

// 47.5p: outcome builders for resolveEventChoice's single-effect returns
// (a pure credit change, or a pure inventory grant, with nothing else
// touched). Verified before writing these: every one of the 5 existing
// negative-credit call sites already clamped via clampCredits — the
// plan's original caution about inconsistent clamping didn't hold
// against the current file, so `pay` clamping unconditionally changes
// nothing for any of them. Multi-effect returns (credits AND inventory,
// credits AND heat, fleet AND relicFragments, etc.) are left as manual
// returns — forcing those through a 2-argument builder would obscure
// them, not simplify them.
function pay(state: RunState, delta: number, outcomeText: string): EventResolution {
  return { state: { ...state, credits: clampCredits(state.credits + delta) }, outcomeText };
}

function grant(state: RunState, partId: PartId, outcomeText: string): EventResolution {
  return { state: { ...state, inventory: [...state.inventory, partId] }, outcomeText };
}

// Applies damage to one chosen ship, capped so it always survives with
// >= 1 HP. The design law for this iteration: costs are chosen (the player
// picked this ship for this option), never random.
function applyCappedDamage(
  fleet: PlayerShipState[],
  shipIndex: number,
  amount: number,
  protocols?: ProtocolId[],
): PlayerShipState[] {
  return mapShip(fleet, shipIndex, (ship) => {
    const hp = deriveStats(ship.frameId, ship.equipped, ship.upgrades, protocols).hp;
    const maxDamage = hp - 1;
    return { ...ship, damage: Math.min(maxDamage, ship.damage + amount) };
  });
}

// `bank`: the Engineer (iteration 21) banks any repair that heals past the
// ship's actual damage instead of wasting it — see ship.ts's
// applyRepairBanking. Everyone else keeps the plain clamp.
function applyRepair(fleet: PlayerShipState[], shipIndex: number, amount: number, bank: boolean): PlayerShipState[] {
  return mapShip(fleet, shipIndex, (ship) =>
    bank ? applyRepairBanking(ship, amount) : { ...ship, damage: Math.max(0, ship.damage - amount) },
  );
}

// Fleet triage (iteration 20): every ship at once, instead of the tender's
// usual pick-one patch-up — a broader but shallower repair, for a player
// blunting the damage-carryover spiral rather than fixing one bad fight.
function applyRepairAll(fleet: PlayerShipState[], amount: number, bank: boolean): PlayerShipState[] {
  return fleet.map((ship) =>
    bank ? applyRepairBanking(ship, amount) : { ...ship, damage: Math.max(0, ship.damage - amount) },
  );
}

function randomPart(rng: RngFn, pool: PartId[]): PartId {
  return pickOne(pool, rng);
}

function pickFromPool(pool: EnemyDef[], rng: RngFn): EnemyDef {
  return pickOne(pool, rng);
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
  partId?: PartId;
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
        return pay(state, 4, 'You strip the hull for 4 credits.');
      }
      if (choiceIndex === 1) {
        const shipIndex = selection.shipIndex ?? 0;
        if (rng() < 0.5) {
          const partId = randomPart(rng, FIVE_CREDIT_PARTS);
          return grant(state, partId, `The reactor yields a working ${getPart(partId).name}.`);
        }
        return {
          state: { ...state, fleet: applyCappedDamage(state.fleet, shipIndex, 2, state.protocols) },
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
        return pay(state, -2, 'The detour costs 2 credits in burned fuel.');
      }
      if (choiceIndex === 1) {
        const shipIndex = selection.shipIndex ?? 0;
        if (rng() < 0.5) {
          return pay(state, 5, 'You thread the field and find 5 credits of salvage.');
        }
        return {
          state: { ...state, fleet: applyCappedDamage(state.fleet, shipIndex, 2, state.protocols) },
          outcomeText: 'A collision damages the lead ship.',
        };
      }
      // choiceIndex 2: full burn — every ship clears initiative 2, clean.
      return pay(state, 5, 'Every ship threads the gap in formation — 5 credits of salvage, no scrapes.');
    }

    case 'ancient-cache': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You leave the cache sealed.' };
      }
      // 2026-08-07: the risky, fight-linked path draws a genuine ELITE
      // (eliteVariant, not just the depth band's hardest regular enemy)
      // and a matching epic/legendary reward — regular-enemy or no-fight
      // paths cap at rare (see FIVE_CREDIT_PARTS's own note).
      if (choiceIndex === 1) {
        const col = state.position?.col ?? 0;
        const partId = randomPart(rng, ELITE_CACHE_PARTS);
        return {
          state: { ...state, inventory: [...state.inventory, partId] },
          outcomeText: `The cache yields a ${getPart(partId).name} — but the surge attracts an ELITE patrol.`,
          ambushEnemy: eliteVariant(hardestEnemyForAmbush(state.act, col)),
        };
      }
      // choiceIndex 2: cloaked entry — no fight, no risk, capped at rare.
      const safePartId = randomPart(rng, FIVE_CREDIT_PARTS);
      return grant(state, safePartId, `Cloaked, you pull a ${getPart(safePartId).name} from the core without tripping the alarm.`);
    }

    case 'abandoned-arsenal': {
      if (choiceIndex === 0) {
        return pay(state, 3, 'You sell the scrap for 3 credits.');
      }
      // choiceIndex 1: take a crate — a random part, sight unseen.
      const partId = randomPart(rng, FIVE_CREDIT_PARTS);
      return grant(state, partId, `You take a crate — inside is a working ${getPart(partId).name}.`);
    }

    case 'intercepted-signal': {
      if (choiceIndex === 0) {
        return pay(state, 5, 'You sell the codes for 5 credits.');
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
        return pay(state, 4, 'You strip the drone for 4 credits.');
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
        return pay(state, 3, 'You decide it is too risky and move on for 3 credits.');
      }
      const { state: cancelledState, text } = revealAndCancel(state);
      if (choiceIndex === 1) {
        const shipIndex = selection.shipIndex ?? 0;
        const fleet = applyCappedDamage(cancelledState.fleet, shipIndex, 2, cancelledState.protocols);
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
        return pay(state, 6, 'You turn them in for 6 credits.');
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
      return pay(state, -6, 'You pay the ransom the old wing demands. They peel off.');
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
          ambushBonus: { credits: 2, partId },
        };
      }
      // choiceIndex 2: lure beacon — no fight.
      return pay(state, 4, 'Your lure beacon draws the raiders onto a false trail; the grateful survivors wire over 4 credits.');
    }

    case 'repair-tender': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You move on.' };
      }
      const shipIndex = selection.shipIndex ?? 0;
      const bank = state.commanderId === 'engineer';
      if (choiceIndex === 1) {
        return {
          state: {
            ...state,
            credits: clampCredits(state.credits - 4),
            fleet: applyRepair(state.fleet, shipIndex, 3, bank),
          },
          outcomeText: 'The tender patches up your chosen ship for 4 credits.',
        };
      }
      if (choiceIndex === 2) {
        // Damage control bay — same single-ship repair, free.
        return {
          state: { ...state, fleet: applyRepair(state.fleet, shipIndex, 3, bank) },
          outcomeText: 'Your crews trade technique notes with the tender — a free repair for your chosen ship.',
        };
      }
      // choiceIndex 3: full-fleet overhaul — every ship, 2 damage, 8 credits.
      return {
        state: {
          ...state,
          credits: clampCredits(state.credits - 8),
          fleet: applyRepairAll(state.fleet, 2, bank),
        },
        outcomeText: 'The tender crew works the whole fleet at once — every ship repairs 2 damage, for 8 credits.',
      };
    }

    case 'militia-requisition': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You refuse the requisition.' };
      }
      const partId = selection.partId;
      const inventory = partId ? removeOnce(state.inventory, partId) : state.inventory;
      return {
        state: { ...state, inventory, credits: state.credits + 7 },
        outcomeText: `You donate your ${partId ? getPart(partId).name : 'part'} for 7 credits.`,
      };
    }

    case 'salvage-claim': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You leave the field behind.' };
      }
      // Iteration 21: the Spymaster knows the patrol schedules — salvage
      // claims cost them no heat at all, the one doctrine hook this event
      // has. Everyone else pays the normal price.
      const spymaster = state.commanderId === 'spymaster';
      if (choiceIndex === 1) {
        return {
          state: { ...state, credits: state.credits + 8, heat: spymaster ? state.heat : addHeat(state.heat, 1) },
          outcomeText: spymaster
            ? 'You strip the field for 8 credits — you know these patrol routes; no one is watching.'
            : 'You strip the field for 8 credits — the extra time in the open costs you a point of heat.',
        };
      }
      // choiceIndex 2: thorough sweep — more credits, more heat.
      return {
        state: { ...state, credits: state.credits + 12, heat: spymaster ? state.heat : addHeat(state.heat, 2) },
        outcomeText: spymaster
          ? 'A thorough sweep nets 12 credits — timed clean around the patrol schedule, no heat at all.'
          : 'A thorough sweep nets 12 credits — but lingering that long draws real attention: +2 heat.',
      };
    }

    case 'relic-signal': {
      if (choiceIndex === 0) {
        return pay(state, 4, 'You sell the coordinates for 4 credits and leave the beacon behind.');
      }
      // choiceIndex 1: take the fragment.
      return {
        state: { ...state, relicFragments: 1, heat: addHeat(state.heat, 1) },
        outcomeText:
          'You pry the fragment loose — the effort lights up every scanner in the sector. First fragment secured.',
      };
    }

    case 'relic-vault': {
      if (choiceIndex === 0) {
        return pay(state, 5, "You strip the vault's fittings for 5 credits, leaving the fragment sealed inside.");
      }
      if (choiceIndex === 1) {
        const shipIndex = selection.shipIndex ?? 0;
        return {
          state: {
            ...state,
            relicFragments: 2,
            fleet: applyCappedDamage(state.fleet, shipIndex, 2, state.protocols),
          },
          outcomeText: "You force the lock — the vault's defenses score your hull, but the second fragment is yours.",
        };
      }
      // choiceIndex 2: cloaked entry — same fragment, no damage.
      return {
        state: { ...state, relicFragments: 2 },
        outcomeText: 'Cloaked, you slip through the dead defenses and pull the second fragment free without a scratch.',
      };
    }

    case 'relic-core': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: state.credits + 10, relicFragments: 0 },
          outcomeText: 'You sell both fragments to the reliquary for 10 credits — the chain ends here.',
        };
      }
      if (choiceIndex === 1) {
        return {
          state: {
            ...state,
            credits: clampCredits(state.credits - 8),
            relicFragments: 3,
            inventory: [...state.inventory, ANCIENT_ARTIFACT_PART_ID],
          },
          outcomeText: 'You buy the final fragment for 8 credits. The three pieces lock together — the Ancient artifact is assembled.',
        };
      }
      // choiceIndex 2: take it by force.
      return {
        state: {
          ...state,
          relicFragments: 3,
          heat: addHeat(state.heat, 2),
          inventory: [...state.inventory, ANCIENT_ARTIFACT_PART_ID],
        },
        outcomeText: 'You take the final fragment by force — the reliquary screams an alarm. The Ancient artifact is assembled.',
      };
    }

    case 'customs-checkpoint': {
      if (choiceIndex === 0) {
        return pay(state, -1, 'You pay the toll and pass through.');
      }
      if (choiceIndex === 1) {
        return {
          state: { ...state, heat: addHeat(state.heat, 1) },
          outcomeText: 'You slip past the picket — the extra attention costs a point of heat.',
        };
      }
      // choiceIndex 2: nothing to declare — an empty hold is waved through.
      return { state, outcomeText: 'Your hold is empty. The picket waves you through without a second look.' };
    }

    case 'war-surplus-peddler': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You move on.' };
      }
      if (choiceIndex === 1) {
        const partId = randomPart(rng, COMMON_CRATE_PARTS);
        return {
          state: {
            ...state,
            credits: clampCredits(state.credits - 2),
            inventory: [...state.inventory, partId],
          },
          outcomeText: `You buy a mystery crate for 2 credits — inside, a ${getPart(partId).name}.`,
        };
      }
      // choiceIndex 2: sell them your scrap.
      return pay(state, 2, 'You sell them your scrap for 2 credits.');
    }

    case 'nav-buoy': {
      if (choiceIndex === 0) {
        return pay(state, 2, 'You scrap the buoy for 2 credits.');
      }
      // choiceIndex 1: pull its charts — reveal every node in the next column.
      const nextCol = (state.position?.col ?? -1) + 1;
      const revealedNodes = mergeRevealed(state.revealedNodes, columnPositions(state, nextCol));
      return {
        state: { ...state, revealedNodes },
        outcomeText: 'You pull the buoy\'s charts — every node in the next column is now visible.',
      };
    }

    case 'debt-broker': {
      if (choiceIndex === 0) {
        return { state, outcomeText: 'You decline politely.' };
      }
      // choiceIndex 1: take the loan.
      return {
        state: { ...state, credits: clampCredits(state.credits + 8), loanOutstanding: true },
        outcomeText: 'You take the loan — 8 credits now, 12 owed "whenever we find you."',
      };
    }

    case 'debt-collectors': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, credits: clampCredits(state.credits - 12), loanOutstanding: undefined },
          outcomeText: 'You settle the debt in full for 12 credits. The ledger is clear.',
        };
      }
      if (choiceIndex === 1) {
        // 49.4: `loanOutstanding` stays set at choice time — cleared only
        // via the ambush's win-conditional chainEffect (see AmbushBonus).
        // A loss leaves the debt live; the collectors return on a later
        // 50% roll — deliberate, the loan's teeth.
        return {
          state,
          outcomeText: 'You turn to fight the enforcers. Win, and the debt is cleared for good.',
          ambushEnemy: huntSquadForAmbush(state.act, rng),
          ambushBonus: { chainEffect: 'debt-cleared' },
        };
      }
      // choiceIndex 2: cloaking field — slip away, debt stays outstanding.
      return { state, outcomeText: 'Your cloak flickers online and the collectors sweep past. They will be back.' };
    }

    case 'colony-ship': {
      if (choiceIndex === 0) {
        return pay(state, 3, 'You sell them your survey charts for 3 credits.');
      }
      // choiceIndex 1: escort them through the debris belt.
      return {
        state: { ...state, colonyStage: 1 },
        outcomeText: "You escort the convoy clear of the debris belt — it costs nothing, but they'll remember.",
      };
    }

    case 'colony-raiders': {
      if (choiceIndex === 0) {
        return {
          state: { ...state, colonyStage: undefined },
          outcomeText: "You let it happen — some fights aren't yours. The convoy is on its own.",
        };
      }
      // choiceIndex 1: drive the raiders off. `colonyStage` clears at
      // choice time (a loss means the convoy scattered, chain dead) and is
      // only restored to 2 via the ambush's chainEffect on a win.
      return {
        state: { ...state, colonyStage: undefined },
        outcomeText: 'You peel off to drive the raiders from the convoy. Win, and the colonists remember your name.',
        ambushEnemy: easyRaidersForAmbush(state.act, rng),
        ambushBonus: { chainEffect: 'colony-defended' },
      };
    }

    case 'colony-arrival': {
      if (choiceIndex === 0) {
        const partId = randomPart(rng, FIVE_CREDIT_PARTS);
        return {
          state: {
            ...state,
            credits: state.credits + 10,
            inventory: [...state.inventory, partId],
            colonyStage: undefined,
          },
          outcomeText: `The founders gift you 10 credits and a ${getPart(partId).name} from their stores.`,
        };
      }
      // choiceIndex 1: cash settlement.
      return {
        state: { ...state, credits: state.credits + 14, colonyStage: undefined },
        outcomeText: 'The settlement wires over a 14-credit cash payment.',
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

