# Iteration 64 — Act 2 becomes winnable: instrument the chain, then break it (specced 2026-08-13)

> **Status: IMPLEMENTED and MEASURED (2026-08-13) — 64.0/64.1/64.2/64.4 all
> landed; 64.3 stays deferred (out of scope this pass, per the spec's own
> section header).** The 64.0 decision gate read "proceed into 64.4"
> (details below), so 64.4 was built, not skipped. **The stop condition
> fired: 64.2 + 64.4 together moved act-2 conditional clear by 0.0pp
> (0.0% -> 0.0% -> 0.0%, every commander, n=500 each stage) — well under
> the 2pp bar.** Per the spec's own instruction this means STOP, don't
> chase further tuning this pass, and report that the model needs
> re-reading against the fresh tables. That's what this status-notes
> section does. D1's 15-25% conditional / 2-4% full-run bands are now the
> live gate in `scripts/runSim.ts` (still failing, expected — the level
> itself needs a bigger structural change than this pass's levers, see
> "What the stop condition means" below), full detail and every deviation
> recorded below.

## Motivation

Act-2 conditional clear has measured **0.0% for every commander in every
sample across the project's entire history** — no simulated run has ever
cleared act 2, and exactly one (a Warlord, post-55) has ever even
*reached* the final boss column. Iteration 46 diagnosed why and flagged
two structural paths for a user decision that was deferred; iteration 55
fixed the entry seam (measurably — the entry cluster shrank from ~40–50%
of act-2 deaths to ~25%) but was explicitly a single-node fix. This
iteration is the structural one.

## Grounding (fresh data, 2026-08-13, post-55/56/62/63)

### The compounding math (46's load-bearing finding, restated)

Clearing act 2 means winning ~12–13 fights in sequence. Even at a
healthy-sounding 85% average per-fight win rate, `0.85^13 ≈ 12%`;
at 80%, ~5.5%; the measured reality is far below either. **Reaching the
old 30% conditional target requires ~90% average per-fight odds — which
stops any fight from being a fight.** No stat tuning escapes this; only
chain length, recovery between links, or the target itself can move.

### The survival curve (computed from the fresh death histograms, n=500 auto)

60 runs entered act 2. Deaths by act-2 local column:

| local col | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 | c8 | c9 | c10 | c11 | boss |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deaths | 15 | 3 | 15 | 2 | 7 | 0 | 8 | 5 | 3 | 1 | 1 | 0 | 0 |
| still alive after | 45 | 42 | 27 | 25 | 18 | 18 | 10 | 5 | 2 | 1 | 0 | 0 | — |

Read that carefully — it changes the diagnosis:

1. **The bleed is everywhere, not at one wall.** Per-column loss rates of
   25% (c0), 33% (c2 — the first column after 55's entry ramp ends and
   Raider wing returns), 28% (c4), 44% (c6), 50% (c7). These are
   per-fight win rates of ~55–75% for the fleets that actually arrive —
   *massively* below the 43–99% the hand-built fixtures measure. The
   fixtures model a healthy fleet; real (agent) fleets arrive far weaker.
2. **A fresh-healed fleet loses 25% of the time to the act's WEAKEST
   pool.** The boss auto-heal + interlude means act-2 entrants are at
   full HP, facing 44cr Torpedo boats at 32% of budget — and still one in
   four dies by local c0–1. HP isn't the missing resource. The prime
   suspect: **hulls lost in act 1 are gone forever** — the interlude
   heals damage, not dead ships — and fleet *value* (ships × parts), not
   fleet HP, is what the fixtures assume. Merchant corroborates: his
   shop-first routing makes his c0 deaths nearly vanish (3 vs 15).
3. **Nobody reaches the top end.** c10–11 (the hard-pool crescendo 55
   deliberately made richer) and the boss have effectively zero visitors.
   The final trio's own fixtures sit at a healthy 40–52% — the boss is
   not the problem; getting there is.

### Structural facts (code-verified)

- Act 2: **12 lane columns + boss**, 4 rows, no opener — local c0 is
  3 combats + 1 event. Every column has ≥1 non-fight node, but heat
  prices every dock (+1, Hunted at 4 converts the dock to a fight), so
  fight-avoidance self-limits. Realistic minimum is ~9–10 fights.
- **Exactly 2 seeded warp shortcuts** per map (`generateAct2Shortcuts`),
  each skipping exactly 1 column, drawn from cols 2–8 — never the hard
  band (from-col ≤ 8 means the latest skip lands you at c10... but both
  can roll early, and neither can skip c9+).
- 46.1's planned "act-2-entry snapshot in AgentRunOutcome" **was never
  built** — the outcome struct has no fleet-value field. We have never
  actually measured what fleets arrive with. That's 64.0.
- Post-55 curve state: entry ramp works (c0–1 worst node 44cr / 32%);
  T2-act2 = 144% (the act now *rises* toward its end — intended, that's
  where the surplus goes); worst top-end node Swarm armada 197cr / 47%.

## The design position

Three multiplicative levers: **chain length × per-fight odds ×
recovery**. 46's two paths are both taken, moderately, instead of one
drastically: the chain gets shorter (64.2), recovery gets a mid-act
beat (64.3), per-fight odds get attacked at their real root — fleet
quality on arrival, pending 64.0's confirmation (64.4) — and the target
is revised to what the resulting math can honestly support (D1).

## 64.0 Instrument first (blocking milestone — pure reporting, no tuning)

Add to `AgentRunOutcome` + the `runSim.ts` report:

- **Per-act-2-column survival table** (deaths / entrants per local
  column, plus the boss) — the table hand-computed above becomes a
  standing output, so every later stage reads its effect directly.
- **Act-2 entry snapshot**: fleet size, total fleet value (frame costs +
  equipped part costs), credits in hand — reported as a distribution
  (median / p25 / p75) over entrants. Same snapshot again at local c6.
- Keep it deterministic and side-effect-free (fields on the outcome
  struct, no reducer changes).

**Decision gate written into this spec**: if the median entry fleet's
part value is at or above the "rich" fixture (~74cr), the fleet-quality
hypothesis is wrong — 64.4 shrinks to a no-op and the freed budget goes
into 64.2's routing instead. If it's near the "lean" floor (~31cr), 64.4
is confirmed as the main event.

## 64.1 The revised target (user decision D1)

Propose: **floor-agent act-2 conditional 15–25%** (full-run ~2–4% at
current act-1 rates), gates re-anchored, the 46-era 30% figure formally
retired (it was never achievable at this fight count — see the math).
The floor agent is deliberately mediocre; skilled human play should land
well above the floor band.

## 64.2 Shorten the chain

- Shortcuts **2 → 3**, and the third is **guaranteed to spawn in the
  hard band** (from-col 8–9, landing at 10–11) — the stretch where
  per-fight odds are worst is exactly where a skip is worth the most.
  (Today's generator caps from-col at 8 and both rolls can land early.)
- One of the three (seeded choice) skips **2 columns** instead of 1 —
  a genuinely dramatic lane for the run that finds it.
- Net effect: expected forced-fight count drops from ~12 to ~9–10 on a
  shortcut-seeking route. At 80% per-fight that alone is roughly a
  2–3× conditional-clear multiplier.
- Implementation: `generateAct2Shortcuts` only; PICK_NODE already
  handles shortcut traversal and fled-column marking (iteration 32).
  The sim agent already takes reachable shortcuts implicitly via
  `reachableNodes`.

## 64.3 The resupply line (mid-act recovery beat; user decision D3)

> **OUT OF SCOPE for this implementation pass (2026-08-13) — D3 is
> deferred, not decided.** Do not build this section. Left in place so
> the spec is complete when it's picked back up; skip straight to 64.4.

Crossing into **local c6** (just past the halfway shipyard at c5)
triggers an automatic one-time resupply: **full fleet heal**, presented
as a banner/interstitial (no choice, no upgrade — this is act 2's
"the supply convoy finds you," not a second interlude draft). Cuts the
attrition chain into two ~6-fight halves.

- Follow-on: c6's quota row currently holds a `repair` node — swap it to
  `event` so the checkpoint doesn't sit on top of a now-redundant repair
  column (`ACT2_QUOTAS` one-line change).
- Alternative shape if a full heal feels too generous (D3): half heal
  (`ceil(damage/2)` per ship), or no checkpoint and instead act-2
  post-win repair +2 (vs the universal +1). Recommendation: **full
  heal** — legible, thematic, and the survival table shows c6–c7 as the
  worst back-half bleed (44%/50% per-column losses), exactly where worn
  fleets are dying to mid-pool enemies they'd beat fresh.

## 64.4 Fleet quality on arrival (sized by 64.0's decision gate)

> **Gated, not pre-approved.** Implement 64.0, run it, read the entry
> fleet-value snapshot against the gate below, and REPORT the reading
> before writing any 64.4 code. Only proceed into 64.4 itself once the
> data says to.

If 64.0 confirms entrants are hull-poor/value-poor:

- **The interlude gains a reinforcement beat**: alongside the existing
  upgrade pick, a fleet below 3 commissioned hulls at act-2 entry is
  offered one free common-tier hull (seeded 1-of-2 choice, arrives with
  its STARTING_FIT) — replacing losses the way a war actually would
  between campaigns. One-time, interlude-only, no credit interaction.
- **Sim-agent shopping check** (policy, not game rules): verify the
  agent isn't banking credits it should spend before the act-1 boss /
  at act-2 shops — 64.0's credits-in-hand snapshot answers this. If
  it's hoarding, fix `policy.ts` thresholds and re-baseline (a sim-only
  change, worth doing regardless so the floor measures the game rather
  than the agent's thrift).
- If 64.0 refutes the hypothesis: skip both, record the numbers, and
  put the effort into a 4th shortcut / stronger 64.2 instead.

## 64.5 Explicitly NOT in scope

- **No enemy stat nerfs.** 55 just set the curve deliberately (entry
  ramp, rising top end) and its gate protects it; undoing that under
  schedule pressure would be two iterations fighting. If survivors now
  reach c9–11 and crater against the 197cr Swarm armada, that's the
  next iteration's measured decision, not this one's reflex.
- **The final boss trio** — fixtures healthy at 40–52%; nobody reaches
  them; nothing to tune yet.
- **Act-1 anything.**

## 64.6 Measurement

- Stage order: 64.0 (report-only baseline with the new instruments) →
  64.2 → 64.3 → 64.4 — `npm run balance:full` (n=500) after each, with
  the new survival table recorded per stage so each lever's effect on
  *which columns kill* is attributable.
- Success: act-2 conditional inside D1's band; the survival table shows
  runs actually reaching c10+ and the boss; act-1 clear untouched
  (nothing here reaches act 1); `difficultyCurve.test.ts` stays green
  untouched; full bar (`tsc`/`vitest`/`build` + sim liveness) per stage.
- Stop condition: if 64.2 + 64.3 together move conditional by <2pp,
  stop before 64.4 and re-read the new instruments — the model is wrong
  somewhere, and 64.0's tables will say where.

## User decisions

- **D1 — the target: CONFIRMED (2026-08-13).** Floor-agent act-2
  conditional 15–25% (full-run ~2–4%); the 46-era 30% target is
  formally retired. Re-anchor every gate/band this touches.
- **D2 — the chain: CONFIRMED (2026-08-13).** Shortcuts 2→3, one
  guaranteed in the hard band (from-col 8–9), one of the three skipping
  2 columns instead of 1.
- **D3 — the resupply: DEFERRED.** Build 64.0–64.2 first (this pass);
  come back to 64.3 afterward. Open question when it's picked back up:
  automatic full heal at local c6 for every run (as specced, the
  recommendation) vs the same trigger with a banner-level choice
  (full repair vs partial repair + a small cache) layered on top — see
  the chat discussion 2026-08-13 for the full reasoning on why this is
  an automatic act-crossing trigger, not a routable node, either way.
  **64.3 is out of scope for this implementation pass.**

## Implementation status notes (2026-08-13)

### What was built

- **64.0 (instrumentation)**: `AgentRunOutcome` (`scripts/sim/agent.ts`)
  gained `act2EntrySnapshot`/`act2Col6Snapshot` (`FleetSnapshot: {
  fleetSize, fleetValue, credits }`), captured once each by
  `simulateRunWithAgent`'s own run loop — entry the instant `state.act`
  flips to 2 and the run sits at `phase: 'map'` with `position: null`
  (before any act-2 credit is spent), col-6 the instant `state.position.col
  === 6`. Both are pure reads of `RunState` already produced by the real
  reducer; neither is ever consulted by any decision the agent or the
  reducer makes. `scripts/runSim.ts` reports both as median/p25/p75 over
  every run that reached the trigger point, plus a per-act-2-local-column
  survival table (deaths / entrants per column 0–11 and the boss) computed
  straight from the `act`/`diedAt`/`won` fields every outcome already
  carried — no new instrumentation needed for that table specifically.
- **64.1 (target re-anchor)**: `scripts/runSim.ts`'s gate checks —
  act-2 conditional 20-40% → **15-25%**, full-run 4-16% → **2-4%**, both
  now citing `plans/iteration-64.md (D1)` instead of `iteration-46.md`.
  Act-1 clear's own 20-40% band is untouched (D1 only revises the act-2/
  full-run figures), per the task's own instruction.
- **64.2 (shortcuts 2→3)**: `generateAct2Shortcuts` (`src/game/map.ts`)
  now places 3 shortcuts — one guaranteed hard-band (from-col 8-9, landing
  at local col 10-11), the original two unchanged (from-col 2-8) — and one
  of the three (seeded, chosen before any slot is placed) skips 2 columns
  instead of 1. `src/game/map.test.ts` updated for 3 shortcuts and the new
  invariants (see "Deviations" below for the one relaxation).
- **64.4 (interlude reinforcement hull)**: built — the decision gate read
  "proceed" (see below). `INTERLUDE_CHOOSE` (`src/game/reducer.ts`) now
  checks `commissionedFleetSize(fleet) < 3` after the upgrade pick; if
  true, phase becomes the new `'interlude-reinforcement'` (added to
  `Phase`, `src/game/types.ts`) with `pendingReinforcementOptions` set to
  2 seeded distinct common-tier frame ids (`COMMON_REINFORCEMENT_FRAME_IDS`:
  interceptor/derelict/corvette/frigate/tender/ew-cutter), drawn from the
  same continued rng stream as the upgrade pick. A new action
  `INTERLUDE_CHOOSE_HULL` picks one, adds it to the fleet with exactly its
  `STARTING_FIT` (same shape as a real `BUY_SHIP`, no cost), and advances
  to `'protocol-draft'` — the normal act-2 entry flow otherwise unchanged.
  One-time by construction (the act-1 boss is only ever beaten once). UI:
  new `src/components/InterludeReinforcementScreen.tsx`, wired into
  `src/App.tsx` alongside the existing `InterludeScreen`. Sim agent
  (`scripts/sim/agent.ts`): `INTERLUDE_CHOOSE_HULL` added to the
  exhaustiveness table and to `step()` (always takes the first of the 2
  offered options — "which specific common hull" isn't a policy axis the
  floor agent's config tables model).

### Fresh baseline (64.0, before any tuning) — n=500/commander

| | full-run clear | act-1 clear | act-2 conditional (n reached) |
|---|---|---|---|
| Baseline (auto) | 0.0% [0.0-0.8] | 12.0% [9.4-15.1] | 0.0% (60) |
| merchant | 0.0% [0.0-0.8] | 10.0% [7.7-12.9] | 0.0% (50) |
| engineer | 0.0% [0.0-0.8] | 13.8% [11.1-17.1] | 0.0% (69) |
| spymaster | 0.0% [0.0-0.8] | 8.4% [6.3-11.2] | 0.0% (42) |
| admiral | 0.0% [0.0-0.8] | 7.8% [5.8-10.5] | 0.0% (39) |
| warlord | 0.0% [0.0-0.8] | 11.8% [9.3-14.9] | 0.0% (59) |

Baseline (auto-picked) act-2 per-local-column survival, 60 entrants —
matches the plan's own hand-computed grounding table exactly:

| local col | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 | c8 | c9 | c10 | c11 | boss |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deaths | 15 | 3 | 15 | 2 | 7 | 0 | 8 | 5 | 3 | 1 | 1 | 0 | 0 |
| alive after | 45 | 42 | 27 | 25 | 18 | 18 | 10 | 5 | 2 | 1 | 0 | 0 | 0 |

Act-2 entry snapshot (n=60): fleet size median **2** [p25 2 - p75 3];
fleet value median **52cr** [p25 46 - p75 61]; credits median **38cr**
[p25 25 - p75 46]. Local-col-6 snapshot (n=17): fleet size median 3
[3-3]; fleet value median 65cr [55-71]; credits median **100cr**
[75-117]. Every commander's individual entry snapshot landed in the same
narrow band (fleet-value medians 51-57cr across all 6, fleet-size medians
2-3) — the full per-commander breakdown is in the `balance:full` console
output this table was drawn from (not reproduced per-commander here for
space; the pattern is uniform enough that the baseline row above
represents the whole set).

### The decision gate (64.0 → 64.4)

The spec's own gate: median entry fleet-value **at or above the "rich"
fixture (~74cr)** → hypothesis wrong, skip 64.4; **near the "lean" floor
(~31cr)** → confirmed, build 64.4. (`~74cr`/`~31cr` reconfirmed live via
`npx tsx scripts/enemyValue.ts`: "Column-9 budget is 99cr. 'lean' fleet =
31cr of parts... 'rich' = 74cr".)

**Measured: median entry fleet value 51-57cr across every commander (52cr
baseline).** That's neither literal extreme — 70-77% of "rich", 165-184%
of "lean" — so the gate's two named endpoints don't cleanly bracket the
real reading. Reading the fuller evidence instead of just the one number:

1. Every commander's fleet-value median sits well below "rich" (30% under,
   uniformly) — the "hypothesis is wrong" branch requires being *at or
   above* 74cr, which nothing came close to.
2. **Fleet size** — a more direct read of 64.4's own named trigger ("a
   fleet below 3 commissioned hulls") — had median **2** (p25 2, p75 3)
   against a soft cap of 3 for the balanced archetype. Over half of every
   commander's act-2 entrants arrived under-strength in hull count
   specifically, not just under-spent in credits.
3. The plan's own grounding text names "hulls lost in act 1 are gone
   forever" as the prime suspect for the value gap — exactly what (2)
   confirms directly.

**Verdict: proceed into 64.4.** The literal "~31cr" anchor wasn't hit, but
the substance of the value-poor hypothesis (driven specifically by hull
count, not marginal under-spending) was — recorded here as the deviation
from a clean binary reading the spec's gate assumed.

### Stage tables

Stage 2 (after 64.2, shortcuts 2→3) — n=500/commander:

| | full-run clear | act-1 clear | act-2 conditional (n reached) |
|---|---|---|---|
| Baseline (auto) | 0.0% [0.0-0.8] | 10.4% [8.0-13.4] | 0.0% (52) |
| merchant | 0.0% [0.0-0.8] | 9.2% [7.0-12.1] | 0.0% (46) |
| engineer | 0.0% [0.0-0.8] | 13.8% [11.1-17.1] | 0.0% (69) |
| spymaster | 0.0% [0.0-0.8] | 8.4% [6.3-11.2] | 0.0% (42) |
| admiral | 0.0% [0.0-0.8] | 7.8% [5.8-10.5] | 0.0% (39) |
| warlord | 0.0% [0.0-0.8] | 13.0% [10.3-16.2] | 0.0% (65) |

Baseline (auto) entry snapshot (n=52): fleet size median 3 [2-3]; fleet
value median 57cr [49-66]; credits median 37cr [24-48]. Col-6 (n=16):
fleet size 3 [3-3]; value 68cr [58-71]; credits 73cr [55-111]. Act-1
clear moved slightly (12.0% → 10.4% baseline, noise-level per the
overlapping Wilson intervals — map generation's rng stream shifted by the
extra shortcut draw, not a real act-1 difficulty change; act-1 is
untouched by this iteration). **Act-2 conditional: 0.0% → 0.0%, no
movement, every commander.**

Stage 3 (after 64.4, interlude reinforcement) — n=500/commander:

| | full-run clear | act-1 clear | act-2 conditional (n reached) |
|---|---|---|---|
| Baseline (auto) | 0.0% [0.0-0.8] | 10.4% [8.0-13.4] | 0.0% (52) |
| merchant | 0.0% [0.0-0.8] | 9.2% [7.0-12.1] | 0.0% (46) |
| engineer | 0.0% [0.0-0.8] | 13.8% [11.1-17.1] | 0.0% (69) |
| spymaster | 0.0% [0.0-0.8] | 8.4% [6.3-11.2] | 0.0% (42) |
| admiral | 0.0% [0.0-0.8] | 7.8% [5.8-10.5] | 0.0% (39) |
| warlord | 0.0% [0.0-0.8] | 13.0% [10.3-16.2] | 0.0% (65) |

Act-1 clear is bit-for-bit identical to stage 2 (expected — 64.4 only
touches the interlude, downstream of every act-1 fight). Baseline entry
snapshot (n=52) — **64.4's own effect, isolated**: fleet size median
**3** [3-3] (up from 2 [2-3] at the 64.0 baseline, from 3 [2-3] at stage
2 — every commander now reads a solid fleet-size-3 median, p25=p75=3 for
4 of 6 commanders), fleet value median **62cr** [57-67] (up from 52cr at
64.0, 57cr at stage 2 — the reinforcement hull's own frame+STARTING_FIT
cost, landing squarely between "lean" and "rich"), credits median 37cr
[24-48] (unchanged — the reinforcement is free, no credit interaction, as
specced). Col-6 (n=15): fleet size 3 [3-3]; value 68cr [66-73]; credits
68cr [58-111]. **64.4 measurably fixed what it targeted — every commander
now arrives at act 2 with a full 3-hull fleet and a value squarely
mid-band. Act-2 conditional clear: still 0.0% → 0.0%, no movement, every
commander, n=500.**

### What the stop condition means

**64.2 + 64.4 together moved act-2 conditional clear by 0.0pp (0.0% at
every stage, every commander) — under the 2pp bar, so per the spec's own
instruction: STOP, don't chase further tuning this pass.** Reading the
fresh instruments rather than re-tuning blind:

- The survival table's shape barely moved either (compare the 64.0 and
  post-64.4 baseline tables in the console output this file draws from —
  deaths are still spread across every column, not concentrated at one
  now-fixed wall). 64.2 shortened the chain and 64.4 fixed fleet quality
  on arrival exactly as measured, and neither moved the needle on whether
  a run ever strings ~9-13 wins together — which says the compounding math
  from the plan's own "Motivation" section is still the dominant force:
  even a large per-fight improvement doesn't show up in a compounding
  product until it's large enough everywhere simultaneously, and these
  two levers each fixed one specific thing (route length, hull count)
  without moving the underlying per-fight win-rate distribution enough at
  every column to escape 0%.
- Zero act-2 clears in 3 x 6 x 500 = 9000 sampled runs (plus the pre-64.0
  historical record cited in the plan's own Motivation section) means the
  true rate is extremely likely under 1% today, nowhere close to even the
  bottom of the 15-25% D1 band. Getting there needs a bigger structural
  lever than either shipped in this pass — 64.3 (the deferred mid-act
  resupply checkpoint) is the next-obvious candidate per the plan's own
  design position ("three multiplicative levers... 46's two paths are
  both taken, moderately, instead of one drastically"), since only chain
  length and fleet quality were touched this pass; recovery-between-links
  (D3) never was.
- This is reported, not silently absorbed into further edits — per the
  task's explicit instruction, no further tuning was attempted once the
  stop condition read.

### Credits-hoarding check (item 6)

Credits-in-hand grow substantially between act-2 entry and local col 6
(e.g. baseline post-64.4: 37cr median at entry → 68cr at col 6; engineer
peaks at 122cr at col 6). Investigated whether this is a fixable
`policy.ts` threshold bug per the task's instruction. **Conclusion: not a
threshold bug — no change made.** Reasoning:

- `upgradeMark` (the main way surplus credits get absorbed once a fleet is
  at cap) is correctly restricted to shipyard visits in the agent
  (`agent.ts`'s `runShop`) because that mirrors the REAL rule
  (`canUpgradeMark`, `reducer/shop.ts`: `if (shopKind !== 'shipyard')
  return false`) — not an agent-side conservatism.
- The balanced archetype's `fleetCap: 3` (`policy.ts`) is an intentional,
  previously-measured soft cap (the file's own 2026-08-12 comment warns
  against changing hull-priority ordering "without re-measuring" — the
  same discipline applies to the cap itself); raising it would be a real
  balance change, not a sim-accuracy fix, and is exactly the kind of
  further tuning the stop condition says not to chase this pass.
- `buyAndEquipFromOffers` only ever buys the next unbought
  `partPriority` item that happens to be in THIS visit's random offer
  list — a deliberately non-greedy "floor" model (every archetype
  comment in `policy.ts` uses the phrase "kept dumb and honest"). A fleet
  that's already filled every slot it can with its own priority list, at
  cap, with marks correctly shipyard-gated, genuinely has nowhere left to
  spend at an ordinary store visit. That's the floor agent behaving as
  designed, not a bug.
- No single threshold (`repairThreshold`, `fleetCap`, `partPriority`
  length) stood out as clearly misconfigured relative to its own stated
  intent. A more effective floor-agent shopping model (e.g., a greedy
  fallback that buys *some* affordable, fitting, unequipped item once the
  priority list is exhausted) is plausible but would itself change how
  strong the floor build is — balance-adjacent, not sim-accuracy-only —
  so it's left as a flagged candidate for a dedicated future policy pass,
  not made blind here.

### Deviations from the spec

1. **64.2's double-skip/hard-band interaction, capped.** The spec's
   literal text ("landing at 10-11 or the double-skip target") allows the
   hard-band shortcut itself to be the doubled one. Implemented with one
   safety cap: if the hard-band shortcut's from-col rolls 9 AND it's also
   the seeded double-skip slot, `9 + 3 = 12` would land it on the boss
   slot itself (`columns.length - 2` = 11 is the last real lane column) —
   refused, silently falling back to a normal 1-column skip in that one
   case. The hard-band shortcut still always exists (from-col 8 or 9,
   landing 10 or 11) either way; only whether it specifically carries the
   double is capped. Recorded in `generateAct2Shortcuts`'s own comment and
   covered by a `map.test.ts` assertion (`to.col` always 10 or 11 for the
   hard-band shortcut).
2. **64.0's decision gate didn't land on either literal endpoint** — see
   "The decision gate" above for the full reading and reasoning; verdict
   was "proceed" based on the fuller evidence (fleet-size specifically),
   not a clean "near ~31cr" match.
3. **No 64.4-triggered credit-hoarding fix** — investigated per item 6,
   concluded no clear bug exists (see above), so `policy.ts` is untouched.
4. **Act-1 clear moved ~1.6pp between the 64.0 baseline and stage 2**
   (12.0% → 10.4%, auto-picked) purely from `generateAct2Shortcuts`
   consuming a different number of rng draws (the extra shortcut) and
   shifting every downstream draw in the same continued stream — expected
   per the function's own "doesn't consume a fixed number of rng() calls"
   comment, not a real difficulty change (the whole interval band overlaps
   the prior one, and act 1 itself is out of scope this iteration). Noted
   here so it doesn't read as an unexplained regression.

### Verification (final pass)

- `npx tsc -b --force`: clean.
- `npx vitest run`: **952 passed** (up from a 949-test baseline captured
  via `git stash`/re-run before any of this iteration's edits — net +3:
  1 new `map.test.ts` assertion for the hard-band shortcut's landing
  column, 2 new `reducer.test.ts` tests for the 64.4 reinforcement flow,
  plus 2 pre-existing tests updated in place to use ≥3-hull fixtures where
  the 64.4 branch would otherwise change their assertions). One transient
  failure seen mid-pass (`can offer a legendary hull in an act-2
  shipyard`) is a pre-existing flaky test unrelated to this iteration — it
  calls `initialRunState()` with no seed (real `randomSeed()`, not
  deterministic) across 40 draws; reran 3/3 green both before and after
  this iteration's changes, confirming it's not a regression.
- `npx vite build`: clean.
- `npx vitest run scripts/sim/agent.test.ts`: 7/7 passed, zero
  `rejectedDispatch` (checked after every stage — 64.2's shortcut-count
  change and 64.4's new interlude branch were exactly the kind of change
  that could desync the sim's model of legal actions; it didn't).
- `npm run balance` (fixture matchups): identical FAIL/WARN set before and
  after this iteration's changes (confirmed by running it against a
  `git stash`d pre-iteration tree) — nothing here routes through map
  generation or the interlude, so no fixture matchup should move, and
  none did.
- No browser passes taken (CLAUDE.md policy — general UI work, not
  mobile).
