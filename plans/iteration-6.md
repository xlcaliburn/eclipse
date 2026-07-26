## Iteration 6 (planned — after iteration 5)

**The strategic layer:** the map becomes something you learn, not something
you read. Fog of war makes information a resource; the broker and quests
make it an economy; commanders make each run start with an identity.

### 6.1 Fog of war

Iteration 3 said "every node's type is visible from the start — that's what
makes routing a real decision." That was right for a game with no
information economy; now the horizon itself is the commodity. The split
between free and purchasable information:

**Always visible:** the trellis itself (nodes, edges, lanes), the visited
path, **every repair yard** (beacons you can see across the sector — and
long-range repair routing is the map's most important planning decision, so
it stays free), and the boss node (identity per the 5.5 dossier).

**Visible by proximity:** node types in every column ≤ `position.col + 1`
(before the first pick, column 0 only — you always see your immediate
choices). Proximity reveals are monotonic — once seen, stays seen.

**Hidden:** everything else renders as "?" (structure drawn, type unknown).

State: a `visionCol` high-water mark plus a `revealedNodes: {col,row}[]` set
for targeted intel reveals. The I4 `recon-probe` event and escalation strip
keep working unchanged on top of this.

### 6.2 The info broker (shop Intel section)

The 5.5 one-row Intel section grows into a real counter. Intel items are
fixed stock (not affected by reroll), each purchasable once per shop visit:

| Item | Cost | Effect |
|------|------|--------|
| Sector scan | 4 cr | Reveal all node types in the next 2 columns beyond current vision. |
| Deep scan | 6 cr | Pick a lane: reveal every node in that row through column 7. |
| Boss dossier | 8 cr | As 5.5 (disabled once bought anywhere). |
| Escalation intercept | 5 cr | Reveal the next unrevealed escalation (shop-priced version of the I4 intel events). |
| Job board | free | Shows this station's quest offer (6.3). Accept only with no active quest. |

Intel competes with parts for the same credits — that competition IS the
design. Events and elite rewards remain the cheap/free acquisition path for
information, which sharpens the event-vs-combat routing choice from I4.

### 6.3 Quests (cap: 1 active)

A quest marks a specific future node; completing it requires physically
routing there. That pull — into lanes you would otherwise skip — is the
entire mechanic.

**Offer sources:** shop job boards (seeded per node — same seed, same
offer), replacing the credit-only branch on one or two events, and
occasionally alongside elite rewards. **Cap 1 active** (one routing pull is
a decision; two across 3 lanes is noise).

**Target placement rule:** the target node is drawn from columns
`c+2 … 7` (offer at column c). In a 3-lane ±1 trellis, anything ≥2 columns
out is reachable from anywhere, so a quest is never dead on arrival — pin
this reachability property in a test. Accepting a quest **reveals its
target node** (quests are information). No eligible target → no offer.

**Failure is passive:** advance past the target column without visiting →
quest ends quietly, reward forfeit, no penalty. Withdrawing from a bounty
fight fails the quest (the node is fled — the target is gone).

| Quest | Setup | Completion | Reward |
|-------|-------|-----------|--------|
| **Bounty** | A named elite variant ("the Pirate Captain": hardest enemy in the target column's pool, +2 HP/ship) is placed at a marked combat node | Win that fight | +12 cr and an upgrade pick (1 of 3), on top of the normal combat reward — via the existing reward screen |
| **Delivery** | A **cargo pod** occupies 1 slot on a ship of the player's choice (a pseudo-part: movable between ships at prep/shop, never unequippable to inventory). Carrier destroyed → quest fails, pod lost | Visit the marked node | +10 cr and 1 random reaction card (hand full → +4 cr, existing fallback) |
| **Recon** | A marked node in a specific lane — typically one you'd otherwise skip | Visit it | Intel bundle: reveal the next 2 columns + the next unrevealed escalation (a quest that pays in information) |

The delivery pod is the interesting one: it costs build capacity, creates a
protect-this-ship subgoal that plugs straight into taunt and retreat, and
"which ship carries it" is a real decision (the safe Flagship, or a
disposable interceptor you now must keep alive?).

### 6.4 Commanders

Picked at the very start of the setup phase: **1 of 3, drawn seeded from a
4-commander roster**. Each biases a different system — economy, attrition,
fleet, information. **No drawbacks in v1** (tune via play testing; add
drawbacks only if a commander proves strictly dominant).

| id | Name | Effect |
|----|------|--------|
| `merchant` | The Merchant | +2 credits per combat won; shop reroll costs 1 cr. |
| `engineer` | The Engineer | Every surviving ship repairs 1 damage after each combat (stacks with `regen`). |
| `warlord` | The Warlord | Start with a free Interceptor (ion fitted) — fleet begins at 2. |
| `spymaster` | The Spymaster | Vision extends 2 columns instead of 1; all Intel purchases half price (rounded up). |

State: `commanderId` on `RunState`, applied at the reducer/derive layer.
The Engineer changes repair-routing math; the Spymaster only earns their
keep because 6.1/6.2 exist — which is why commanders land in this iteration
and not iteration 5.

### 6.5 Tests

- Fog: column-0-only visibility before the first pick; +1 horizon as
  position advances; monotonic reveals; repair yards and boss visible from
  the start; hidden nodes expose no type in state handed to the UI.
- Broker: each scan reveals exactly what it claims; dossier shared with 5.5
  behavior; intel untouched by reroll; Spymaster halves prices (rounding
  up).
- Quests: offer seeding deterministic; targets always ≥2 columns out and
  always reachable; accept reveals the target; cap 1 enforced across all
  offer sources; each archetype completes and pays exactly once; passive
  fail on passing the column; delivery pod occupies a slot, moves between
  ships, dies with its carrier; bounty node hosts the named elite and pays
  on top of the normal reward; fled bounty fails.
- Commanders: seeded 3-of-4 draw; each effect lands (credits, post-combat
  repair, starting fleet of 2, vision + prices); effects stack correctly
  with `regen`/`salvage` upgrades.

### 6.6 Milestones

- **I6-M1 — fog + broker:** visibility model, map "?" rendering, Intel
  section with all items. Tests green.
- **I6-M2 — quests:** offer generation, the three archetypes, markers +
  reveals, cargo pod. Tests green.
- **I6-M3 — commanders + polish:** roster, seeded pick UI in setup, effect
  wiring, browser pass (a run where a quest pulls you down a lane you'd
  never take, and a Spymaster run that buys the map instead of guns).

**Definition of done:** the map starts dark and gets bought back one
decision at a time; a player can articulate why they took an event node
over a combat node ("I needed to know"); a quest visibly bent a route; and
two runs with different commanders open with genuinely different plans.

### Status (I6-M1 implemented)

Fog of war + info broker are implemented and verified: `npm test` green
(137 tests), `tsc -b` clean, `vite build` clean, plus a browser pass
(column-0-only start, proximity reveal as position advances, repair yard
and boss always visible through fog, Sector scan/Deep scan/Escalation
intercept purchases in the shop, one-per-visit locking, Deep scan's
lane-through-column-7 reveal confirmed visually on the map).

**Deviation from the milestone list:** the Job board row (quest offers) is
deferred to I6-M2 rather than built alongside the other Intel items here —
it has no function without the quest system 6.3 introduces, so a stub row
in M1 would just be dead UI. Fog + the four working Intel items (sector
scan, deep scan, escalation intercept, boss dossier) are otherwise complete
per spec.

### Status (I6-M2 implemented)

Quests are implemented and verified: `npm test` green (160 tests), `tsc -b`
clean, `vite build` clean, plus a browser pass confirming fog/shop
plumbing still works end to end. Job board offer generation
(`generateQuestOffer` in `src/game/quests.ts`) is a pure, seedable function
with dedicated tests for determinism, the c+2..7 target-column rule, full
row-reachability (walked column by column via `nodesConnect`, per the
spec's "pin this reachability property in a test"), the no-eligible-target
null case, and bounty-targets-are-combat-nodes. All three archetypes
(bounty/delivery/recon) complete, pay, and clear `activeQuest` correctly;
passive failure on passing the target column/row is covered; a delivery
carrier's destruction (in any fight, not just the target) fails the quest
and drops the cargo pod without salvaging it; withdrawing from a bounty
fight fails it. The cargo pod is a real slot-consuming pseudo-part
(`cargo-pod`, kept out of the shop's random draw pool) — `UNEQUIP` refuses
to remove it to inventory, and a new `MOVE_CARGO_POD` action relocates it
between ships from the Fleet panel. Cap-1 is enforced on `ACCEPT_QUEST`.

**UI note:** the shop's Job board row shows the offer's archetype and
target coordinates, with a lane-picker for delivery's carrier choice (reused
the deep-scan lane-button pattern). The map shows an amber "quest" ring on
the target node plus a status line, so the pulled route is visible at a
glance.

### Status (I6-M3 implemented)

Commanders are implemented and verified: `npm test` green (170 tests),
`tsc -b` clean, `vite build` clean, `npm run balance` still runs
(untouched — it never imports `RunState`/the reducer). A new `'commander'`
phase runs before `'setup'`; `initialRunState()` seeds 3-of-4 roster
choices from the same rng stream as the map/escalations, and a new
`CommanderSelectScreen` gates the run start. Effects are wired at the
reducer layer, not derived stats, since none of them touch combat math:
Merchant (+2cr/win, 1cr rerolls), Engineer (+1 heal/surviving ship on a win,
stacks with `regen`), Warlord (free ion-fitted Interceptor added to the
fleet the moment the commander is chosen), Spymaster (vision step 2 instead
of 1 in `PICK_NODE`, and every Intel cost halved-rounded-up via a shared
`intelCost()` helper also used by the shop UI so displayed prices match
what's actually charged). No drawbacks, per spec.

**Deviation:** the full milestone browser pass (a quest-bent route, a
Spymaster run) was skipped at the user's explicit request mid-session
("skip all browser passes") — verification here rests on the unit-test
suite and manual `tsc`/`vitest`/`vite build` checks only.

### Unplanned player-feedback fixes (mid-session, not in the original 5/6 spec)

While iteration 6 was in progress, live play surfaced five requests that
were implemented alongside it:
- Combat auto-skips round 0 (the missile phase) when neither fleet has a
  missile weapon, instead of making the player click through a no-op round
  (`hasMissilePhase()` in `combatEngine.ts`, checked once in `ENGAGE`).
- Reactive armor now negates only the first hit of the **whole combat**,
  not one per round (the per-round `resetReactiveArmor` reset was removed
  from `advanceRound`).
- Two new starting reaction cards, held from turn one: **Fire control
  boost** (+1 to your attack rolls next round, a cheaper Uplink) and
  **Jamming burst** (-1 to enemy attack rolls next round, via a new
  `enemyComputerPenalty` round modifier).
- A "View fleet" button (read-only `FleetOverlay` modal) and a live credits
  badge on the map screen.
- "View map" toggles from the shop and event screens (a read-only
  `MapScreen` peek with a close button), so the player can check the route
  without abandoning what they were doing.
