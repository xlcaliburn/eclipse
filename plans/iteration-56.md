# Iteration 56 — Act-2 events and the extra berth (specced 2026-08-12)

> **Status: implemented and verified (2026-08-12).** `npx tsc -b --force`
> clean; `npx vitest run` green at 902 (up from 885 immediately after the
> production-code changes, before 56.5's dedicated tests were added — see
> the concurrency note in status notes for why that's the recorded
> before/after rather than a true pre-iteration baseline); `npx vite build`
> clean; `npx vitest run scripts/sim/agent.test.ts` green, 0
> `rejectedDispatch`. `npm run balance:full` run report-only, numbers
> recorded below — full-run/act-2-conditional clear stayed at the same 0.0%
> `KNOWN GAP` floor iteration 61 also reported, unaffected either way. Full
> deviations, the berth-price derivation, the five new events' designs, and
> the balance table are in status notes at the end.

## Motivation (user direction, 2026-08-12)

> *"there should be a separate iteration to add more events in act 2,
> with some being opportunities to purchase or unlock an additional ship
> slot"*

This also absorbs the "extra fleet berth" idea from the rejected first
draft of iteration 52, which had it as a plain shipyard purchase. An
event is the better home: unlocking a berth becomes a *moment* in the
run rather than another line item in a shop menu.

## Grounding (audited 2026-08-12)

**Act 2 has no events of its own.** Iteration 49 stage-gated the pool
into early (global col ≤3) / mid (≤10) / late (≥11 — i.e. all of act 2).
The late-eligible randomly-drawn pool is 9 events:

`ancient-cache`, `intercepted-signal`, `recon-probe`, `sabotage-raid`,
`defector`, `distress-beacon`, `repair-tender`, `salvage-claim`,
`militia-requisition`

**Every one is also mid-stage.** Not a single event is act-2-exclusive.
Six more are late-eligible but continuation-only (`defector-pursuit`,
`relic-vault`, `relic-core`, `debt-collectors`, `colony-raiders`,
`colony-arrival`) so they never enter the random draw. Act 2 is 12 lane
columns — the longest single stretch of the game — and its event nodes
serve nothing the player has not already seen in act 1.

**Fleet capacity** (`reducer/shop.ts`):

```ts
export function fleetCap(commanderId, protocols?): number {
  if (hasProtocol(protocols, 'lone-flagship')) return LONE_FLAGSHIP_CAP; // 1
  const base = commanderId === 'admiral' ? ADMIRAL_FLEET_CAP : MAX_FLEET_SIZE; // 5 : 4
  return base + (hasProtocol(protocols, 'armada-mandate') ? ARMADA_MANDATE_BONUS : 0); // +2
}
```

**Reward guardrail**: iteration 50's `rewardTiers.ts` gate scrapes
`events.ts` for `pay(state, N, ...)` and `ambushBonus: { credits: N }`
literals and fails on anything uncatalogued. Every new event below with
a credit payout **must** get a manifest entry — that gate firing is it
working as designed, not an obstacle.

## 56.1 The extra berth

New optional `RunState.bonusFleetBerths?: number`, folded into
`fleetCap`:

```ts
export function fleetCap(commanderId, protocols?, bonusBerths = 0): number {
  if (hasProtocol(protocols, 'lone-flagship')) return LONE_FLAGSHIP_CAP;
  const base = commanderId === 'admiral' ? ADMIRAL_FLEET_CAP : MAX_FLEET_SIZE;
  return base + (hasProtocol(protocols, 'armada-mandate') ? ARMADA_MANDATE_BONUS : 0) + bonusBerths;
}
```

Rules, each load-bearing:

- **Lone flagship still wins outright.** Its entire premise is "exactly
  one ship"; a berth bought before the act-1 boss draft must not
  silently undo it. The early return already handles this — just do not
  move the `bonusBerths` addition above it.
- **It composes with the Admiral (5) and Armada mandate (+2)** rather
  than overriding either.
- **Hard cap of 1 bonus berth per run.** Both events below check it, so
  a run that finds both cannot stack them. Rationale: a 7-ship fleet
  (Admiral + mandate + berth) already strains the combat theater's
  layout, and the point is a memorable one-time unlock, not a fleet-size
  race. `BONUS_BERTH_CAP = 1` as a named constant — this is the most
  likely thing to want tuned later.
- **Every `fleetCap` call site must pass it** — `BUY_SHIP`'s cap check,
  `FleetPanel`/`FleetOverlay`'s displays, `scripts/sim/agent.ts`'s
  `buyHull`. Grep for `fleetCap(` and fix all; a missed call site means
  the berth exists but cannot be used.
- **Persistence**: optional with safe-absent semantics, so **no
  `SAVE_VERSION` bump** — the iteration 18/20/21 precedent that
  iteration 49 already followed for `loanOutstanding`/`colonyStage`.
- **UI**: the fleet cap is shown in the shop's hull rack and the fleet
  panel; make sure the displayed cap reflects the berth, and consider a
  small "berth unlocked" marker so the player can see what they bought.

## 56.2 The two berth events

Both are `stages: ['late']` and both require `bonusFleetBerths` to be
absent (so they never appear once a berth is held). Requirement kinds
live in `events.ts`'s existing predicate library — this needs a new one,
e.g. `{ kind: 'noBonusBerth' }`, with a `describeRequirement` string.

### `naval-yard` — "Fleet requisition office" (the purchase)

A rear-area naval yard will authorize a berth on your fleet charter, for
a price.

1. `Move on` → nothing.
2. `Buy the berth (-Ncr)` — requires `creditsAtLeast N` → pay, set
   `bonusFleetBerths: 1`.
3. Optionally a commander-flavored discount branch (the Merchant talking
   the clerk down) — only if it does not complicate the requirement
   library.

**Price**: this is the single largest one-off purchase in the game and
should read that way — the target is "a full act-2 fight's income
several times over," not pocket change. Settle it against the actual
act-2 income curve (`enemyValue.ts`'s budget model, freshly fixed) and
record the reasoning; a number pulled from the air here is exactly what
iteration 50's guardrails exist to prevent.

### `derelict-flotilla` — "Derelict flotilla" (the unlock)

A drifting cluster of half-dead hulls. Nothing here flies, but the
berthing rights are unclaimed — cutting one loose costs work, not money.

1. `Leave it` → nothing.
2. `Cut a hull free (+1 heat, and a fight)` → an ambush from
   `EASY_POOL_ACT2` with a win-conditional `chainEffect` granting the
   berth. Reuses iteration 49's `AmbushBonus.chainEffect` machinery
   exactly — add a `'berth-unlocked'` member alongside `'debt-cleared'`
   and `'colony-defended'`, applied in the same CONTINUE win branch.
3. `Strip it for parts instead` → a `FIVE_CREDIT_PARTS` grant, no berth.
   Gives the player who cannot afford a fight something to take.

The fight gate is deliberate: the free route costs risk where the paid
route costs credits, so both kinds of player have a path.

## 56.3 More act-2 events generally

Add **3–4 further `stages: ['late']` events** so act 2's pool stops
being a replay of act 1's. Design brief for each: they should read as
*deeper into the war* — bigger stakes, references to the act-2 fiction
(counter-protocols, the pursuit closing in, the final boss's approach) —
rather than being act-1 events with bigger numbers.

Directions, to be settled in implementation:

- **Something that interacts with the counter-protocol** — act 2's
  defining mechanic currently has zero event surface. An event that
  reveals it early, or blunts it for a few columns, would give the
  act-2 draft real texture.
- **Something that interacts with the pursuit clock** at high heat —
  heat is most dangerous in act 2 and `salvage-claim` is its only event.
- **A high-stakes gamble** appropriate to a fleet that has already
  cleared an act — real risk, real payoff, unlike the pocket-change
  early events iteration 49 added.
- **A repair/refit opportunity**, especially valuable if iteration 52's
  hull refit has landed (a field refit outside a shipyard would be a
  genuinely distinct offer).

Each needs `stages`, an entry in the `EventId` union, a
`resolveEventChoice` case, and — for any credit payout — a
`rewardTiers.ts` manifest entry (56.5).

## 56.4 Interaction with the act-2 difficulty wall

Iteration 51 measured ~40–50% of act-2 entrants dying at global column
11, the *first* act-2 node, and iteration 55 exists to flatten that.
This iteration touches the same stretch, so note the interaction rather
than colliding with it:

- A berth (+1 hull) is a real survivability buff exactly where the wall
  is. That is a **desirable** side effect, but it means 55's measurement
  baseline must be taken *after* this iteration if both land, or the two
  effects are indistinguishable.
- These events do **not** change how many event nodes act 2 has — map
  generation sets node types; this only changes what appears *on* an
  event node. So no fight-count change and no direct survivability
  effect beyond the berth itself. Do not claim otherwise in the status
  notes.

## 56.5 Tests

- `fleetCap` with `bonusFleetBerths`: composes with Admiral and Armada
  mandate; Lone flagship still returns 1; the cap of 1 holds.
- Every `fleetCap` call site honours the berth — specifically a
  `BUY_SHIP` at the old cap succeeds with a berth held.
- `noBonusBerth` requirement: met when absent, unmet when held, and its
  `describeRequirement` string.
- `naval-yard`: pays and grants; refused below the price.
- `derelict-flotilla`: sets the ambush and the `'berth-unlocked'`
  chainEffect; the berth lands **only** on a CONTINUE win (drive a real
  ambush through, per the existing debt/colony chain test precedent);
  the strip-for-parts branch grants without a berth.
- `drawEvent` stage filtering: the new events never appear at an early
  or mid column.
- `rewardTiers.test.ts` passes with the new manifest entries — and
  deliberately confirm it FAILS first if an entry is omitted, since that
  tripwire is the whole point of iteration 50.

## 56.6 Verification

`npx tsc -b --force` clean project-wide, `npx vitest run` green (report
the count), `npx vite build` clean. `npm run balance:full` — expect
act-2 conditional clear to be unchanged or slightly up (the berth is the
only mechanical change reaching combat); record it either way. No
browser passes (CLAUDE.md).

## Open questions for the user

1. **Berth price** for `naval-yard` — see 56.2. Wants a number grounded
   in the act-2 income curve, and a sanity check that it is expensive
   enough to be a real decision.
2. **Cap of 1** bonus berth per run — or should a run that finds both
   events be able to reach +2?
3. Whether the berth should persist across the act boundary if these are
   ever extended into act 1 (currently moot — both events are late-only,
   and act 2 is the last act).

## Status notes (implementer, 2026-08-12)

### Concurrency

Implemented alongside another session actively working iteration 62 in the
same tree. Per the fence: `src/game/combatEngine.ts`/`.test.ts`,
`src/components/CombatScreen.tsx`, `src/wiki/Wiki.tsx`, and
`plans/iteration-62.md` were never opened for editing. The berth ambush
turned out to need nothing from the combat engine, exactly as predicted —
it flows through the reducer's existing ENGAGE/CONTINUE/EVENT_CONTINUE path
via `AmbushBonus.chainEffect`, same machinery iteration 49 built for the
debt/colony chains. **Nothing was skipped because of the fence**: the one
place that looked like it might need a Wiki edit — a listing for the 5 new
events — turned out to need none at all, since `Wiki.tsx`'s events table
(`{EVENTS.map(...)}`) already iterates `EVENTS` generically; the 5 new
entries appear there automatically. Confirmed by reading (not editing) that
file. `PLAN.md` and `plans/iteration-55.md` showed up modified mid-session
(the other session's own work) — neither was touched beyond PLAN.md's
iteration-56 status cell, and both were re-read immediately before that one
edit.

One knock-on effect of the shared tree: the "starting test count" the
verification bar asks for isn't a true pre-iteration-56 baseline. `git
stash` was avoided outright (it would have caught the other session's own
uncommitted work), so the earliest clean measurement available was 885 —
taken after this iteration's production-code changes (events.ts, reducer.ts,
shop.ts, agent.ts, rewardTiers.ts/test.ts) but *before* 56.5's dedicated new
tests were written. The final count is 902, so **17 new tests** were added
by 56.5 specifically; the suite was green (all files passing) at both
checkpoints.

### The berth price derivation (56.2)

`NAVAL_YARD_BERTH_PRICE = 90` (named constant, `src/game/events.ts`).
Derived from `winReward` directly (the same budget model
`scripts/enemyValue.ts` reports from — that script needed no fixing, it was
already current):

- Act-2 `winReward` ranges from 21cr (col 0, the act-2 difficulty wall
  iteration 51/55 measure at) to 32cr (the last lane column, col 11),
  averaging **26.5cr** across the 12 act-2 columns.
- Target per the spec: "a full act-2 fight's income several times over"
  (3-4x) → a band of 80-106cr.
- **90cr** sits inside that band (~3.4x the act-2 average, ~4.3x the
  wall-column reward specifically) and is comfortably the single largest
  one-off purchase in the game — the priciest purchasable hull (Titan) is
  48cr, and every other single-node event payout/cost in `events.ts` is
  under 15cr.
- Sanity check against the player's own economy: arriving at the act-2 wall
  having fully cleared act 1 banks ~122cr total
  (`enemyValue.ts`'s `act1FullClearIncome()` + starting fit), so 90cr
  consumes most of it — a real, felt decision, not pocket change.

The price is applied via a direct `credits:` state-spread (not the `pay()`
helper), both because the purchase also has to set `bonusFleetBerths` in the
same update and because it keeps the cost out of `rewardTiers.test.ts`'s
source-scrape by construction (see the next section).

### The rewardTiers gate and 56.2's price (a clarification, not a deviation)

Re-reading `rewardTiers.ts`'s own scrape regex: it only classifies
**positive** `pay(state, N, ...)` literals and `ambushBonus: { credits: N }`
literals — a cost (negative, and in this case a named-constant argument
rather than even a literal number) was never in that gate's scope to begin
with. Concretely: `naval-yard`'s -90cr purchase, `derelict-flotilla`'s
chainEffect-only ambush, and `counter-relay-breach`'s chainEffect-only
ambush all evade the scrape by design (no positive `pay()`, no
`ambushBonus.credits` literal) — same documented exemption `rewardTiers.ts`
already carries for militia-requisition/salvage-claim's direct spreads. The
one new source that genuinely trips the gate is **56.3's `black-site-vault`
fight** (`ambushBonus: { credits: 6 }`, a real literal). Per 56.5's
instruction, this was verified empirically both ways: with its manifest
entry temporarily removed, `rewardTiers — completeness tripwire >
"ambushBonus: { credits: 6 } is covered by a non-flat manifest entry"`
**failed** (confirmed the gate is live); the entry was then added and the
suite went green. (Note: the fight was originally drafted at 8cr, the same
value `defector-pursuit`'s ambush already uses — that value was *already*
"covered" by the pre-existing `defector-pursuit-fight` manifest entry even
with no `black-site-vault` entry at all, which would have made the
FAILS-then-PASSES demonstration a false negative. Retuned to 6cr, a value no
existing entry measures, specifically so the demonstration would be
real — recorded here since it's a real trap for anyone re-deriving reward
numbers against this file's existing corpus.)

### 56.1 — the extra berth: deviations from the spec's literal wording

- **`BONUS_BERTH_CAP` lives in `src/game/events.ts`**, not next to
  `fleetCap` in `src/game/reducer/shop.ts`. `fleetCap` itself never needs
  the cap value — it just adds whatever `bonusBerths` it's handed, trusting
  the value is 0 or 1 by construction. The cap is purely an `events.ts`
  concern (both berth events' gating, and `drawEvent`'s pool exclusion), so
  it lives with its one real consumer.
- **`fleetCap`'s call-site grep turned up no `FleetPanel`/`FleetOverlay`
  cap display to update.** The spec's grounding section named both as
  needing the berth threaded through; neither component actually renders a
  fleet-cap number (checked directly — `grep -n "cap" FleetPanel.tsx
  FleetOverlay.tsx` finds nothing relevant). `ShopScreen.tsx` is the only
  UI surface that displays the cap, and it's updated (see below). Every
  real `fleetCap(` call site was grepped and fixed: `reducer/shop.ts`'s
  `BUY_SHIP` gate, `ShopScreen.tsx`'s `currentFleetCap`, and
  `scripts/sim/agent.ts`'s `buyHull`/`upgradeMark`/`buyMercenary` (the last
  doesn't call `fleetCap` directly — it compares against
  `config.fleetCap`, the archetype's own soft cap — but was still given
  `+ (state.bonusFleetBerths ?? 0)` headroom per the spec's explicit
  instruction to thread it through there too).
- **UI marker**: `ShopScreen.tsx` shows `"Fleet charter carries a bonus
  berth — max fleet size is N."` whenever `bonusFleetBerths` is set,
  independent of whether the fleet is currently full (the existing
  `fleetFull` warning only shows once actually at cap, which could be a
  long time after the berth was bought/won).

### 56.2 — the two berth events: one deliberate design choice

The spec's own text says both events are "gated on a new `{ kind:
'noBonusBerth' }` requirement" — implemented as: (1) `drawEvent` excludes
both `naval-yard` and `derelict-flotilla` from the random pool outright once
`bonusFleetBerths >= BONUS_BERTH_CAP` (the actual "never appear" mechanism,
literally tested), and (2) the `noBonusBerth` `EventRequirement` sits on
**`derelict-flotilla`'s** "cut a hull free" option only. `naval-yard`'s "buy
the berth" option uses `creditsAtLeast(NAVAL_YARD_BERTH_PRICE)` instead —
consistent with every other paid option in `events.ts`, and load-bearing:
`EVENT_CHOOSE`'s only gate is `meetsRequirement(option.requirement, state)`,
so a purchase option's requirement is genuinely the only thing standing
between a player and buying something they can't afford. An `EventOption`
only carries one `EventRequirement`, so naval-yard's option couldn't carry
both `creditsAtLeast` and `noBonusBerth` without extending the requirement
type to a list (a broader change than this iteration's scope) — and it
doesn't need to, since `drawEvent`'s pool exclusion already makes the event
unreachable once a berth is held, so `noBonusBerth` would never actually
fire false on that option in practice. `derelict-flotilla`'s ambush option
has no credit cost, so its one requirement slot was free for
`noBonusBerth` — that's where the literal predicate (and its
`describeRequirement` test coverage) lives.

No commander-flavored discount branch on `naval-yard` — the spec marked it
optional ("only if it does not complicate the requirement library"); one
option (move on / buy) is enough for a clean, testable purchase, and a
discount branch would have added a second price to derive and catalog for
no clear balance need.

### 56.3 — the three further late events

- **`counter-relay-breach`** ("Counter-relay breach"): the counter-protocol
  direction. 2 options — leave the relay broadcasting, or storm it (a
  `huntSquadForAmbush` HARD-pool fight, same strength as
  defector-pursuit's/debt-collectors' hunt squads). Winning sets a new
  `AmbushBonus.chainEffect: 'counter-protocol-jammed'`, applied in
  `reducer.ts`'s `CONTINUE` win branch exactly like `'berth-unlocked'` —
  clears `RunState.counterProtocol` outright for the rest of the run. No
  cloak-bypass branch: the file's cloak-option precedent (relic-vault,
  debt-collectors) is "skip the fight, but you don't get the prize either"
  — since the prize here has no credit/part component to separately grant,
  a cloak option would be functionally identical to "leave it," so it was
  left out as pure duplication. "Reveals it early" (the spec's other
  suggested direction) wasn't implementable as a real effect: the
  counter-protocol is already shown on the draft card at pick time
  (`counterProtocols.ts`'s "transparency law"), so there's nothing left to
  reveal — "blunt/cancel it" was the direction with a real design space.
- **`blackout-run`** ("Blackout run"): the heat/pursuit-clock direction. 3
  options — hold course; cut main power (-3 heat, -6cr, requires
  `creditsAtLeast(6)`); or push the reactor into the red (-2 heat, a chosen
  ship takes 2 capped damage, no credit cost). The two heat-reduction
  options are the deliberate complement to `salvage-claim` (the only
  existing event that touches heat, and only ever adds it) — a genuine
  release valve, priced in the two currencies (credits or ship damage) the
  game already uses for "cost is chosen" event options elsewhere. No
  ambush, no credit reward, so no `rewardTiers` entry needed.
- **`black-site-vault`** ("The black-site vault"): the high-stakes-gamble
  direction. 3 options — leave it sealed; blow the door (a
  `huntSquadForAmbush` HARD-pool fight, `ambushBonus: { credits: 6 }`,
  upper-middle of the high-risk band — see the manifest-gate section
  above); or a cloak-gated quiet bypass (a `FIVE_CREDIT_PARTS` grant, no
  fight, matching the `ancient-cache`/`relic-vault` cloak precedent exactly).
  Every ambush-based event in this game already carries "lose the fight and
  the run ends" as its downside (iteration 51 removed withdraw — there's no
  softer loss state), so "real risk, real payoff" needed no extra upfront
  wager mechanic on top of the existing ambush machinery; a HARD-pool
  enemy against the top of the high-risk credit band was enough to read as
  a genuine late-war gamble.
- A fourth event (a repair/refit direction) was considered and dropped —
  the spec itself flags that iteration 52's hull refit no longer exists
  (superseded by hull marks, iteration 59.3), and a mark upgrade is
  shipyard-only by design (`canUpgradeMark`'s own guard). `blackout-run`'s
  "push the reactor" option already gives a repair-adjacent flavor (a
  chosen-cost, no-shop-required trade), so a dedicated fourth event felt
  redundant with it. 3 new events (5 total counting the two berth events)
  matches the spec's "3 is enough" framing.

All 5 new events resolve every declared option through
`resolveEventChoice — every EVENTS entry resolves (47.5r)`'s existing
generic sweep with no changes needed there — that test already iterates
`EVENTS` and every option index, so it picked the new entries up for free.

### Sim agent stability (56.5's liveness instruction)

Every new event's index-0 option ("Move on" / "Leave it" / "Leave the relay
broadcasting" / "Hold course" / "Leave the vault sealed") is always legal
(no `requirement`), so `runEventChoice`'s first-legal-option policy always
declines every new event in the headless sim — same shape as
`debt-broker`'s "decline politely" and `war-surplus-peddler`'s "move on."
`derelict-flotilla`'s and `naval-yard`'s meaningful options are never
exercised by the sim's default policy as a result, same as the existing
debt/colony chains' fight branches aren't either — an accepted, precedented
gap, not a stability risk (`scripts/sim/agent.test.ts` ran clean, 0
`rejectedDispatch`, across every archetype/commander/seed it checks).

### Balance: `npm run balance:full` (n=500/commander, report-only)

Act-1 clear rate, vs. iteration 61's table (`plans/iteration-61.md`'s status
notes) — the only table that iteration recorded, since full-run/act-2
numbers were already at the floor there too:

| Commander | Iteration 61 | Iteration 56 | Δ |
|---|---|---|---|
| Baseline (auto) | 11.4% | 12.8% | +1.4pp |
| Merchant | 11.2% | 10.4% | -0.8pp |
| Engineer | 14.8% | 15.0% | +0.2pp |
| Spymaster | 9.2% | 8.8% | -0.4pp |
| Admiral | 9.4% | 8.4% | -1.0pp |
| Warlord | 12.6% | 12.6% | 0.0pp |

All six moves are within a 500-run Wilson interval's noise band (roughly
±3pp at these rates) — expected, since nothing in this iteration touches an
act-1-reachable system (every new event is `stages: ['late']`, i.e., act-2
only, and the `bonusFleetBerths` threading through `agent.ts` is a no-op for
any run that never reaches a berth event). The small shifts come from the
new events existing in the seeded rng stream at all (any act-2-reaching run
now consumes different rng draws than before), the same kind of noise
iteration 59→61's own table shows.

**Act-2 conditional clear, called out specifically per the spec's
instruction**: stayed at **0.0% for every commander**, identical to
iteration 61's recorded 0.0% `KNOWN GAP` (unaffected by iteration 61, and
unaffected here too). This is "unchanged," which the spec explicitly frames
as an acceptable outcome — a berth is a survivability buff layered on top
of the act-2 wall, but the wall itself (iteration 51's ~40-50%-die-at-column-
11 measurement, iteration 55's target) sits at a full-run floor of 0%
already: the headless agent's default policy essentially never *reaches* a
state where the berth's survivability edge could show up in a full-run
clear-rate delta, because nothing clears act 2 at all yet regardless of
fleet size. The berth's real effect (if any) won't be measurable in this
metric until iteration 55 lifts the act-2 floor above 0% — noted per 56.4's
own instruction not to claim an effect this iteration can't actually
demonstrate. No balance lever was pulled; this run was report-only, as
instructed.

### 56.4 — interaction with the act-2 wall

Confirmed by inspection, not just assertion: this iteration adds no new map
node types and touches no fight-count logic — `naval-yard`/
`derelict-flotilla`/the three 56.3 events only change what can appear *on*
an existing event node (`drawEvent`'s stage-filtered pool), never how many
event/combat/shop nodes a column has. The berth's only reach into combat is
`fleetCap`'s `+bonusBerths` term. Per the spec's own instruction: iteration
55's difficulty-wall measurement, if it lands after this one, should treat
a run that happens to hold a bonus berth as a confound and either exclude it
or note it separately — this iteration didn't attempt that measurement
itself (it's 55's job).
