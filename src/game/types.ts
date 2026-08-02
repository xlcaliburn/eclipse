import type { CardId } from './cards';
import type { CombatState, TargetingStance } from './combatEngine';
import type { EscalationId, ScheduledEscalation } from './escalations';
import type { EventId } from './events';
import type { FrameId } from './frames';
import type { CommanderId } from './commanders';
import type { GameMap, MapPosition } from './map';
import type { ActiveQuest } from './quests';
import type { UpgradeId } from './upgrades';

export type PartType = 'weapon' | 'computer' | 'shield' | 'hull' | 'drive' | 'cargo';

export type WeaponKind = 'cannon' | 'missile';

export interface Part {
  id: string;
  name: string;
  type: PartType;
  description: string;
  cost: number; // shop price in credits
  // Weapon parts fire `diceCount` dice of `damage` each, in the given phase.
  // `selfDamageOnNatOne` (rift cannon): a natural 1 does not miss — it deals
  // that much direct damage to the firing ship instead. `shieldPierce` here
  // is PER-DIE (the Gauss lance), distinct from the ship-level field below
  // (optics) — the two stack. `aoeDamage` (arc projector): on a hit, deals
  // this much damage to every enemy ship once, instead of the normal
  // single-target hit. `targetHighest` (siege cannon): this die's target is
  // the highest-remaining-HP candidate instead of the lowest (taunt/cloak
  // filtering still applies first).
  weapon?: {
    kind: WeaponKind;
    diceCount: number;
    damage: number;
    selfDamageOnNatOne?: number;
    shieldPierce?: number;
    aoeDamage?: number;
    targetHighest?: boolean;
  };
  computer?: number;
  shield?: number;
  hull?: number;
  initiative?: number;
  flak?: number; // enemy missile dice this ship's flak batteries cancel per combat
  taunt?: boolean; // lure beacon: forces all enemy dice onto this ship while alive
  reactiveArmor?: number; // hits negated per round (stacks)
  onDestroyDamage?: number; // ramming prow: dealt to the lowest-HP enemy the instant this ship dies
  ablative?: number; // ablative coating: temporary HP, absorbed before real HP, not carried between fights
  capacitorShield?: number; // shield capacitor: bonus shield, missile phase + first cannon round only
  cloak?: boolean; // cloaking field: untargetable unless every surviving player ship is also cloaked
  active?: boolean; // this part has a once-per-combat activated ability (id doubles as the ability id)
}

export type PartId = string;

// Derived combat stats for a single ship (one of the player's fleet, or one
// enemy ship in a group — all ships in an enemy group share these stats).
export interface WeaponStats {
  diceCount: number;
  damage: number;
  selfDamageOnNatOne?: number;
  shieldPierce?: number;
  aoeDamage?: number;
  targetHighest?: boolean;
}

export interface ShipStats {
  initiative: number;
  hp: number;
  computer: number;
  shield: number;
  cannons: WeaponStats[];
  missiles: WeaponStats[];
  // How many points of a defender's shield this ship's attacks ignore
  // (from the `optics` upgrade). Absent/0 for anything without it. Stacks
  // with any per-die `shieldPierce` on the weapon itself (the Gauss lance).
  shieldPierce?: number;
  flak?: number;
  taunt?: boolean;
  reactiveArmor?: number;
  onDestroyDamage?: number;
  ablative?: number;
  capacitorShield?: number;
  cloak?: boolean;
  // Innate to the Interceptor frame (iteration 8, addendum A.1): once per
  // combat, the first hit that would land on this ship misses instead.
  // Consumed before reactive armor. Never granted by a part.
  jink?: boolean;
  // Part ids (in equip order) of every active part this ship carries — each
  // entry is one independently-triggerable, once-per-combat ability.
  actives?: PartId[];
}

// Iteration 9: an enemy is a composition of one or more sub-groups, each
// with its own stats/count/initiative — a uniform single-group enemy is
// just a one-entry composition. `label` is shown on the enemy panel's
// per-sub-group stat card (e.g. "sniper" / "screen").
export interface EnemyGroup {
  label: string;
  count: number;
  stats: ShipStats;
}

export interface EnemyDef {
  id: string;
  name: string;
  groups: EnemyGroup[];
  blurb: string;
  // Which run-escalations were folded into every group's stats for this
  // particular instance, so the enemy panel can label what changed and why.
  appliedEscalations?: EscalationId[];
  // The per-column veterancy HP bonus folded into every group's stats.hp,
  // if any (iteration 8) — labeled on the enemy panel like escalations.
  veterancyBonus?: number;
}

// One ship in the player's fleet: a frame plus the parts bolted onto it.
// `damage` persists between fights — there is no free healing outside a
// repair-yard map node. `upgrades` are slotless and permanent (elite drops):
// they don't occupy frame slots and are lost only if the ship is destroyed.
export interface PlayerShipState {
  frameId: FrameId;
  equipped: PartId[];
  damage: number;
  upgrades: UpgradeId[];
}

// --- Combat log -------------------------------------------------------

export type Side = 'player' | 'enemy';

export interface DieRollEvent {
  kind: 'roll';
  phase: 'missile' | 'cannon';
  round: number; // 1-indexed cannon round; missile phase uses round 0
  side: Side;
  shooterIndex: number; // index of the shooting ship within its side
  targetIndex: number; // index of the targeted ship within the defending side
  raw: number; // 1-6
  computer: number; // shooter's computer
  shield: number; // target's shield
  hit: boolean;
  damage: number; // damage dealt if hit, else 0
}

export interface DestroyedEvent {
  kind: 'destroyed';
  side: Side; // side that lost the ship
  shipIndex: number;
}

export interface PhaseEvent {
  kind: 'phase-start';
  phase: 'missile' | 'cannon';
  round: number;
}

export interface StalemateEvent {
  kind: 'stalemate';
}

// A reaction-card play or trigger, for the combat log ("Point-defense screen
// negates the missile phase.", "Emergency bulkheads keep a ship at 1 HP.").
export interface CardEvent {
  kind: 'card';
  cardId: CardId;
  text: string;
}

// A passive PART effect (as opposed to a played reaction card): flak
// shooting down a missile, reactive armor negating a hit, a rift cannon
// backfiring on its own ship.
export interface PartEffectEvent {
  kind: 'part-effect';
  text: string;
}

export type CombatEvent =
  | DieRollEvent
  | DestroyedEvent
  | PhaseEvent
  | StalemateEvent
  | CardEvent
  | PartEffectEvent;

export interface CombatResult {
  winner: Side;
  log: CombatEvent[];
}

// --- Run state ----------------------------------------------------------

export type Phase =
  | 'commander'
  | 'setup'
  | 'map'
  | 'prep'
  | 'combat'
  | 'reward'
  | 'shop'
  | 'repair'
  | 'event'
  | 'interlude'
  | 'victory'
  | 'defeat';

// A bonus payout conditional on winning the fight an ambush choice leads
// into — the reward pipeline can't know the outcome at EVENT_CHOOSE time, so
// it rides along on RunState (`pendingAmbushBonus`) until CONTINUE resolves
// the combat.
export interface AmbushBonus {
  credits?: number;
  partId?: PartId;
}

export interface CurrentEventState {
  eventId: EventId;
  outcomeText?: string; // set once a choice has been made
  ambushEnemy?: EnemyDef; // set when this choice leads into a fight
  ambushBonus?: AmbushBonus; // carried onto RunState.pendingAmbushBonus by EVENT_CONTINUE
}

// What a won combat paid out, shown on the `reward` screen. Credits,
// salvage, and any card are already applied to RunState by the time this is
// built — this is a report, not a pending transaction. `upgradeOptions` is
// the one thing still pending a player decision (elites only).
export interface RewardSummary {
  credits: number; // credits earned at this node
  creditsTotal: number; // running total after the award
  intelText?: string; // the Spymaster's post-fight intelligence, if any was gained
  cardGained?: CardId; // elite card drop, if any
  cardInsteadCredits?: number; // the +4 fallback when the hand was full
  salvagedParts: PartId[]; // parts recovered from destroyed ships
  lostShips: string[]; // labels of ships destroyed this fight
  upgradeOptions?: UpgradeId[]; // elites only: 3 choices, unresolved until picked
}

export interface RunState {
  phase: Phase;
  map: GameMap;
  act: 1 | 2; // iteration 8: the run is two acts; position/visited/fled/fog reset at the interlude
  // Iteration 9: every draw after NEW_RUN's one nondeterministic seed flows
  // through this counter (see `rng.ts`'s `resumeRng`, continuing the same
  // `map.seed` stream that map generation/escalations/commander draw
  // already used) — reload-and-replay can never change fate.
  rngCounter: number;
  currentCombatSeed?: number; // drawn at PICK_NODE, not ENGAGE, so a reload before Engage can't reroll the fight
  // Iteration 9.4: fleet-wide player targeting doctrine, set on the prep
  // screen and persisting between fights until changed. Applies to every
  // player cannon/missile die; the siege cannon's own per-die override
  // still always wins; enemy targeting is untouched.
  targetingStance: TargetingStance;
  position: MapPosition | null; // null before the first node is picked
  visited: MapPosition[];
  fled: MapPosition[]; // withdrawn-from nodes — visible on the map, never pickable again
  credits: number;
  inventory: PartId[]; // owned, unequipped parts
  fleet: PlayerShipState[];
  hand: CardId[]; // reaction cards currently held
  escalations: ScheduledEscalation[]; // seeded at run start from the map seed
  bossRevealed: boolean; // the boss dossier has been bought
  visionCol: number; // fog of war high-water mark — node types in columns <= this are visible
  revealedNodes: MapPosition[]; // targeted reveals (deep scan) on top of the vision high-water mark
  activeQuest?: ActiveQuest; // capped at 1
  shopQuestOffer?: ActiveQuest; // this shop visit's job-board offer, if any
  commanderChoices: CommanderId[]; // 3 of 4, seeded at run start
  commanderId?: CommanderId; // chosen once, during the 'commander' phase
  currentEnemy?: EnemyDef; // picked once, when a combat/elite/boss node is entered
  combat?: CombatState; // in-progress or just-finished fight
  pendingReward?: RewardSummary;
  shopOffers?: PartId[]; // parts currently for sale
  currentEvent?: CurrentEventState;
  lastEventId?: EventId; // avoids repeating the same event back-to-back
  // Iteration 14.3: set by the defector's "take them aboard" choice. The
  // next event node drawn consumes this instead of rolling the pool, then
  // clears it — a one-off forced follow-up, not a queue. Never un-set by
  // anything except being consumed (if the run ends first, it just never
  // fires).
  pendingEventId?: EventId;
  // Set by EVENT_CONTINUE when an event choice's ambush carries a
  // win-conditional bonus (see `AmbushBonus`); consumed and cleared by
  // CONTINUE once that combat resolves, win or lose.
  pendingAmbushBonus?: AmbushBonus;
  repairSummary?: string; // flavor text shown after a repair-yard visit
}
