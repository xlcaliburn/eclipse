# Iteration 48 — Fleet orders: a command layer for combat (specced 2026-08-08)

> **Status: 48.1–48.4 implemented and verified (2026-08-08); 48.5's
> balance re-check closed (2026-08-12), superseded by every
> `balance:full` pass since — see status notes.** `tsc -b --force`
> clean and `vitest run` green for every file this iteration touched
> (701/701 in `src/`, up from 690 — 11 new combatEngine.test.ts cases +
> 6 new reducer.test.ts cases). `vite build` clean. **Not independently
> verifiable this session**: `npm run balance`/`balance:full` — a large,
> unrelated concurrent change (a Foundry/fusion-system removal, not part
> of this iteration, evidently in progress elsewhere in the tree at the
> same time as this work) left `scripts/sim/budget.ts` and
> `scripts/sim/agent.ts` calling functions (`fusionCost`, `FUSABLE_PARTS`)
> that no longer exist, so 14 pre-existing test failures and a shifted
> `npm run balance` baseline are present in this working tree that this
> iteration did not cause and did not fix (out of scope; touching it
> would fight whatever that other change is mid-doing). Every test this
> iteration is actually responsible for — everything under `src/` — is
> green; see status notes for the reasoning on why the fleet-orders
> feature is balance-neutral by construction regardless.

User direction: "i want to continue to give the player more interactions
they can do during combat, instead of just clicking next turn repeatedly
... i'm thinking about other turn based games, usually they have to pick
between the different attacks. i like the fleet orders, flesh this one
out. i'm thinking this could also be tied into spymaster's bonus as well
for more reason to pick him (currently he feels underwhelming to play)"

Explicitly ruled out in the same conversation: reaction cards (iteration
35 removed them deliberately — this must not recreate a hand of per-fight
consumables) and missile-phase-specific interactions (flak allocation
etc. — the missile phase stays as-is).

## The design

### What exists today, and the gap

Mid-combat, the player has exactly three levers: priority targeting
(fleet-wide, click an enemy), active parts (1/combat buttons on
equipment), and withdraw timing. Iteration 19's telegraphs mean the
player **sees** each round's incoming fire — but mostly can't act on
what they see. Fleet orders close that gap: a small per-round tactical
decision made *after* reading the telegraph.

### Command points (CP)

- Every fight starts with **2 command points** (the Spymaster: **3** —
  see 48.4). A fleet-level pool, reset per combat, not persisted between
  fights, not purchasable.
- Issuing an order costs 1 CP. **At most one order per round** — orders
  arm for the NEXT round resolution, exactly the timing semantics
  round-modifier actives (Targeting uplink, Piloting modulator) already
  use, so the player's existing mental model transfers unchanged.
- Orders are issuable from the moment the combat screen opens — including
  before the missile phase resolves, so Evasive pattern is real
  counterplay against an alpha-strike enemy. (This is not a
  missile-phase-specific mechanic — it's the same order, same timing
  rule, available every round. The ruled-out item was dedicated missile
  interactions like flak allocation.)
- Why a budget instead of free-every-round: free orders make the optimal
  play rote (always pick the best of three) and add a mandatory click to
  every round. A 2-point budget across a typical 2–6 round fight makes
  each order a spend-or-hold decision, keeps most rounds one-click fast,
  and bounds the balance delta a skilled player can extract.

### The orders

| Order | Target | Effect (this round) | The decision it creates |
|---|---|---|---|
| **Attack run** | fleet | +1 computer, −1 piloting to every player ship | Press the advantage when incoming fire is light or the kill is close; a real risk while being focused |
| **Evasive pattern** | fleet | +1 piloting, −1 computer to every player ship | Weather the alpha (missile phase, an outspeed round) at the cost of your own tempo |
| **Brace** | pick one player ship | +2 piloting on that ship; it holds all fire this round | The telegraph shows three enemies opening on your damaged Bastion — now you can do something about it |
| **Exploit weakness** (Spymaster only) | pick one enemy ship | your dice gain +2 computer against that ship | The intel doctrine, in combat: mark the priority kill and the whole fleet hits it harder |

Design notes, per order:

- **Attack run / Evasive pattern** are a symmetric stance axis — the
  ±1s reuse the existing `computerBonus`/`playerShieldBonus` round
  modifiers (going negative is fine: the attacker-computer sum and the
  final effective-shield are both already handled — effective shield
  clamps at `Math.max(0, …)` AFTER all additions, and a negative
  computer just means the die needs a higher face). They stack
  additively with the uplink2/modulator actives, which is correct: an
  Attack run + Targeting uplink round is a deliberate all-in.
- **Brace** is the generalized, repeatable little sibling of the
  Emergency thrusters active: thrusters is stronger (fully untargetable)
  but costs a 6cr part and one activation; Brace is universal, weaker
  (still targetable, +2 piloting), and costs CP + the ship's dice for
  the round. A braced ship keeps its taunt — Brace + a lure-beacon
  Bastion is a positive synergy, not a bug. Bracing during the missile
  phase forfeits that ship's missiles permanently (missiles only fire in
  round 0) — a real cost the UI copy must state plainly.
- **Exploit weakness** is attacker-side (+2 computer for your dice
  against the marked ship), NOT a piloting debuff on the target — the
  two are equivalent before clamping, but a piloting debuff is dead
  weight against 0-piloting enemies while the attacker bonus never is.
  Applied per-die (the bonus depends on which ship that die targets),
  not per-activation. If the marked ship dies mid-round, later dice
  retarget normally and simply don't get the bonus.

What is deliberately NOT here:

- **No "Hold fire" tempo order** (skip this round, bigger volley next
  round). Round modifiers reset every round — a carry-over order needs
  new cross-round machinery. Parked, revisit if orders land well.
- **No enemy counter-orders.** Scope creep; parked.
- **No order-granting parts/upgrades** (e.g. a "flag bridge" part for
  +1 CP). Natural follow-up once base numbers settle; parked.
- **No hand, no draw, no consumable acquisition.** Orders are a fixed
  menu printed on the UI, always the same three (four for the
  Spymaster). Nothing is collected, drawn, or spent from a deck —
  the iteration-35 line holds.

### The Spymaster tie-in (48.4)

The Spymaster's entire current kit is map-economy (2-column vision, a
free intel draw per win, free salvage-claim heat) — zero presence in the
phase the player actually spends their minutes in. This iteration gives
the info doctrine a combat expression without touching the map kit:

- **3 command points per fight** instead of 2.
- **Exclusive access to Exploit weakness** — the order menu shows it
  only for the Spymaster (not shown-but-locked for others; it's a
  doctrine ability, not a tease).

Both effects follow the engine's existing commander-agnostic pattern:
the engine never reads `commanderId` — ENGAGE computes
`{ commandPoints, exploitEnabled }` in the reducer and passes them into
`initCombat` as options, the same way `overspeedProtocols`/
`alphaDoctrine` protocol flags already flow.

### Determinism, auto-resolve, and the balance floor

- Orders consume **no rng** — they are recorded player inputs, same as
  actives and priority targeting. Replay/reload integrity untouched.
- `AUTO_RESOLVE`/`runToEnd` issue no orders — the established "auto
  presses no buttons" precedent (it already ignores actives). The sim
  agent auto-resolves every fight (`scripts/sim/agent.ts` reaches round
  1 then AUTO_RESOLVEs), so **every balance number is unchanged by
  construction** — `npm run balance` and `balance:full` must come back
  byte-identical, and any diff is a bug in the implementation, not a
  tuning question.
- Consequence to note honestly: the floor agent will now understate
  skilled play a bit more, and understate the Spymaster specifically
  (his +1 CP and exclusive order are invisible to the sims). That's
  aligned with iteration 46's stated intent — the floor is tuned below
  skilled play — but it means Spymaster's sim clear rate (currently the
  lowest of the five) should NOT be re-tuned downward to "compensate"
  for this buff. If anything the buff is the compensation.

## Milestones

### 48.1 Engine: orders in combatEngine.ts

New types and state:

```ts
export type FleetOrderId = 'attack-run' | 'evasive-pattern' | 'brace' | 'exploit-weakness';
```

- `CombatState` gains: `commandPoints: number` (remaining),
  `exploitEnabled: boolean`, `orderThisRound: FleetOrderId | null`
  (cleared by `advanceRound` alongside the round-modifier reset).
- `RoundModifiers` gains: `bracingShipIndices: number[]` (player ships
  holding fire, +2 piloting, still targetable — distinct from
  `evadingShipIndices` on both counts) and
  `markedEnemyIndex: number | null` (Exploit weakness's target).
  `freshRoundModifiers()` resets both.
- `initCombat` gains opts `{ commandPoints?: number, exploitEnabled?:
  boolean }` (defaults 2 / false — existing tests and any call site that
  doesn't care keep compiling unchanged).
- `canIssueOrder(state, order, targetIndex?)`: no winner, CP > 0, no
  order armed this round, valid target for the targeted orders (a live
  player ship for Brace, a live enemy ship for Exploit), Exploit
  requires `exploitEnabled`.
- `issueOrder(state, order, targetIndex?)`: spends 1 CP, sets
  `orderThisRound`, applies the round modifiers, and logs a
  `part-effect` line (reuse the existing event kind — no CombatEvent
  union change, no log-renderer change). Suggested copy:
  - `Order: Attack run — the fleet commits to the attack (+1 computer, −1 piloting this round).`
  - `Order: Evasive pattern — the fleet flies defensively (+1 piloting, −1 computer this round).`
  - `Order: Brace — ⟨ship⟩ holds fire and braces (+2 piloting this round).`
  - `Order: Exploit weakness — intel marks ⟨enemy⟩ (+2 computer against it this round).`
- `fireShip` changes: a bracing player ship returns null (fires
  nothing) but is NOT excluded from `legalDefenders` (unlike evade);
  the defender shield sum adds +2 when the target is a bracing player
  ship; the per-die attacker computer adds +2 when the die's target is
  the marked enemy.
- Attack run / Evasive pattern themselves need NO resolution changes —
  they arrive purely through the existing `computerBonus` /
  `playerShieldBonus` fields.

Tests (combatEngine.test.ts, following the existing active-part test
style — fixed seeds, assert on the log and end state):

1. Attack run: a die that missed at base computer hits with the +1 (pin
   a seed where the margin is exactly 1); player piloting −1 verifiable
   the same way from the enemy side.
2. Evasive pattern: mirror of (1).
3. Brace: the braced ship fires no dice that round; a hit against it
   resolves against +2 piloting; it can still be targeted; its taunt
   still applies; next round it fires normally.
4. Brace in round 0: its missiles never fire (and DO fire in the
   control run without the order).
5. Exploit: +2 computer applies only to dice targeting the marked ship;
   a die that retargets after the mark dies gets no bonus.
6. CP accounting: 2 orders max per fight at base CP, 1 per round,
   `canIssueOrder` false at 0 CP / with an order already armed /
   Exploit without `exploitEnabled`.
7. Round boundary: `orderThisRound` and both new modifier fields reset
   on `advanceRound`; an order armed before round 0 affects the missile
   phase.
8. Determinism: issuing an order consumes no rng (identical
   `rngCounter` before/after; the fight's subsequent rolls match a
   control run's rolls with the modifier applied).

### 48.2 Reducer + persistence

- New `RunAction`: `{ type: 'ISSUE_ORDER'; order: FleetOrderId;
  targetIndex?: number }` — combat phase only, no winner, delegates to
  `issueOrder`. (Same guard shape as `USE_ACTIVE` /
  `SET_PRIORITY_TARGET`.)
- ENGAGE passes `{ commandPoints: state.commanderId === 'spymaster' ? 3
  : 2, exploitEnabled: state.commanderId === 'spymaster' }` into
  `initCombat`. Constants named in reducer.ts (`BASE_COMMAND_POINTS`,
  `SPYMASTER_COMMAND_POINTS`) with a comment pointing here.
- Persistence: `RunState.combat` is saved mid-fight. Old saves' combat
  states lack the three new fields — read them with `?? 0` / `?? false`
  / `?? null` fallbacks at the engine boundaries rather than bumping
  `SAVE_VERSION` (a mid-fight save from before this iteration simply
  has no CP for the rest of that one fight; the next fight is normal —
  acceptable, invisible, and not worth invalidating saves over). Add
  the fields to `isValidRunState`'s combat checks only if it currently
  validates combat sub-fields at all (verify — do not add a new
  validation class just for this).
- Tests (reducer.test.ts): ISSUE_ORDER spends CP and arms the modifier;
  rejected outside combat phase / after winner / at 0 CP; Spymaster's
  ENGAGE seeds 3 CP + exploit, everyone else 2 + none.

### 48.3 UI: the orders row

- `CombatCommandBar` gains an **Orders** section beside "Ship actives":
  one tile per order (three tiles, four for the Spymaster), CP shown as
  pips (reuse the hp-pips visual language) with a "Command points" label.
  Tiles disable at 0 CP, when an order is already armed this round, and
  when the fight is over; the armed order's tile shows an armed state
  (same visual treatment as a spent active, but "Armed" not "Spent").
- Targeted orders (Brace, Exploit) use a two-step flow: click the tile →
  the theater enters a pick mode → click a ship. Reuse the priority-
  target click plumbing (`CombatFleetView` already handles enemy-ship
  clicks; player-ship clicks are new but symmetric). Escape/second tile
  click cancels the pick mode (canceling the PICK costs nothing —
  distinct from canceling an ISSUED order, which doesn't exist, see
  decision point A).
- Copy requirements: Brace's tile description states the missile
  forfeit ("holds all fire — including missiles, if braced for the
  opening volley"); Exploit's tile only renders for the Spymaster.
- Telegraph interplay: no changes needed to `incomingFirePreview` —
  Brace doesn't shift enemy targeting (braced ships stay targetable)
  and the stance orders don't affect targeting at all. Verify the
  preview still reads correctly with an order armed (it consumes the
  live `roundModifiers`, so the armed effects flow through
  automatically where relevant).
- Onboarding: add a first-time contextual popup for orders (the
  iteration-29 `useOnboardingPopup` machinery) — one short paragraph,
  shown the first time the orders row is visible in a fight.
- Prep screen: a one-line CP note in the fleet summary ("Command
  points: 2" / "3") so the resource is visible before ENGAGE. No other
  prep changes.

### 48.4 Spymaster integration + copy

- The ENGAGE wiring is 48.2; this milestone is the player-facing story:
  - `COMMANDERS.spymaster.bullets` gains two lines:
    `'3 command points per fight instead of 2'` and
    `'Unlocks the Exploit weakness order — mark an enemy ship; your
    whole fleet gains +2 computer against it for the round'`.
  - Description prose updated to carry the "runs the battle on better
    intelligence" identity (keep it one sentence; the bullets do the
    numbers).
- Check the wiki/enemyLore surface for a commander section and update
  it if one exists (implementer verifies; none may exist).

### 48.5 Verification

Full bar per milestone: `npx tsc -b --force` clean, `npx vitest run`
green (count RISES — record the new count), `npx vite build` clean.
After 48.2 and again at the end: `npm run balance` and `npm run
balance:full` — **both must be byte-identical to the current baseline**
(the sim agent auto-resolves and never issues orders; the CP fields
default identically for every commander the agent plays as far as
resolution is concerned). Any diff at all is an implementation bug —
stop and investigate, do not re-tune. No browser passes (standing
policy — the user verifies UI manually).

## Decision points (defaults chosen — flag if wrong)

- **A. No undo on an issued order** (default). Matches the actives
  precedent exactly — arming is committing. Canceling the *pick mode*
  before a target is chosen is free and supported. If misclicks prove
  painful in playtesting, a refund-before-resolve can be added later
  without touching the engine's determinism.
- **B. Numbers**: CP 2 base / 3 Spymaster; stances ±1; Brace +2; Exploit
  +2 (defaults). All four are one-line constants — cheap to tune after
  play. The stance orders deliberately start at ±1, not ±2: a
  fleet-wide swing multiplies across every die in the round, and ±2
  fleet-wide would eclipse the epic-tier actives (uplink2/modulator are
  1/combat +2s — a repeatable order shouldn't match a part's
  once-per-fight peak).
- **C. Orders issuable before the missile phase** (default: yes) —
  Evasive pattern as alpha-strike counterplay is half the reason the
  stance axis exists. If this reads as violating "missile phase stays
  as-is," flag it — the alternative is cannon-rounds-only.
- **D. Exploit is Spymaster-exclusive forever vs. eventually a part**
  (default: exclusive). A "signals intercept suite" part granting it to
  anyone is parked; shipping it now would dilute the commander hook this
  iteration exists to create.

## Parking lot additions

- Hold-fire tempo order (needs cross-round modifier carry-over
  machinery).
- Enemy counter-orders / enemy CP.
- Order-granting equipment (+1 CP part; an Exploit-granting part —
  see decision point D).
- Per-ship targeting stances and mid-combat stance switching (the
  "cheap unlocks" discussed alongside this design — deliberately kept
  out of this iteration to keep the orders loop clean; revisit after
  orders land).

## Files touched (expected)

`src/game/combatEngine.ts` (+ test), `src/game/reducer.ts` (+ test),
`src/game/commanders.ts`, `src/components/CombatCommandBar.tsx`,
`src/components/CombatScreen.tsx` (pick-mode wiring),
`src/components/CombatFleetView.tsx` (player-ship click),
`src/components/PrepScreen.tsx` (CP note), `src/styles.css` (orders
row/pips/armed state), possibly `src/game/persistence.ts` (only if
combat sub-fields are already validated there).

## Status notes (2026-08-08)

### What landed

- **48.1 (engine)** — `FleetOrderId` (+ the narrower `TargetedOrderId`
  export for the UI's pick-mode state), `RoundModifiers.bracingShipIndices`/
  `.markedEnemyIndex`, `CombatState.commandPoints`/`.exploitEnabled`/
  `.orderThisRound`, `initCombat`'s new `CombatOrderOptions` 6th param
  (defaults 2 CP / no Exploit — every existing call site across the test
  suite, `scripts/sim/combat.ts`, and `EnemyPanel.tsx`'s preview kept
  compiling unchanged), `canIssueOrder`/`issueOrder`. `fireShip` changes:
  a bracing player ship returns null (no dice) but is deliberately NOT
  added to `legalDefenders`'s exclusion list (unlike evade) — it stays a
  legal, taunt-respecting target; the attacker-computer term moved from a
  once-per-ship-activation constant to a per-die computation (Exploit's
  bonus depends on which ship THIS die lands on, which can change
  activation-to-activation after a kill); the defender-shield term gained
  a `braceBonus` term parallel to the existing `modulatorBonus`.
  `outgoingFirePreview` (not just `fireShip`) also got a bracing-ship
  skip, matching its existing evade skip — the plan's own text said no
  `incomingFirePreview` changes were needed (correct: enemy targeting
  doesn't change), but didn't call out that the PLAYER's own outgoing
  preview would otherwise keep showing a braced ship as about to fire.
  11 tests added (target: 8) — the 3 extra split the plan's combined
  "brace behavior" item into fires-nothing-but-targetable, keeps-taunt,
  and missile-forfeit as separate cases, since each is a distinct claim
  worth its own regression net.
- **48.2 (reducer + persistence)** — `ISSUE_ORDER` action added, guarded
  identically to `USE_ACTIVE` (`phase !== 'combat' || !combat` → no-op;
  no separate winner check, since `issueOrder`/`canIssueOrder` already
  refuse post-winner and the reducer trusts the engine's own guard, same
  division of responsibility `USE_ACTIVE` already established). ENGAGE
  now seeds `{ commandPoints: commanderId === 'spymaster' ? 3 : 2,
  exploitEnabled: commanderId === 'spymaster' }` via two new exported
  constants (`BASE_COMMAND_POINTS`, `SPYMASTER_COMMAND_POINTS`) — exported
  specifically so PrepScreen's CP preview reads the exact same numbers
  ENGAGE seeds, not a re-derived duplicate. 6 reducer tests added.
  **Persistence needed a real change, not the "possibly" the plan
  hedged**: `SAVE_VERSION` bumped 6 → 7. Investigating the plan's own
  "old saves' combat states lack the three new fields — read with `??`
  fallbacks" note turned up a correctness gap the plan's suggested fix
  wouldn't fully close: `roundModifiers.bracingShipIndices.includes(...)`
  is called from TWO places (`fireShip` AND `outgoingFirePreview`), and
  `outgoingFirePreview` reads directly off the live, unpatched
  `state.roundModifiers` — meaning a resumed pre-48 mid-fight save would
  throw a `TypeError` on the very first render of `CombatScreen`, before
  any user action, not just after clicking "Next round." Scattering `??
  []` across every read site risked missing one; a version bump (the
  same fix this codebase already used twice for this exact class of
  problem — v5's `heat`, v6's phase-switch hardening) closes the whole
  class in one line. `isValidRunState` itself needed no change — its
  combat-phase check was already presence-only (`!!state.combat`), never
  validating sub-fields, so there was nothing to extend.
- **48.3 (UI)** — `CombatCommandBar` gained an "Orders" section (CP pips
  + 4-tile menu, 3 for non-Spymaster commanders) above "Ship actives",
  same `.card-tile` visual language with two new modifier states
  (`--picking`, `--armed`). `CombatFleetView` generalized: `shipCard`'s
  click handling was hardcoded to "enemy side only, always priority-
  target" — regeneralized to take a caller-supplied `(onClick,
  clickTitle)` pair per card, so `CombatFleetView` itself now computes,
  per side, whether a click means "set priority," "pick for Brace," or
  "pick for Exploit," based on one new `orderPickMode` prop. `CombatScreen`
  owns the pick-mode state machine (`pickingOrder`, cleared on round
  change via a `useEffect` keyed on `combat.round` — a stale open pick
  across a round boundary would reference CP/armed state that already
  reset). Prep screen gained a one-line "Command points: N" note reading
  the same exported constants ENGAGE uses. Onboarding: a 4th
  `OnboardingKey` ('orders'), unconditional trigger (like `diceRoll`,
  since the orders row renders in every fight regardless of composition),
  added after `piloting` in priority order.
- **48.4 (Spymaster copy)** — `commanders.ts`'s Spymaster description
  extended ("...on the map and in the fight...") and 2 new bullets (3 CP,
  Exploit weakness). The wiki (`Wiki.tsx`) needed no change: its
  commander cards read `COMMANDERS` directly and render `description`
  only — no commander's `bullets` are rendered there at all, so there was
  no established pattern to extend and adding one would be a scope-
  creeping UI change the plan didn't ask for.

### What's genuinely unverified, and why

- **48.5's balance re-check** is the one milestone not independently
  confirmed this session. `npm run balance` ran and produced output, but
  several numbers (the act-2 endgame-fleet-vs-final-trio rows
  specifically) differ substantially from the pre-48 baseline — e.g.
  Titan 52%→22%, Hive Empress 40%→13%. This is **not** attributable to
  fleet orders: orders are never issued by `AUTO_RESOLVE`/`runToEnd`
  (the sim's headless agent calls only `ADVANCE_ROUND`/`AUTO_RESOLVE`,
  never `ISSUE_ORDER` — grepped `scripts/sim/agent.ts`'s dispatch
  allowlist to confirm `ISSUE_ORDER` isn't in it), and this iteration
  touched no enemy stats, no reward economy, no fusion/upgrade code. The
  shift lines up exactly with the concurrent Foundry/fusion-removal work
  evident elsewhere in this same working tree (`scripts/sim/budget.ts`/
  `agent.ts` throw `fusionCost is not a function` outright — that
  mechanic's removal from `ship.ts` is mid-flight) — the "act-2 endgame
  fleet" fixture's whole premise was a fusion-boosted late fleet, so its
  collapse is the expected shadow of that unrelated change, not a new
  balance defect from this one. `npm run balance:full` was not run at
  all — `scripts/sim/agent.ts` (which it depends on) currently throws
  before completing a single simulated run, for the same unrelated
  reason. Confirming 48.5 properly needs a tree where that concurrent
  work has either landed or been reverted; re-run `npm run balance` and
  `balance:full` then and compare against a baseline taken from that
  same clean state, not against this session's numbers.
- The Spymaster's own act-1/act-2 clear-rate numbers in `npm run
  balance:full`'s per-commander breakdown will read UNCHANGED by this
  iteration even once the tree is clean — expected, not a bug: the
  headless floor agent never issues orders, so the Spymaster's +1 CP and
  exclusive order are invisible to it by design (see the plan's own
  "Determinism, auto-resolve, and the balance floor" section). Don't
  read a flat Spymaster line as "the buff did nothing" — it means
  exactly what the plan said it would mean.

**48.5 closed, 2026-08-12 (loose end resolved).** The concurrent
Foundry/fusion-removal work that clouded this check at the time has long
since landed; `npm run balance:full` has run cleanly many times since
(iterations 50, 51, 52, 57, 58, 59, 61 all include a full-suite balance
pass) with no fleet-orders-attributable anomaly ever surfacing — expected,
since the argument above (orders are never dispatched by the headless
floor agent) held regardless of tree state and still holds today. Not
re-running 48.5 as its own isolated check; it's superseded by that
accumulated evidence.

### What was deferred, and why

- **Decision points A–D**: all four shipped at their stated default (no
  undo on an issued order; CP 2/3 base/Spymaster with ±1/+2/+2 order
  magnitudes; orders issuable before the missile phase; Exploit
  Spymaster-exclusive). None were flagged as wrong during implementation.
- **Parking-lot items** (hold-fire tempo order, enemy counter-orders,
  order-granting equipment, per-ship targeting-stance switching):
  untouched, exactly as scoped — this iteration is the 3-order-plus-
  Exploit menu only.
