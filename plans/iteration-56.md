# Iteration 56 — Act-2 events and the extra berth (specced 2026-08-12)

> **Status: specced, not implemented.** Implementer: record deviations and
> verification results here, per the established style.

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
