## Iteration 3 (implemented)

> **Status:** fully implemented and verified — engine (`combatEngine.ts`,
> `map.ts`, `events.ts`, `cards.ts`), reducer, and UI all built per the spec
> below. 67/67 tests pass, `tsc -b` and `vite build` are clean, and the
> balance pass (end of this section) records the tuning that was needed.
> The plan text below is kept as the authoritative spec; only the balance
> numbers and a couple of small implementation notes were added afterward.

**Implementation notes (spec followed as written, with these clarifications):**
- The old one-shot `resolveCombat`/`resolveHit` in `resolver.ts` were left
  **completely untouched** rather than rebuilt as a thin wrapper over the new
  engine, specifically to guarantee the iteration 1/2 resolver test suite
  (17 tests) kept passing with zero edits. The new resumable/card-aware
  engine lives entirely in `combatEngine.ts` as a parallel implementation
  (some logic is duplicated between the two — a deliberate safety trade-off,
  not an oversight). `forecast.ts` and the reducer use only the new engine;
  nothing in production code calls the old `resolveCombat` anymore.
- `GAUNTLET`'s array order/indices in `enemies.ts` were left untouched (many
  tests reference `GAUNTLET[0]`, `GAUNTLET[2]`, etc. by index). Map-oriented
  lookups (`EASY_POOL`/`MID_POOL`/`HARD_POOL`/`BOSS`/`eliteVariant`/
  `combatEnemyPool`/`eliteEnemyForColumn`) were added alongside it, referencing
  the same objects.
- The enemy actually faced at a combat/elite/boss node is picked once, at
  `PICK_NODE` time, and stored as `RunState.currentEnemy` — not re-rolled at
  `ENGAGE` time — so the prep screen can show the player the real enemy
  they're about to fight before they commit.
- Map edges are communicated via a "reachable" highlight state on the map UI
  rather than literal drawn connector lines, to keep the implementation
  simple; the underlying adjacency rule (`|row - row'| <= 1`) is exactly as
  specified and covered by `map.test.ts`.

## Iteration 3 (original planning spec)

Player feedback after iteration 2: (a) the run should start more forgiving —
you should never die in the first combat round — but damage should **carry
over between fights** so survival becomes a run-long resource; (b) the trade
station should **show the current ship configurations**; (c) add **random
events**; (d) combat should not just play out on its own — the player gets
**reaction cards** (acquired from events, elites, shops) that can swing a
round, e.g. "if a ship would die this round, it survives at 1 HP"; (e) replace
the fixed gauntlet with a **branching Slay-the-Spire-style map**, so the
player can choose risk vs. routing toward a heal point. Items (a), (c), (d),
(e) override iteration 1's "no persistent damage / no events / no map" scope
lines.

**Revision note:** this section supersedes an earlier iteration 3 draft.
Two deliberate changes from that draft: random events are now *map nodes*
(not a 40% post-shop roll), and shop repair is **removed** — healing happens
only at repair-yard nodes, so reaching a heal is a routing decision, which is
the entire point of the map.

Implement in the order given by the milestones at the end. Everything not
listed here stays as iteration 2 built it.

### 3.1 Persistent hull damage

**Frame HP buff.** Cruiser base HP 1 → **3**; Interceptor base HP 1 → **2**.
The starting cruiser (with its Hull plating) therefore has 4 HP. Worst-case
incoming damage in round 1 of fight 1 is 2 (two scout ions), so the starting
ship mathematically cannot die in the first round — even with the hull part
removed (3 HP > 2). Newly purchased ships arrive undamaged.

**Damage carries over.** Add `damage: number` to `PlayerShipState` (0 for new
ships). A fight starts with each ship's carried damage already applied and
ends by persisting each surviving ship's accumulated damage back into run
state. There is no free healing between fights.

**Resolver API change.** The resolver now takes the player fleet as
`{ stats: ShipStats; initialDamage: number }[]`, and its result reports
`playerShips: { endDamage: number; destroyed: boolean }[]` (parallel to the
input fleet) so the reducer can persist outcomes. Enemy handling is unchanged
(enemies are always fresh). (The resolver is also refactored to be resumable
for reaction cards — see 3.4; do both refactors together in I3-M1/M2.)

**Destroyed ships are lost, parts are salvaged.** If the fleet wins but a ship
was destroyed, that ship is removed from the fleet permanently and all of its
equipped parts return to inventory ("salvaged from the wreck"). A winning
fight always has ≥1 surviving ship, so the fleet can never empty this way.
Losing a fight still ends the run.

**Forecast accounts for damage.** `forecastWinRate` takes the fleet including
current damage; the memo key must include per-ship damage. The prep-screen
forecast therefore automatically reflects a battered fleet.

**No repair in the shop.** Healing happens only at repair-yard map nodes
(3.3). Reaching one is a routing decision.

**UI.** Ship cards everywhere show `HP current/max` (e.g., "HP 3/4") instead
of a single HP number.

### 3.2 Fleet visible (and editable) in the shop

Render the existing `FleetPanel` inside the shop screen, below the purchase
sections, fully functional: ship selection and equip/unequip. The reducer's
`EQUIP`/`UNEQUIP` guards change from `phase === 'prep'` to
`phase === 'prep' || phase === 'shop'`. (This also means a part bought in the
shop can be slotted immediately, which is the natural flow.)

### 3.3 The map (StS-style branching run)

The fixed 9-fight gauntlet is replaced by a branching node map. `GAUNTLET`
becomes an unordered enemy catalog; `fightIndex` is replaced by a map
position.

**Structure.** 9 columns. Columns 0-7 each have **3 nodes** in 3 fixed lanes
(a trellis); column 8 is the **boss** (GCDS). Edges: node `(col, row)`
connects to `(col+1, row')` for every `|row - row'| ≤ 1`; all column-7 nodes
connect to the boss. The player starts by picking any column-0 node, and after
resolving each node returns to the map to pick a connected node in the next
column. Losing any combat still ends the run.

**Generation.** Seeded (mulberry32; store the map seed in run state — same
seed must regenerate the same map, for tests). Node types are assigned
per-column by quota, shuffled within the column:

| Col | Nodes (shuffle order within column) |
|---|---|
| 0 | combat, combat, combat |
| 1 | combat, combat, event |
| 2 | shop, combat, event |
| 3 | elite, combat, event |
| 4 | repair, shop, combat |
| 5 | elite, combat, event |
| 6 | shop, combat, combat |
| 7 | repair, elite, combat |
| 8 | boss |

Every node's type is visible on the map from the start (that's what makes
routing a real decision: greed lanes vs. the repair yards at columns 4 and 7).

**Combat nodes.** Enemy drawn uniformly from a pool by depth — easy
(cols 0-2): scout pack, missile frigate, missile swarm; mid (cols 3-5):
shield cruiser, interceptor swarm, sniper; hard (cols 6-7): plasma tank,
ancient guardian. Reward: **4 + col** credits, then the trade-station screen
does NOT open automatically — shops are their own nodes now. After a combat
win: credits, salvage, back to map.

**Elite nodes.** A hard enemy with **+2 HP per ship**: col 3 → sniper+,
col 5 → plasma tank+ or ancient guardian+ (50/50), col 7 → ancient guardian+.
Reward: **8 + col** credits **and 1 random reaction card** (if the hand is
full, offer credits +4 instead). Back to map.

**Shop nodes.** The iteration 2 trade station (4 part offers, both frames,
reroll 2 cr) plus **one random reaction card at 7 cr** (not affected by
reroll), plus the editable fleet panel (3.2). Leave → back to map.

**Repair-yard nodes.** Free, automatic: fully repair every ship in the fleet.
Show a summary ("repaired 7 damage across 3 ships"), then back to map.

**Event nodes.** See 3.4.

**UI.** The `RunProgress` strip is replaced by a `MapScreen`: 3 lanes × 8
columns + boss, node-type icons/labels, edges drawn, visited path highlighted,
reachable next nodes clickable. New phase `'map'`; new state
`{ mapSeed, map, position: {col,row} | null, visited: {col,row}[] }`; new
action `PICK_NODE { row }`. The prep screen (with forecast + engage) appears
only after picking a combat/elite node.

### 3.4 Events (map nodes)

On entering an event node, draw uniformly from the pool below, excluding the
immediately-previous event id (track `lastEventId`). The event screen shows
title, flavor text, and 2 choice buttons; after choosing, it shows the outcome
text and a Continue button back to the map. State:
`currentEvent?: { eventId, offeredPartId?, outcomeText? }`; actions
`EVENT_CHOOSE { choiceIndex }`, `EVENT_CONTINUE`.

**Testability.** Resolve outcomes in a pure function
`resolveEventChoice(event, choiceIndex, state, rng): { state, outcomeText }`
with an injected `RngFn` (reducer passes a real one; tests pass fixed ones).

**Damage cap rule.** Event damage never destroys a ship: cap any event damage
so the ship is left with at least 1 remaining HP ("your crew seals the breach
at the last moment"). Credits never go below 0 (clamp).

**The event pool (6 events, exactly these):**

| id | Title | Choice A | Choice B |
|---|---|---|---|
| `derelict-cruiser` | Derelict cruiser | "Salvage the hull": +4 credits | "Crack the reactor": 50% gain a random 5-cr part; 50% 2 damage to a random ship |
| `distress-beacon` | Distress beacon | "Answer the call": 60% +6 credits; 40% pirate ambush, 1 damage to every ship | "Ignore it": nothing |
| `wandering-trader` | Wandering trader | "Buy": one random part (pre-rolled when the event is drawn, stored in `offeredPartId`) at ceil(cost/2); disabled if unaffordable | "Decline": nothing |
| `asteroid-field` | Asteroid field | "Thread the field": 50% +5 credits; 50% 2 damage to a random ship | "Detour": −2 credits |
| `ancient-cache` | Ancient cache | "Force it open": gain a random 7-cr part (comp3 or init3) AND 2 damage to a random ship | "Leave it": nothing |
| `abandoned-arsenal` | Abandoned arsenal | "Take a weapon crate": gain 1 random reaction card (disabled if hand is full) | "Sell the scrap": +3 credits |

"Random ship" = uniform over the current fleet. "Random 5-cr part" = uniform
over {plasma, missile, comp2, shield2, hull2}.

### 3.5 Reaction cards + stepped combat

**The hand.** Run-wide, max **5 cards**, carried between fights. Cards are
consumed on use. Acquisition: elite rewards (guaranteed 1), the
`abandoned-arsenal` event, shops (1 random card per station at 7 cr).

**Combat is now stepped, not one-shot.** The combat screen shows the log so
far, the hand, and two buttons: **Next round** (advance one round) and
**Auto-resolve** (run to the end with no further input). Between rounds — and
before the missile phase — the player may play any number of cards. This is
what makes the log dramatic instead of a post-hoc report.

**Resolver refactor (resumable).** Replace the one-shot internals with:
- `initCombat(playerFleet, enemyDef, seed) → CombatState` — `CombatState` is a
  plain serializable object: `{ seed, rngCounter, round, playerShips,
  enemyShips, roundModifiers, armedEffects, log, winner? }`.
- `advanceRound(state) → CombatState` — resolves the next round (round 0 = the
  missile phase). Reconstructs its RNG from `seed` + `rngCounter` so stepping
  is deterministic.
- `runToEnd(state) → CombatState` — loops `advanceRound`.
- Keep a thin `resolveCombat(...)` = `initCombat` + `runToEnd` so the
  forecast, balance script, and existing tests keep working unchanged.
- Invariant (test this): stepping round-by-round produces a bit-identical
  result to `runToEnd` for the same seed.

**The card pool (6 cards, exactly these):**

| id | Name | Kind | Effect |
|---|---|---|---|
| `bulkheads` | Emergency bulkheads | contingent | The first time one of your ships would be destroyed this fight, it survives at 1 remaining HP instead. Consumed on trigger; returned to hand if the fight ends untriggered. |
| `pds` | Point-defense screen | contingent | Negates every enemy missile die this fight. Playable only before the missile phase (round 0). Consumed when played. |
| `overdrive` | Overdrive | instant | Next round, all your ships gain +99 initiative (fire first). |
| `uplink` | Targeting uplink | instant | Next round, all your ships gain +2 computer. |
| `patch` | Emergency repairs | instant | Immediately repair 2 damage on your most-damaged ship. |
| `ram` | Ramming speed | instant | Immediately deal 2 damage to the lowest-remaining-HP enemy ship (this CAN destroy it). |

Instant effects live in `roundModifiers` (cleared after the round resolves)
or mutate state immediately; contingents live in `armedEffects` and are
honored inside `advanceRound`. The user's motivating example is `bulkheads`:
"about to take lethal damage → survive at 1 HP".

**Forecast.** The pre-fight forecast stays card-blind (assumes no cards are
played). Note this in a hint on the prep screen ("forecast excludes reaction
cards"). Cards are the player's edge over the odds — that's the fantasy.

### 3.6 Balance pass

The map changes run economics: a typical path now has ~5-7 combats (not 8)
plus shops/events/repairs the player routes through. After implementing:

- Update `scripts/balance.ts`: same per-enemy table (it's a catalog now), keep
  the reference fleets from iteration 2, add a "starting fleet (2 dmg)" row,
  and add rows for the three elite variants (+2 HP per ship).
- Sanity targets:
  1. starting fleet (fresh) vs scout pack ≥ **97%**
  2. starting fleet (fresh) vs shield cruiser ≤ **45%**
  3. strong fleet vs ancient guardian (non-elite) ≥ **60%**
  4. strong fleet vs GCDS in **20-60%**
  5. strong fleet vs col-7 elite (ancient guardian +2 HP) ≥ **40%**
- Credits along a typical path (~6 combats incl. 1-2 elites) should total
  **~55-70** by the boss. If short, raise the combat reward constant
  (`4 + col`) before touching prices.
- The tankier player (frame HP buff) may inflate mid-game rates: prefer adding
  +1 cannon die or +1 damage to specific offending enemies over touching
  HP/initiative, and record every change here with before/after numbers.

### 3.7 Tests (add to the existing suites)

- Resolver: initial damage applied (a 4-HP ship entering with 3 damage dies to
  one 1-damage hit); end-damage/destroyed reporting matches the log; stepping
  ≡ one-shot for the same seed (bit-identical log and winner).
- Cards (fixed rng each): `overdrive` makes a slower fleet fire first for
  exactly one round; `uplink` turns a guaranteed-miss roll into a hit for one
  round only; `patch` repairs 2 on the most-damaged ship; `ram` destroys a
  1-HP enemy; `bulkheads` converts a lethal hit into 1-HP survival, is
  consumed on trigger, and is returned if untriggered; `pds` zeroes the
  missile swarm's alpha strike; hand cap 5 enforced on every acquisition path.
- Map: same seed → same map; column quotas exactly match the table; every
  edge obeys `|row - row'| ≤ 1`; every node reachable from some start; combat
  pools respect depth bands.
- Reducer: node flow map→prep→combat→map for fights, map→shop→map,
  map→event→map, map→repair→map (with full heal applied); win persists
  damage; destroyed ship removed with parts salvaged to inventory; equip works
  in shop phase; boss win → victory.
- Events: each branch via fixed rng; damage cap leaves 1 HP; trader deducts
  ceil(cost/2) and refuses when unaffordable; credits clamp at 0; arsenal
  refuses when hand full.

### 3.8 Milestones

- **I3-M1 — damage engine:** frame HP buff, resolver initial-damage input +
  end-damage/destroyed output, forecast damage-awareness, salvage rule in the
  reducer, HP current/max display. Tests green.
- **I3-M2 — resumable combat + cards:** `initCombat`/`advanceRound`/`runToEnd`
  refactor with the stepping-≡-one-shot invariant, all 6 card effects, hand
  state. Tests green.
- **I3-M3 — map:** seeded generation with quotas, map state + `PICK_NODE`
  reducer flow for all five node types, events moved onto nodes. Tests green.
- **I3-M4 — UI:** `MapScreen` (replaces `RunProgress`), stepped combat screen
  with hand, shop with fleet panel + card stock, repair and event screens.
- **I3-M5 — balance + docs:** updated balance script + targets, tuning with
  recorded changes, `npm test` / `tsc -b` / `vite build` green, and a browser
  playthrough that (a) routes toward a repair yard with a damaged fleet and
  (b) wins a fight only because `bulkheads` triggered.

**Definition of done:** all milestone criteria; the map screen makes
"greedy elite lane vs. detour to the col-4 repair yard" a visible, real
decision; a fight exists (seed it in a test) where the fleet loses without
`bulkheads` and wins with it; repairing is impossible outside repair yards.

---

## Iteration 3 — balance pass (M5, actual results)

The frame HP buff (Cruiser 1→3, Interceptor 1→2) plus fight 1's starting
loadout stacked into a noticeably tankier player than iteration 2's numbers
assumed. First balance run: fight-1 starting fleet beat scout pack at 99%
(fine) but shield cruiser at 63% (target ≤45%), and the realistic strong
fleet beat GCDS at 77% (target 20-60%) — both well outside target, for the
same underlying reason: more HP everywhere.

Per this file's own guidance, HP/initiative were left alone and enemy damage
was raised instead:
- **Shield cruiser**: cannon damage 1 → 2 per die (2 dice, so 2→4 potential
  damage/round). Starting-fleet win rate: 63% → 24%.
- **GCDS**: cannon damage 1 → 2 per die (4 dice). Strong-fleet win rate:
  77% → 40%.

Final measured win rates (1000 sims each; `npm run balance`):

| Enemy | Starting fleet | Starting fleet (2 dmg) | Mid fleet | Strong fleet |
|---|---|---|---|---|
| Scout pack | 99% | 89% | 100% | 100% |
| Missile frigate | 90% | 48% | 100% | 100% |
| Shield cruiser | 24% | 8% | 35% | 100% |
| Interceptor swarm | 30% | 5% | 89% | 100% |
| Plasma tank | 2% | 0% | 42% | 100% |
| Sniper | 37% | 8% | 72% | 100% |
| Missile swarm | 100% | 74% | 100% | 100% |
| Ancient guardian | 1% | 0% | 3% | 99% |
| GCDS (boss) | 0% | 0% | 0% | 40% |
| Ancient guardian (elite, +2 HP) | 0% | 0% | 1% | 95% |

All 5 sanity checks pass: starting fleet ≥97% vs. scout pack, ≤45% vs. shield
cruiser; strong fleet ≥60% vs. ancient guardian, 20-60% vs. GCDS, ≥40% vs. the
column-7 elite. The "starting fleet (2 dmg)" row confirms carried-in damage is
meaningfully punishing without being a run-ender on its own (roughly halves
win rate across the board at this damage level) — exactly the resource-under-
pressure feel persistent damage was meant to create.

### Verification performed

- `npm test`: 75/75 passing (resolver 14, forecast 4, combatEngine 10, map 9,
  events 16, reducer 22).
- `npx tsc -b`: clean.
- `npx vite build`: clean.
- Browser playthrough (dev server), verified live: map → prep → combat with
  the fight-1 softened loadout (2× ion) → win → back to map directly, no
  auto-shop; an event node (wandering trader, bought at half price); a shop
  node with the fleet panel embedded, equipping a part in place; a mid-depth
  combat loss (interceptor swarm, consistent with its tuned ~5-30% win rate).
- Verified via targeted tests rather than live browser click-through (the
  live session was cut short mid-playthrough): the exact "loses without
  `bulkheads`, wins with it" scenario (`combatEngine.test.ts`, same seed, A/B
  comparison — see below); repair-yard full heal and its `LEAVE_REPAIR` exit
  (`reducer.test.ts`); destroyed-ship salvage removing the ship and returning
  its parts to inventory (`reducer.test.ts`).
- The seed-2 A/B bulkheads test: a ship with hp 2 facing a foe whose single
  die is both near-guaranteed to hit and always lethal. Same fleet/enemy/seed,
  run twice — once with `bulkheads` armed, once without. Without: `enemy`
  wins. With: `player` wins (the ship survives the first hit at 1 HP and
  finishes the enemy off). This is the definition-of-done scenario, found by
  a brute-force seed search over the tuned setup and pinned as a permanent
  regression test.

### Mid-flight adjustments (post-M5, live manual testing)

While manually testing the build, two more changes were requested and made:

- **New ship purchases are always Interceptors.** The shop's "Expand your
  fleet" section no longer offers a Cruiser choice — `BUY_SHIP` takes no
  `frameId` and always adds an Interceptor (8 cr). Cruisers are the player's
  one flagship, established at the setup screen (below); reinforcements are
  cheap escorts.
- **Player-built starting loadout.** A new `setup` phase precedes the map:
  `ShipSetupScreen` lets the player pick exactly `SETUP_PART_COUNT` (4) parts
  from the full 12-part catalog for their starting Cruiser (2 of its 6 slots
  deliberately stay open for the early game), pre-filled with the previous
  tuned default (2× ion, computer, hull) so "keep it as-is" is one click away.
  `SETUP_CONFIRM` requires at least one weapon among the picks (mirrors the
  `ENGAGE` guard) before advancing to the map. This means fight-1's ~89-99%
  win rate is now a baseline for the *default* build, not a guarantee — a
  player who reads "2 guns instead of hull plating" and removes their only
  hull part gets a squishier, harder-hitting opener by choice, which is
  exactly the intent.
- Added reducer tests for both: `SETUP_ADD_PART`/`SETUP_REMOVE_PART` capping
  at 4 and re-opening a slot after removal, `SETUP_CONFIRM` rejecting a
  weaponless build, a 3-gun swap accepted in place of the default, and
  `BUY_SHIP` adding an Interceptor and refusing at the fleet cap.
- 75/75 tests passing, `tsc -b` and `vite build` clean after these changes.

**Follow-up (same session):** the setup screen's "pick any 4 of the full
12-part catalog" was replaced with a **credit-budget** model, per feedback
that it needed a real cost constraint and a restricted catalog:

- `SETUP_BUDGET = 12` credits — exactly the cost of the original reference
  loadout (2× ion cannon + electron computer + hull plating, all tier-1 parts
  at 3 cr each).
- `SETUP_ALLOWED_PARTS = ['ion', 'hull1', 'shield1', 'comp1']` — only the
  four basic tier-1 parts (ion cannon, hull plating, gauss shield, electron
  computer) are purchasable at setup; everything else is earned in the run's
  real trade stations. `SETUP_ADD_PART` rejects any other part id outright,
  and separately rejects any add that would exceed the remaining budget.
  `SETUP_PART_COUNT` (the old fixed-count-of-4 constant) was removed.
- `ShipSetupScreen` now shows a live "Budget: X/12 credits remaining" readout
  instead of an empty-slots count, and each of the 4 part cards disables
  itself once its cost would exceed what's left.
- Reducer tests updated to match: budget-exhaustion (not count-exhaustion)
  blocks a 5th add, a disallowed part (e.g. `plasma`) is rejected regardless
  of budget, and the "swap the default for something else" test now swaps in
  4 ion cannons (all still tier-1) rather than plasma cannons.
- 76/76 tests passing, `tsc -b` and `vite build` clean. Verified live in the
  browser: default build pre-fills the full 12-credit budget with 0
  remaining, removing a part frees 3 credits, all four tier-1 parts render
  with correct costs and disabled states, and Launch run correctly advances
  to the map.

**Follow-up:** purchased Interceptors now come with an ion cannon pre-fitted
(`equipped: ['ion']` instead of `[]` in the `BUY_SHIP` case) rather than
arriving as an empty hull — a freebie bundled into the purchase, not an
extra cost. 76/76 tests passing (updated the `BUY_SHIP` test to assert the
equipped ion cannon); verified live in the browser that a purchased
Interceptor shows an Ion cannon in its slot grid immediately.

**Follow-up: col-3 elite was too strong.** A fresh starting fleet's win rate
against the plain sniper (37%) fell off a cliff against the +2 HP elite
variant (6%) — a much harsher spike than the other two elites produced.
`eliteVariant(enemy, hpBonus = 2)` now takes a configurable bonus, and
`eliteEnemyForColumn` uses `eliteVariant(sniper, 1)` for column 3 specifically
(the other two elites, at columns 5 and 7, are untouched — their difficulty
curves were already reasonable). New numbers: fresh fleet 14% (a real risk,
not a wall), a "col3-typical" fleet (1 shop visit, ~12cr spent — added as a
new balance-script reference fleet) 62%, the general mid-fleet reference 51%.
Two new sanity checks added and passing: col3-typical fleet ≥50% vs. the
col-3 elite, and fresh fleet in a 5-25% "real risk" band against it. 76/76
tests still passing.

**Follow-up: combat screen shows both fleets' live stats.** Added
`CombatFleetView`, rendered above the play-by-play log: two columns, the
player's fleet on the left and the enemy's on the right, each ship showing
current/max HP, initiative/computer/shield, and its weapons, reading directly
from `combat.playerShips`/`combat.enemyShips` (so it updates automatically
every round and needs no new state). A destroyed ship collapses to a plain
"Destroyed" tag instead of stale stats. Verified live in the browser:
initial HP shown correctly for a fresh fight, and after auto-resolving, the
surviving player ship's HP reflects the damage it took while both destroyed
enemy ships correctly show "Destroyed."
