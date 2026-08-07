import type { CombatState, TargetingStance } from './combatEngine';
import type { CounterProtocolId } from './counterProtocols';
import type { EscalationId, ScheduledEscalation } from './escalations';
import type { EventId } from './events';
import type { FrameId } from './frames';
import type { CommanderId } from './commanders';
import type { GameMap, MapPosition } from './map';
import type { ProtocolId } from './protocols';
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
  // Shield harmonic (iteration 23): a pure passive, no active button. While
  // equipped anywhere in the fleet, adds this much shield to every ship's
  // derived stats for the whole fight (folded in once at fleet-derive time
  // — see ship.ts — not dynamically removed if the carrier dies mid-combat).
  fleetShieldAura?: number;
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
  // Iteration 30: which act-2 counter-protocol was folded into every
  // group's stats for this instance, if any — labeled on the enemy panel
  // like escalations/veterancy, only when it actually changed something
  // (act 2 + a drafted protocol both required — see reducer.ts).
  appliedCounter?: CounterProtocolId;
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
  // Iteration 18 ("the fleet remembers") — all optional with fallbacks at
  // every read, so pre-18 saves (and the many test fixtures that build
  // ships literally) stay valid without a SAVE_VERSION bump.
  name?: string; // seeded at commissioning ("ISV Resolute"); falls back to "Frame #N" in labels
  kills?: number; // enemy ships this hull has destroyed, across the whole run
  fightsSurvived?: number; // fights this hull came out of alive (wins and withdrawals)
  // Iteration 20 (war assets): a hired escort, good for exactly one combat.
  // Removed from the fleet the moment that combat resolves (win, loss, or
  // withdrawal) — see reducer.ts's CONTINUE/WITHDRAW. No salvage, no kill
  // credit, doesn't count toward shipsLost.
  mercenary?: boolean;
  // Iteration 20 (commodity runs), moved here in iteration 21: the GLOBAL
  // column (map.ts's globalColumn) where THIS ship's commodity lot was
  // bought, if it's carrying one. Originally lived as a single scalar on
  // RunState, which only worked because at most one lot could ever exist
  // fleet-wide; the Merchant's cap-2 (iteration 21) needs two lots
  // independently eligible on their own schedules. Tracking it on the ship
  // instead of RunState also means it needs no re-indexing on scuttle (the
  // whole ship, and the field, are just gone) and is cleared automatically
  // if the ship is destroyed — exactly the "lost with the ship" rule the
  // lot was always supposed to follow.
  commodityLotBoughtAtGlobalColumn?: number;
  // Iteration 21 (the Engineer, over-repair): banked from a repair effect
  // that healed past this ship's actual damage, cap 2 — see ship.ts's
  // applyRepairBanking. Folded into ablativeRemaining for this ship's next
  // fight (deriveFleetForCombat) and cleared the moment that fight starts
  // (reducer.ts's ENGAGE), so it can never carry into a second fight.
  overRepairBank?: number;
  // Iteration 31 (the Foundry): permanent, slotless base-stat increments
  // fused into this hull for escalating credits — a late-run credit sink.
  // Not a part (never salvaged, never unequipped), lost only if the ship
  // carrying it is destroyed, same physics as `upgrades` above. Absent on
  // every pre-31 save/ship; every read (deriveStats) falls back to 0.
  fusions?: { hp?: number; computer?: number; shield?: number; initiative?: number };
}

// Iteration 18: run-wide counters for the end-screen summary and the daily
// share text. Lives on RunState (optional — see PlayerShipState note).
export interface RunStats {
  fightsWon: number;
  fightsWithdrawn: number;
  shipsLost: string[]; // names, in the order they were lost
  damageDealt: number; // summed from roll events; arc/prow/rift side-damage undercounted by design
  damageTaken: number;
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

// A passive PART effect (as opposed to a played reaction card): flak
// shooting down a missile, reactive armor negating a hit, a rift cannon
// backfiring on its own ship.
export interface PartEffectEvent {
  kind: 'part-effect';
  text: string;
}

// Iteration 17: a ship whose initiative beat the fastest surviving opposing
// ship's by OUTSPEED_GAP or more gets a second, cannons-only activation this
// round. Structured (side + shipIndex) like `destroyed`, rather than
// pre-composed text, so the UI resolves the ship's real label the same way
// it does for rolls and destructions instead of the engine guessing a name.
export interface OutspeedEvent {
  kind: 'outspeed';
  side: Side;
  shipIndex: number;
}

export type CombatEvent =
  | DieRollEvent
  | DestroyedEvent
  | PhaseEvent
  | StalemateEvent
  | PartEffectEvent
  | OutspeedEvent;

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
  | 'protocol-draft'
  | 'flagship-recovery'
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
  escalations: ScheduledEscalation[]; // seeded at run start from the map seed
  bossRevealed: boolean; // the boss dossier has been bought
  visionCol: number; // fog of war high-water mark — node types in columns <= this are visible
  revealedNodes: MapPosition[]; // targeted reveals (deep scan) on top of the vision high-water mark
  commanderChoices: CommanderId[]; // 3 of 4, seeded at run start
  commanderId?: CommanderId; // chosen once, during the 'commander' phase
  currentEnemy?: EnemyDef; // picked once, when a combat/elite/boss node is entered
  combat?: CombatState; // in-progress or just-finished fight
  pendingReward?: RewardSummary;
  shopOffers?: PartId[]; // parts currently for sale — a shipyard visit sets this to [] (no parts, still "present")
  shopFrameOffers?: Exclude<FrameId, 'cruiser'>[]; // ships currently for sale — a random subset, drawn per visit
  // 2026-08-06: rerolls escalate within a single shop visit (1cr, 2cr,
  // 3cr, ...) instead of a flat price — this counts how many have already
  // been used THIS visit. Reset to undefined every time a shop is entered
  // (PICK_NODE), so the price resets on the next visit rather than
  // punishing the whole run. Absent/0 means "no rerolls used yet."
  shopRerollCount?: number;
  // Iteration 33 (2026-08-07): which trade-station flavor this shop visit
  // is — set in PICK_NODE from the node's type ('shop' -> 'store',
  // 'shipyard' -> 'shipyard'), cleared on LEAVE_SHOP. Absent means a save
  // from before this field existed, which was always a 'store' (the only
  // kind that existed then) — every reader falls back to that.
  shopKind?: 'store' | 'shipyard';
  // Iteration 33: the shipyard's single purchasable upgrade this visit,
  // drawn on arrival like shopFrameOffers, cleared on purchase or on
  // LEAVE_SHOP. Only ever set when shopKind === 'shipyard'.
  shopUpgradeOffer?: UpgradeId;
  currentEvent?: CurrentEventState;
  lastEventId?: EventId; // avoids repeating the same event back-to-back
  // Iteration 14.3: set by the defector's "take them aboard" choice. The
  // next event node drawn consumes this instead of rolling the pool, then
  // clears it — a one-off forced follow-up, not a queue. Never un-set by
  // anything except being consumed (if the run ends first, it just never
  // fires).
  pendingEventId?: EventId;
  // Iteration 34 (the relic chain): fragments of the Ancient artifact
  // collected so far, from three distinct event nodes (relic-signal ->
  // relic-vault -> relic-core). Optional-additive — absent means 0, same
  // as every pre-34 save. 3 means the artifact is already assembled and
  // in inventory; the chain never offers stage 2/3 again once here (see
  // events.ts's drawEvent). Reset to 0 only by the reliquary's sell-out
  // choice — every other decline just leaves the count where it was.
  relicFragments?: 0 | 1 | 2 | 3;
  // Set by EVENT_CONTINUE when an event choice's ambush carries a
  // win-conditional bonus (see `AmbushBonus`); consumed and cleared by
  // CONTINUE once that combat resolves, win or lose.
  pendingAmbushBonus?: AmbushBonus;
  // Repair yard (iteration 15.3): arriving draws 3 overhaul upgrade options
  // (always, whether or not they end up used) and enters a *choosing*
  // sub-state — neither `repairSummary` nor a fleet heal exist yet.
  // `repairSummary` being set is what marks the choice as resolved (either
  // branch sets it); both fields clear together on LEAVE_REPAIR.
  repairUpgradeOptions?: UpgradeId[];
  repairSummary?: string; // flavor text shown once the repair choice is resolved
  // Iteration 15.2: the pursuit track. 0-4, deterministic counter arithmetic
  // only (see `heat.ts`) — never touched by an rng draw.
  heat: number;
  // True only while the current prep/combat is a heat-4 interception (a
  // hunter-killer squad that replaced a shop/repair/event node's real
  // content) — lets CONTINUE/WITHDRAW reset heat to 0 instead of applying
  // the normal win/withdraw delta, and lets `hasLineOfRetreat` use the
  // node's real reachability instead of the "no retreat" rule that applies
  // to an event's own in-screen ambush choice.
  interceptionActive?: boolean;
  // Iteration 18: the daily run. All optional — absence means a standard
  // run (every pre-18 save), and reads fall back accordingly.
  mode?: 'standard' | 'daily';
  dailyDate?: string; // the YYYY-MM-DD this daily was generated for
  shipsCommissioned?: number; // naming counter — ships ever created this run (not fleet size)
  runStats?: RunStats;
  // Iteration 24 (Flagship recovery): the Flagship is the one hull that can
  // never be rebought — losing it in a fight the fleet otherwise survives
  // used to just mean it was gone for good. Now that gates whatever the
  // fight's natural next phase would have been (reward/interlude/victory/
  // map) behind a one-time salvage offer. `flagshipRecoveryResumePhase`
  // is that natural next phase, restored once the offer resolves either way
  // — every other field the natural transition would have set (fleet,
  // credits, pendingReward, etc.) is already sitting on RunState by the
  // time this gate applies, so resuming needs nothing more than swapping
  // `phase` back.
  pendingFlagshipRecovery?: { cost: number; shipName: string; kills: number; fightsSurvived: number };
  flagshipRecoveryResumePhase?: Phase;
  // Iteration 28 (Protocols): the act-1 boss reward's one-time augment
  // draft. `protocolOffers` is set the moment the act-1 boss is beaten
  // (same 9.1 discipline as combat seeds — drawn once, so a reload can
  // never reroll the offers) and cleared once PROTOCOL_CHOOSE resolves it.
  // `protocols` is the permanent record of what was picked — an array
  // even though v1 can only ever hold one entry, so a future iteration
  // that adds a second draft moment needs no shape change.
  protocolOffers?: ProtocolId[];
  protocols?: ProtocolId[];
  // Iteration 30 (counter-protocols): drawn at the same moment as
  // protocolOffers, index-paired with it ([silver, gold, prismatic] both
  // times) — offer i's counter is protocolCounterOffers[i]. Cleared once
  // PROTOCOL_CHOOSE resolves; a mid-draft save from before this field
  // existed loads fine with it simply absent (the legacy run finishes as
  // drafted, with no counter). `counterProtocol` is the permanent record,
  // applied to every act-2 enemy from here on — see enemies.ts's
  // applyCounterProtocol and its reducer.ts call sites.
  protocolCounterOffers?: CounterProtocolId[];
  counterProtocol?: CounterProtocolId;
}
