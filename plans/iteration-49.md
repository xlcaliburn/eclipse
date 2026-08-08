# Iteration 49 — Events that know what time it is

> **Status: implemented and verified (2026-08-08).** All of 49.1-49.5 and
> 49.7's tests landed; 49.6 (wiki polish) landed as a plain "Stage" column
> rather than a chip row. `npx tsc -b tsconfig.app.json --force` clean,
> `npx vitest run src` green (750/750, up from 701 — 49 new tests across
> `events.test.ts`/`reducer.test.ts`), `npx vite build` clean. No live
> browser verification performed (standing policy). See the notes at the
> end of this file for deviations and the full verification record.

## Motivation (user report, 2026-08-08)

The event pool is one uniform 13-event draw at any depth. The first event
slot of a run can serve militia-requisition (locked to "Refuse" with an
empty inventory — a dead screen), repair-tender (useless with no damage and
~no credits), or defector (whose pursuit pulls from the act's HARD_POOL — a
near-death sentence at column 2). The pool has no notion of *when* an event
is interesting.

Direction, per the user: stage-gate the pool; make the early slots either
low-risk/low-reward events or quest-line starters. Scope agreed in chat:

1. The stage-gating mechanism + re-tiering the existing pool.
2. Three new low-risk early events: **customs checkpoint**, **war-surplus
   peddler**, **old navigation buoy**.
3. Two quest lines: **the debt broker** (risk-inverted: money now, cost
   later) and **the colony ship** (kindness compounds across three beats).

## Grounding (verified against the code, 2026-08-08)

- `src/game/events.ts`: `EVENTS` table, `drawEvent(rng, state)` (uniform
  over `RANDOM_EVENTS` minus `lastEventId`, with the relic chain's 50%
  continuation check up front), requirement predicate library
  (`EventRequirement` / `meetsRequirement` / `describeRequirement`),
  `resolveEventChoice` with `pay`/`grant` builders, `applyCappedDamage`,
  `easyRaidersForAmbush` (easy pool), `huntSquadForAmbush` (hard pool),
  `columnPositions`/`mergeRevealed` (recon-probe's chart machinery).
- `src/game/reducer.ts` PICK_NODE event branch (~line 896):
  `const eventId = state.pendingEventId ?? drawEvent(rng, state)` — note it
  passes the PRE-MOVE `state`; the entered node's position lives on `base`.
- `src/game/map.ts`: act 1 = `LANE_COLUMNS = 10` (events appear in columns
  1–4 and 6–7; col 0 opener, col 10 boss), act 2 = `ACT2_LANE_COLUMNS = 12`;
  `globalColumn(act, col)` = act-1 col as-is, act-2 col + 11. So global
  event columns run 1–7 (act 1) and 11–21 (act 2).
- `src/game/types.ts`: `RunState.relicFragments?`, `pendingEventId?`,
  `lastEventId?` are the chain-state precedents; `AmbushBonus` is
  `{ credits?: number; partId?: PartId }` (win-conditional, consumed in the
  reducer's post-fight settlement — find `pendingAmbushBonus`).
- `src/game/persistence.ts`: new OPTIONAL RunState fields need no
  SAVE_VERSION bump (iteration 18/20/21 precedent — saves round-trip the
  whole object; `isValidRunState` only checks always-required fields).
- Wiki (`src/wiki/Wiki.tsx`) renders `EVENTS` data-driven — new events
  appear automatically.

## 49.1 Stage gating

New exported types/helpers in `events.ts`:

```ts
export type EventStage = 'early' | 'mid' | 'late';
export function eventStage(act: 1 | 2, col: number): EventStage {
  const g = globalColumn(act, col);
  return g <= 3 ? 'early' : g <= 10 ? 'mid' : 'late';
}
```

Bands, concretely: **early** = act-1 columns 1–3 (the first one-or-two
event slots), **mid** = act-1 columns 4–7 (plus any act-1 stragglers),
**late** = all of act 2.

`EventDef` gains a required `stages: EventStage[]` field — an explicit list
(not min/max) so the table reads at a glance and can't be misread. For
chain-continuation events that never enter the random pool the field is
documentation (set it to the stages the chain can actually fire them in).

`drawEvent` changes:

- Signature: `drawEvent(rng, state, col)` where `col` is the **entered
  node's act-local column** — the PICK_NODE call site must pass the
  destination column (from `base.position` / the node being entered), NOT
  `state.position` (pre-move). This is the one subtle bit; get it right and
  add a test pinning it.
- Pool filter: `RANDOM_EVENTS.filter(e => e.stages.includes(stage))`, then
  the existing `lastEventId` / taken-relic-signal exclusions. Keep the
  existing "if the filtered pool is empty, fall back" guard (fall back to
  the unfiltered stage pool first, then `RANDOM_EVENTS`) — with the tier
  table below every stage has ≥ 8 events, so this is belt-and-suspenders.
- Chain continuation checks run BEFORE the pool draw, in priority order
  (first hit wins, one continuation per node):
  1. Relic (existing, unchanged): fragments 1/2 → 50% → vault/core.
  2. Debt (49.4): `loanOutstanding` && stage ≠ 'early' → 50% →
     `debt-collectors`.
  3. Colony (49.5): `colonyStage === 1` && stage ≠ 'early' → 50% →
     `colony-raiders`; `colonyStage === 2` && stage === 'late' → 50% →
     `colony-arrival`.

  Earlier-priority chains can shadow later ones on a given node — accepted
  (comment it); pending chains just wait for the next event node.

### Re-tier table for the existing pool

| Event | `stages` | Why |
|---|---|---|
| derelict-cruiser | early, mid | Small numbers; a dead node by act 2 |
| asteroid-field | early, mid | Same |
| abandoned-arsenal | early, mid | Same |
| relic-signal | early, mid | The chain needs runway to finish; already excluded once taken |
| recon-probe | early, mid, late | Map intel is good at any depth |
| distress-beacon | early, mid, late | Easy-pool fight scales acceptably |
| intercepted-signal | mid, late | Escalation reveals matter once the run has shape |
| sabotage-raid | mid, late | Escalation cancel + chip damage |
| defector | mid, late | The pursuit draws from HARD_POOL — lethal early |
| repair-tender | mid, late | Needs accumulated damage + credits |
| salvage-claim | mid, late | Heat economy is a mid-game lever |
| militia-requisition | mid, late | Needs spare inventory — the original complaint |
| ancient-cache | mid, late | The risky path is an ELITE fight |

(defector-pursuit / relic-vault / relic-core: continuation-only, unchanged.)

## 49.2 New requirement kind: `inventoryAtMost`

Add `{ kind: 'inventoryAtMost'; value: number }` to `EventRequirement`:
`meetsRequirement` → `state.inventory.length <= value`;
`describeRequirement` → `requires ${value} or fewer spare parts` (the one
consumer below sets a bespoke `reqText` anyway, same pattern as
militia-requisition). Note: inventory = unequipped spares only, which fits
the fiction ("nothing loose in the hold").

## 49.3 Three low-risk early events (stages: `['early']`)

All three are deliberately tiny — they teach a system or hand out pocket
change, and they age out of the pool after column 3.

**`customs-checkpoint` — "Customs picket"**
Flavor: a militia customs picket straddles the lane, waving traffic into an
inspection queue.
1. `Pay the toll (-1 credit)` — req `creditsAtLeast 1` → −1cr.
2. `Slip past the picket (+1 heat)` → `addHeat(heat, 1)`. (The
   always-available option; teaches heat cheaply.)
3. `Nothing to declare — an empty hold is waved through` — req
   `inventoryAtMost 0`, reqText `requires an empty cargo hold` → no state
   change, flavor-only outcome. (A requirement the player actually MEETS
   early — the inverse of the militia-requisition problem.)

**`war-surplus-peddler` — "War-surplus peddler"**
Flavor: a tramp freighter flags you down, hold full of surplus of dubious
provenance.
1. `Move on` → nothing.
2. `Buy a mystery crate (-2 credits)` — req `creditsAtLeast 2` → −2cr, grant
   one random COMMON-tier part. New pool const:
   `COMMON_CRATE_PARTS = PARTS.filter(p => p.rarity === 'common' && isSalvageablePart(p.id))`
   — verify that filter excludes the special parts (commodity lot, relic
   artifact, captured schematic); if not, hand-list instead. Capped at
   common so it can't shortcut the shop economy.
3. `Sell them your scrap (+2 credits)` → +2cr.

**`nav-buoy` — "Old navigation buoy"**
Flavor: a pre-war navigation buoy still blinks its survey beacon on a dead
frequency.
1. `Scrap it (+2 credits)` → +2cr.
2. `Pull its charts — reveal every node in the next column` → reuse
   `columnPositions`/`mergeRevealed` for `col + 1` (the cheap cousin of
   recon-probe: node reveal only, NO enemy-pool names, no 2-column option).

## 49.4 Quest line: the debt broker

Risk-inverted: the reward lands early (when 8cr matters most), the cost
lands mid/late (when the player can choose how to pay it).

**`debt-broker`** (stages `['early']`, in the random pool)
Flavor: a licensed credit broker hails you — fleet expansion capital,
generous terms, minimal paperwork.
1. `Decline politely` → nothing.
2. `Take the loan (+8 credits — repayment of 12, collected "whenever we
   find you")` → +8cr, set new optional RunState field
   `loanOutstanding: true`.

**`debt-collectors`** (continuation-only, fires mid/late per 49.1)
Flavor: the broker's enforcers drop out of warp, ledger in hand — 12
credits, due now.
1. `Settle the debt (-12 credits)` — req `creditsAtLeast 12` → −12cr, clear
   `loanOutstanding`.
2. `Fight the enforcers` → ambush via `huntSquadForAmbush` (hard pool, the
   defector-pursuit precedent), with the debt cleared ONLY on a win — see
   the `chainEffect` mechanism in 49.5. `loanOutstanding` stays set at
   choice time, so a WITHDRAW from the fight leaves the debt live and the
   collectors come back on a later 50% roll. (Deliberate — fiction holds.)
3. `Cloaking field: slip away` — req `partEquipped cloak` → no change;
   debt stays outstanding, they will return.

A player who can't pay and has no cloak has only the fight — deliberate;
that's the loan's teeth. A run that ends before the collectors ever roll is
free money — also deliberate (the threat is probabilistic, not guaranteed).

## 49.5 Quest line: the colony ship

Three beats across the whole run; helping is free early, the fight lands
mid, the payoff lands in act 2.

New optional RunState field: `colonyStage?: 1 | 2`.

**`colony-ship`** (stages `['early']`, in the random pool)
Flavor: a slow colony convoy crawls across your scanners — holds full of
settlers, engines older than the war.
1. `Sell them your survey charts (+3 credits)` → +3cr; chain never starts.
2. `Escort them through the debris belt — costs you nothing but time;
   they'll remember` → set `colonyStage: 1`.

**`colony-raiders`** (continuation-only, fires mid/late while stage 1)
Flavor: the convoy's distress call cuts through — raiders are on them, and
yours is the only gun in range.
1. `Let it happen — some fights aren't yours` → clear `colonyStage`; chain
   ends.
2. `Drive the raiders off` → clear `colonyStage` at choice time, then
   ambush via `easyRaidersForAmbush` (easy pool — a genuine small-stakes
   fight) with `chainEffect: 'colony-defended'` restoring the chain to
   `colonyStage: 2` ONLY on a win. A withdraw means the convoy scattered —
   chain dead, which is the honest fiction.

**`colony-arrival`** (continuation-only, fires late while stage 2)
Flavor: the colony ship makes orbit at last — and the whole settlement
knows whose guns got them there.
1. `The founders' gift (+10 credits and a part from their stores)` → +10cr,
   grant one random part from `FIVE_CREDIT_PARTS` (the rare-tier event
   pool), clear `colonyStage`.
2. `Cash settlement (+14 credits)` → +14cr, clear `colonyStage`.

If act 2's 50% rolls never land the arrival, the payoff is simply missed —
accepted; note it in a comment. (Act 2 has 8 event-node columns, so the
expected miss rate is low.)

### The `chainEffect` mechanism (shared by 49.4/49.5)

`AmbushBonus` gains one optional field:

```ts
chainEffect?: 'debt-cleared' | 'colony-defended';
```

Applied wherever `pendingAmbushBonus` is consumed on a WON fight (the same
settlement that pays `credits`/`partId` today): `'debt-cleared'` clears
`loanOutstanding`; `'colony-defended'` sets `colonyStage: 2`. Nothing is
applied on loss (run over) or withdraw (bonus forfeited — existing rule).

## 49.6 Optional polish

- Wiki: show each event's stage tags as a small chip row in the events
  section (the table is already data-driven off `EVENTS`). Nice-to-have; skip
  if it fights the layout.

## 49.7 Tests

In `src/game/` test files, following existing patterns (seeded rng sweeps,
`stateWithMap`-style fixtures):

1. `eventStage` boundary cases: global 3 vs 4, 10 vs 11 (act-2 col 0 →
   'late').
2. `drawEvent` stage filtering across many seeds: at an early column never
   yields a mid/late-only event (e.g. militia-requisition, defector); at a
   late column never yields an early-only event (customs-checkpoint etc.).
3. `drawEvent` receives the ENTERED node's column — a regression test
   pinning the PICK_NODE call-site fix (an event node at column 4 must draw
   from the mid pool even though pre-move `state.position.col` is 3).
4. `inventoryAtMost`: met at 0 spares, unmet with 1; `describeRequirement`
   text.
5. Each new event's resolutions: credit deltas (clamped), heat, part
   grants (rarity of the granted part where capped), `revealedNodes` merge
   for nav-buoy.
6. Debt chain: loan sets the flag (+8cr); collectors never fire at an
   early column and do fire (50%) mid+ across seeds; settle clears; cloak
   keeps it outstanding; fight win clears via `chainEffect` (drive a real
   ambush → CONTINUE win, per the existing defector-pursuit/ambush-bonus
   test precedent).
7. Colony chain: stage transitions incl. the clear-then-restore-on-win
   shape; arrival fires only late; both payoff options.
8. Existing relic-chain and event tests keep passing (continuation priority
   order preserved).

## Verification bar

- `npx tsc -b tsconfig.app.json --force` clean (the root `tsc -b` currently
  fails on unrelated `scripts/**` inclusion from a concurrent session —
  scope to the app project).
- `npx vitest run src` green (`scripts/sim/*.test.ts` has unrelated
  pre-existing failures owned by a concurrent session).
- `npx vite build` clean.
- Do **NOT** touch `scripts/` — it's owned by a concurrent session and
  currently mid-rework (it references already-removed Foundry exports; that
  breakage is known and out of scope).
- No live browser passes (standing policy, CLAUDE.md).

## Out of scope / notes

- No SAVE_VERSION bump: `loanOutstanding`/`colonyStage` are optional with
  safe-absent semantics (iteration 18/20/21 precedent).
- The stage bands (≤3 / 4–10 / ≥11) are the retune knob if playtesting says
  the early window is too short/long — keep them in one place
  (`eventStage`).
- Parked (discussed, not chosen this iteration): "shakedown run" (needs
  temp-buff machinery), "the stowaway mechanic" (touches the most systems
  for the least drama), "torn cache map" (third chain — hold until the
  first two prove the shape).

## Status notes (implementer, 2026-08-08)

**Implemented in full**: 49.1 (stage gating, `EventStage`/`eventStage`,
`drawEvent`'s new `col` param + relic→debt→colony priority chain, the
re-tier table applied to all 13 pre-existing random-pool events plus
`stages` documentation tags on the 5 continuation-only events), 49.2
(`inventoryAtMost`), 49.3 (customs-checkpoint / war-surplus-peddler /
nav-buoy), 49.4 (debt-broker / debt-collectors + `loanOutstanding`), 49.5
(colony-ship / colony-raiders / colony-arrival + `colonyStage`), the
`chainEffect` mechanism on `AmbushBonus`, and 49.7's test list.

**Files touched**: `src/game/events.ts` (EventId union, `EventStage`/
`eventStage`, `inventoryAtMost`, `EventDef.stages`, 8 new event defs,
`COMMON_CRATE_PARTS`, `drawEvent` rewrite, 8 new `resolveEventChoice`
cases), `src/game/types.ts` (`AmbushBonus.chainEffect`,
`RunState.loanOutstanding`/`colonyStage`), `src/game/reducer.ts`
(PICK_NODE's `drawEvent(rng, state, node.col)` call site fix, the
`chainEffectPatch` applied in CONTINUE's regular-win branch),
`src/wiki/Wiki.tsx` (49.6), `src/game/events.test.ts` and
`src/game/reducer.test.ts` (new tests; 6 pre-existing `drawEvent(rng,
s0)` call sites in `events.test.ts` updated to the 3-arg signature).

**Deviations from the spec**:

1. **49.6 (wiki polish)**: implemented as a plain third `<th>Stage</th>`
   column (`{e.stages.join(', ')}`) rather than a chip row inside the
   Options cell. Simpler, doesn't touch `styles.css`, and the spec
   explicitly said "skip if it fights the layout" — a full-width table
   already had room for one more narrow column, so this was the lower-
   risk version of the same information.
2. **Chain-continuation priority order, made explicit as `if`/`else if`,
   not three independent `if`s**: the spec's "first hit wins... earlier-
   priority chains can shadow later ones" is satisfied by making relic/
   debt/colony mutually exclusive checks at a single node — if
   `relicFragments` is 1 or 2, that's the ONLY roll attempted this node
   (debt/colony aren't even checked, hit or miss), and likewise debt
   shadows colony. This reads as the more literal interpretation of
   "shadow" than "each independently gets its own roll if eligible,"
   which would let a missed relic roll and a missed debt roll both
   consume a node's continuation slot in the same draw. Covered by a
   dedicated test in each of `events.test.ts`'s debt/colony
   `describe` blocks ("the relic chain shadows the debt chain..." /
   "the debt chain shadows the colony chain...").
3. **`COMMON_CRATE_PARTS`** kept the spec's `isSalvageablePart(p.id)`
   filter even though it's provably redundant against `PARTS` today (the
   commodity lot / Ancient artifact / captured schematic specials are
   declared as separate consts and never pushed into the `PARTS` array
   itself — see `parts.ts`'s own comments on each). Kept per the spec's
   explicit instruction ("verify... if not, hand-list instead") as cheap
   insurance against a future special being added to `PARTS` directly.

**No SAVE_VERSION bump**: confirmed `loanOutstanding`/`colonyStage` are
both optional with safe-absent semantics, matching the iteration 18/20/21
precedent the spec cited; `persistence.ts`'s `isValidRunState` needed no
change.

**Concurrent-session note**: `plans/iteration-48.md`'s status block
mentions a Foundry/fusion-removal change in progress elsewhere in this
tree, causing pre-existing `scripts/sim/*.test.ts` failures. Confirmed
still present and untouched — this iteration made no edits under
`scripts/`. `src/game/reducer/` (a new directory, untracked at session
start per the git status in the task prompt) was left alone; nothing in
this iteration's diff touches it.

**Verification bar — all three ran clean**:

- `npx tsc -b tsconfig.app.json --force` — clean, no errors.
- `npx vitest run src` — 750/750 passed (26 files), up from 701/701 at
  session start (49 new tests: `eventStage` boundaries, `inventoryAtMost`,
  stage-filtering sweeps for both new stage bands, the 3 new early
  events' resolutions, both quest chains' `resolveEventChoice` cases and
  `drawEvent` continuation checks including the shadowing tests, the
  PICK_NODE entered-column regression test, and end-to-end
  EVENT_CHOOSE/CONTINUE integration tests for both chains including a
  losing-fight case that leaves the debt outstanding and a withdrawn-
  ambush case that forfeits the colony chain's restore).
  `scripts/sim/*.test.ts` not run (excluded per the task scope; its
  failures are pre-existing and owned by the concurrent session).
- `npx vite build` — clean (one unrelated Node-version advisory printed
  by Vite itself, not an error).
- No live browser/preview verification was performed, per CLAUDE.md's
  standing policy.
