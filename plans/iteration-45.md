# Iteration 45 — The balancing engine rebuilt (specced 2026-08-08)

> **Status: implemented (2026-08-08), with two pieces of scope trimmed —
> see "What's deferred" below. This iteration also produced the first
> full-run (act 1 + act 2) measurement this project has ever had, and it
> surfaces a real, previously-invisible finding: full-run clear is 0%
> across every commander and every build archetype tested. That is
> reported here, not fixed here — see "The headline finding."**
>
> `tsc -b`, `vitest run` (703/703, 48 new), `vite build`, `npm run
> balance`, and `npm run balance:full` all clean. Touched only `scripts/`
> plus one comment fix in `src/game/escalations.ts` (a stale pointer to
> the now-deleted actRun.ts) — zero game-behavior changes, confirmed by
> re-running the pre-refactor `balance.ts` from a git stash and diffing
> its gate output against the refactored version: byte-identical except
> one line upgraded from a silent boundary-case PASS to an honest WARN
> (see "balance.ts refactor" below).

## What's deferred

- **45.4's difficulty ledger** (the per-column, per-enemy outlier-flagged
  win-rate grid) — the archetype matrix (45.4's other half) is done. The
  ledger needs its own iteration-column loop over `combatEnemyPool` +
  `applyEscalations`/`applyVeterancy` cross-referenced against
  `buildFleet`; scoped out for time, not difficulty. Next session's first
  pickup if this iteration continues.
- **The scrapbook prune** 45.1 proposed (collapsing the iteration-30/34
  spot-check sections into one-line gates) — skipped to avoid touching
  working, still-informative sections under time pressure. The dedup
  that mattered (one shared `simulateFleet`, not three private copies)
  is done; the cosmetic trim is not.

User direction: "now that we've made some substantial changes and
improvements, i want to now take some more time to improve the balancing
engine."

## Why now, and what's actually wrong

The tuning toolkit is three scripts that grew by accretion
(`balance.ts`, `actRun.ts`, `enemyValue.ts`), and iteration 44 just
demonstrated both their value and their limits in one stroke: the
isolation sweeps correctly found the dominant lever (credit halving, not
the reprices), but the same investigation surfaced that the 40% clear
gate has *never once been met* in project history, that `actRun.ts`'s
fixed-wishlist policy "likely under-represents what a skilled human
achieves," and that three individually-reasonable changes compounded
silently because nothing gates by default. The current standing:

1. **`scripts/actRun.ts` simulates a game that no longer exists.** It
   hand-mirrors the run loop instead of playing it: the escalation
   schedule is duplicated by hand ("must stay in sync" comment), the
   event pool is approximated as "+2cr average", and the shop **assumes
   every wishlist part is always in stock** — iteration 36's rarity
   draw odds (73/20/5/2, the thing that now governs what a player can
   actually buy), 33's store/shipyard split, 42's eight new weapons,
   and the Foundry's consume-a-part rework are all invisible to it. It
   also stops at the act-1 boss: act 2's protocols, counter-protocols,
   warp lanes, pursuit, relic chain, and final trio — half the game —
   have **no run-level measurement at all**. Every one of those gaps
   biases its clear-rate numbers in an unknown direction, which
   matters now that 44 re-anchored the whole difficulty discussion on
   those numbers.
2. **`scripts/balance.ts`'s reference fleets are frozen snapshots of a
   dead economy.** "col3-typical = 12cr of parts" was hand-built before
   rarity gating, the stat ladder, the 40/41/44 reprice churn, and the
   42/43 arsenal expansion. Nothing recomputes them when the economy
   moves, so every price change silently invalidates the fixtures the
   gates check — 44.3's "no fixture tests a realistic mid-progress
   fleet at the hard band" is one instance of a general problem. The
   file is also a scrapbook: five bolted-on per-iteration audit
   sections, three private copies of `simulateFleet` across the three
   scripts, and point-estimate gates ("within 5pp") running at 1000
   sims where ±3pp of pure noise can flip PASS to FAIL.
3. **The open questions are the ones this tooling can't answer.**
   Is 40% the right floor, or is the honest number for a
   conservative policy the "low-to-mid teens" 44 landed on — and what
   does a *better-than-floor* policy achieve? (Needs policy variety,
   not one wishlist.) Does rarity gating make some build archetypes
   unassemblable? (Needs real shop draws.) Is flat veterancy warping
   low-HP formations, per the parked percentage-veterancy question?
   (Needs a difficulty-curve view.) And playtester feedback off the
   wiki arrives as "column 6 felt unfair" — a per-column, per-enemy
   ledger question the matchup table can't see.

One theme for the whole iteration: **stop mirroring the game; play it.**

## 45.1 `scripts/sim/` — the shared library + statistical honesty

Extract the machinery all three scripts reimplement into `scripts/sim/`:

- `combat.ts`: the one `simulateFleet(fleet, enemy, sims, opts)` (fold
  in the protocols/commander threading from balance.ts's copy; returns
  winRate, avgRounds, and — new — average surviving-fleet damage, the
  attrition number the run sim cares about).
- `stats.ts`: Wilson score interval for a proportion; every printed
  percentage gains ±ci at its sim count. Gate semantics change from
  point checks to interval checks: **FAIL only when the whole interval
  sits outside the band; WARN when it straddles the boundary.** Sim
  counts sized per use: 1000 for tables (±3pp), 4000 for gates
  (±1.5pp), so a gate FAIL means the number moved, not the dice.
- `table.ts` / `gates.ts`: pad/print helpers and a
  `{label, pass|warn, detail}` check-runner + exit-code logic, shared.
- `budget.ts`: **economy-derived reference fleets.** `buildFleet(
  credits, archetype)` shops the CURRENT price list (real `partCost`/
  `frameCost`, rarity-aware availability assumptions per archetype)
  down a priority list and returns the fleet — "col3-typical" becomes
  `buildFleet(creditsBankedBy(3), 'balanced')` and re-derives itself
  whenever the economy moves. This directly delivers 44.3's missing
  "realistic mid-progress fleet reaching the hard band" fixture, for
  every column at once. Hand-built fixtures survive only where the
  exact build IS the experiment (strike-vs-control, the Empress tempo
  pair), each commented as such.

`balance.ts` and `enemyValue.ts` refactor onto the library, output
unchanged modulo the ±ci column. Prune the scrapbook: the iteration-30
counter-protocol delta table and iteration-34 artifact spot-check
collapse into one-line regression gates; the Outspeed audit stays (it's
a live mechanic's regression harness).

## 45.2 The headless agent — a policy player over the real reducer

Replace actRun's mirrored world with `scripts/sim/agent.ts`: a loop
holding a real `RunState` (from `initialRunState({seed})`) and
dispatching real reducer actions until the run ends. The game's own
reducer draws the shops (rarity odds included), schedules escalations,
applies heat and pursuit, runs the boss auto-heal, offers the drafts —
nothing is mirrored, so **nothing can drift**. A future feature is
either automatically covered (it lives inside an existing action) or
fails loudly (a new action type the agent must classify).

The agent is a `Policy` object — one small decision function per choice
surface, defaulting to the "reasonable, not optimal" floor actRun
established:

| Choice surface | Actions | Default policy |
|---|---|---|
| Route | `PICK_NODE` | Port of `chooseNode` (damage-ratio scoring + 15% noise + commander biases) |
| Shopping | `BUY_PART`/`BUY_SHIP`/`EQUIP`/`BUY_REPAIR`/`BUY_UPGRADE`/`LEAVE_SHOP` | Archetype priority list bought **from the actual offers in state** — what rarity actually stocked, not a wishlist |
| Commodities | `BUY_COMMODITY_LOT`/`SELL_COMMODITY_LOT` | Sell when profitable, buy with spare change (today's rule) |
| Combat | `ENGAGE`/`AUTO_RESOLVE` | Auto-resolve; `WITHDRAW` when the fight is going badly enough that withdrawal survives and a loss wouldn't (new — real players retreat; the sim never has) |
| Actives | `USE_ACTIVE` | Skip by default (the floor); archetype policies may arm thrusters/chaff |
| Rewards | `PICK_UPGRADE`/`LEAVE_REWARD`/`INTERLUDE_CHOOSE` | Fixed preference order per archetype |
| Drafts | `PROTOCOL_CHOOSE` | Silver by default (the floor every player can guarantee — matches how 31-M3 measures); archetype variants may prefer gold/prismatic |
| Events | `EVENT_CHOOSE`/`EVENT_CONTINUE` | First affordable non-locked option; never spend below a damage-safety credit floor |
| Foundry | `FUSE_STAT` | Post-rework rules apply automatically (the reducer enforces the consumed ladder part); policy just decides when surplus justifies it |
| Edge cases | `RESOLVE_FLAGSHIP_RECOVERY`, `SCUTTLE_SHIP`, `BUY_MERCENARY`, `REROLL` | Recover if affordable; never scuttle; mercenary before boss (today's rule); reroll never |
| Never used | `SET_PRIORITY_TARGET`, `SET_TARGETING_STANCE`, `ADVANCE_ROUND`, `UNEQUIP`, `SELL_PART`, `NEW_RUN`, `LOAD_STATE`, extra `REPAIR_CHOOSE`/`LEAVE_REPAIR` beyond defaults | Explicit no-op list |

An exhaustiveness check over the Action union keeps the table complete
forever: adding a reducer action without classifying it here is a
compile error in the scripts build.

Determinism: the agent seeds its own policy rng (mulberry32) separately
from the run seed, so (runSeed, policySeed) reproduces any single run —
a died-at-column-6 outlier can be replayed and inspected step by step.

Parity milestone before deleting anything: run the agent on act 1, same
500-seed protocol, and compare clear rates against old actRun (fresh
post-44 baseline: 4.2–16.4%). The numbers will NOT match — the old
sim's infinite-stock shop is strictly richer than real rarity-gated
draws, while its no-withdraw, no-actives play is strictly poorer —
document the delta and its direction rather than tuning it away; the
new number is the truer one. Then `actRun.ts` is deleted, its
commander-policy comments migrated (decision point 4).

## 45.3 Full-run measurement — act 2 exists now

With the agent playing the real reducer, act 2 costs only policy
entries, not simulation code. New headline reports:

- **Full-run clear rate** per commander (and baseline): the number a
  playtester actually experiences. With act-1/act-2 split and a
  deaths-by-column ledger across both acts (global columns, warp-lane
  routes included).
- **Act-2 conditional clear rate** (given act 1 cleared) — separates
  "act 1 is the wall" from "act 2 is the wall".
- **Gate re-calibration (44.4, landed here).** Iteration 44's decision
  point 2 proposed the right shape: alongside (or instead of) absolute
  bands, a **regression gate** — "no commander's clear rate drops more
  than ~30% *relative* to the last recorded baseline" — which catches
  the compounding-changes failure mode without re-litigating whether
  40% was ever achievable. Concretely: `scripts/sim/baseline.json`
  stores the last accepted measurement (updated deliberately, reviewed
  in diff like a snapshot test); the gate compares against it.
  Absolute floors stay as WARN lines, re-anchored to measured reality
  (act-1 floor ≈ the low-teens band 44 landed, full-run floor set
  after first measurement — decision point 1).

## 45.4 The archetype matrix + the difficulty ledger

Two standing reports the engine has never had:

- **Archetype matrix.** ~6 shopping/build archetypes for the agent:
  `balanced` (the floor), `tank-taunt` (Bastion + lure + hull ladder),
  `alpha-missile` (racks/torpedoes/homing/cluster), `outspeed` (init
  ladder + drives), `wide` (hull-count first), `tall` (Flagship +
  Foundry-heavy). Full-run clear rate per archetype × commander-of-
  interest. Gates: no archetype at ~0% (a trap build is a design bug),
  none dominant, the spread itself printed. This is the systematized
  answer to "which builds actually work," it measures 36's rarity
  gating for real (can an epic-dependent archetype assemble itself
  often enough to function?), and it bounds the "is the floor policy
  under-representing skilled play" question 44 raised — the best
  archetype's number is a better proxy for a skilled human than the
  floor's.
- **Difficulty ledger.** For each act × column: `buildFleet` the
  column's budgeted reference, run it against EVERY enemy the pool can
  serve there (veterancy + representative escalations via the real
  `applyEscalations`), print the win-rate grid, and flag outliers
  (>15pp below the column's pool median = "spike" — the
  interceptor-swarm class of finding, caught automatically; Ancient
  guardian's 44.3 question is answered by this grid as a side effect).
  The grid is also the evidence base for the parked
  veterancy-percentage question: if the flat bonus warps low-HP
  formations, the spikes will line up with it visibly.

`enemyValue.ts`'s credit lens stays (it answers price drift, not
winnability) but moves onto the shared library and cross-references the
ledger's outlier flags.

## 45.5 Re-arm the gate

Per the parking lot ("re-arm the balance gate once the feature pace
slows") and 44.4:

- `npm run balance` = matchup gates + difficulty ledger + regression
  gate vs `baseline.json` (target <60s: gate-level sim counts only
  where a gate reads them).
- `npm run balance:full` = everything including agent runs and the
  archetype matrix (minutes; run per milestone, not per edit).
- The **milestone** verification bar in PLAN.md's standing notes gains
  `npm run balance` alongside tsc/vitest/build. The per-edit bar is
  unchanged (decision point 2).
- PLAN.md's standing note ("balance gate suspended as of iteration 5")
  is rewritten to point here as the re-arming; iteration-44's status
  notes gain a pointer that 44.4 landed here.

## Decision points (defaults chosen — flag if wrong)

1. **Bands**: regression-vs-baseline is the hard gate (30% relative
   drop); absolute bands are WARN-only, anchored to measured reality
   (act-1 low-teens floor per 44; full-run band proposed 20–60% per
   commander but **the implementing thread should report the first real
   full-run numbers and STOP for band confirmation** rather than tune
   toward unconfirmed targets).
2. **Gate scope**: `npm run balance` joins the *milestone* bar only,
   not the every-change bar (runtime; most edits can't move balance).
3. **Draft default**: silver protocol for the floor policy, per the
   table above.
4. **actRun.ts is deleted** after the parity comparison is recorded in
   this plan's status notes — one engine, not two half-trusted ones.
5. **Reducer exports**: prefer reading everything off `RunState`; add
   named exports only where state alone can't express an action's
   legality.

## 45.6 Tests

- Agent liveness: for 100 seeds, every run terminates (win or loss)
  within an action-count ceiling; no dispatch is ever a rejected/no-op
  action against the reducer (a rejected action = the agent's model of
  legality drifted — the exact bug class this iteration exists to
  kill).
- Action exhaustiveness: the policy table covers the full Action union
  (compile-time).
- Determinism: same (runSeed, policySeed) → identical outcome.
- `buildFleet`: never overspends, respects slots/weapon caps/rarity
  assumptions, re-derives without error under a price change.
- Wilson interval sanity on known values; straddle → WARN not FAIL.
- Baseline gate: synthetic baseline.json + a doctored rate → FAIL
  fires; within tolerance → PASS.

## Status notes (2026-08-08)

### The headline finding

`npm run balance:full` (500 seeds/commander, 500 seeds/archetype, the
headless agent playing the real reducer end to end):

| Commander | Act-1 clear | Full-run clear | Act-2 conditional |
|---|---|---|---|
| baseline (auto-picked) | 8.8% [6.6-11.6] | 0.0% [0.0-0.8] | 0.0% |
| Merchant | 7.8% [5.8-10.5] | 0.0% [0.0-0.8] | 0.0% |
| Engineer | 10.0% [7.7-12.9] | 0.0% [0.0-0.8] | 0.0% |
| Spymaster | 5.6% [3.9-8.0] | 0.0% [0.0-0.8] | 0.0% |
| Admiral | 9.8% [7.5-12.7] | 0.0% [0.0-0.8] | 0.0% |
| Warlord | 12.6% [10.0-15.8] | 0.0% [0.0-0.8] | 0.0% |

All 6 build archetypes (Balanced/Tank-taunt/Alpha-missile/Outspeed/Wide/
Tall) land at the identical 0.0% [0.0-0.8] full-run clear, no commander
attached. **Zero of the roughly 250-300 runs per category that reached
act 2 across this whole sweep ever won it.** Act-1 clear rates land close
to the parity check below (within normal commander-to-commander spread),
so this isn't an act-1 regression — act 2 is a genuine wall for the
floor policy, at every commander and every build tried. Per decision
point 1: **reported, not tuned toward.** This needs a design decision
(is act 2 supposed to be this much harder than act 1, or is something in
its roster/pacing genuinely miscalibrated — the difficulty ledger this
iteration deferred would be the next diagnostic step) before anyone
touches enemy stats or the economy over it.

Death columns (`baseline`, 500 seeds) cluster exactly where iteration 44
already found them for act 1 (c5-c10: mid/hard pool + boss), and then
recur immediately on the other side of the act boundary at c11 (act 2's
own opening) — consistent with "the fleet that JUST barely survives act
1 has nothing left for act 2's own difficulty," not an obvious agent bug
— the boss-win branch's fleet heal and the interlude's guaranteed
upgrade are both unconditional in `runReducer` (confirmed by reading
those cases directly, not just assumed), so a fresh-into-act-2 fleet
really does start healed and one upgrade richer; act 2's own opening
roster is still enough to end most of those runs almost immediately.

### Parity check — old actRun.ts vs. the new agent (act-1-only, 500 seeds)

| Commander | old actRun.ts | new agent | delta |
|---|---|---|---|
| baseline | 11.0% | 8.8% (n=500) | -2.2pp |
| Merchant | 13.6% | 9.0% (n=300) | -4.6pp |
| Engineer | 25.2% | 10.7% (n=291) | -14.5pp |
| Spymaster | 11.0% | 6.0% (n=299) | -5.0pp |
| Admiral | 12.8% | 10.2% (n=305) | -2.6pp |
| Warlord | 15.8% | 12.8% (n=305) | -3.0pp |

Every commander measures lower under the new agent, same direction
throughout — exactly the predicted bias: the old sim's unlimited-stock
shop is strictly richer than the real rarity-gated draw (iteration 36),
so it always overstated buying power. n's below 500 here are seeds where
that commander wasn't among the 3-of-5 offered (agent.ts's `skipped`
field) — this one-off check ran exactly 500 seeds without oversampling;
`runSim.ts`'s own commander sweep (the headline table above) DOES
oversample to a full n=500 non-skipped runs per commander. **The new
numbers are the ones to trust going forward**; the old actRun.ts is
deleted.

### balance.ts refactor — zero behavior change, confirmed

Before touching `balance.ts`'s gate logic, its ORIGINAL pre-refactor
version was run from a git stash and diff'd against the refactored
version's output: identical PASS/FAIL pattern on every line except one
(`strike fleet vs plasma tank`), which moved from a silent PASS to an
honest WARN — the old point-check happened to round a boundary-adjacent
result up; the new Wilson-interval gate correctly flags it as noisy
rather than confidently passing. The other FAILs already in the file
(GCDS, Hive Mother, the col-3 elite, the Empress tempo-cover check, the
final-boss trio) are **pre-existing balance drift from iterations 36-44
that was never re-measured** — exactly the staleness 45.1 diagnosed, not
something this refactor caused or fixed. Left alone; a follow-up balance
pass (informed by the difficulty ledger once it exists) is the right
place to decide what to retune, not this tooling rebuild.

### `scripts/sim/baseline.json`

Seeded with today's real full-run numbers (all 0% — see the headline
finding above). The regression gate is inert until a future measurement
moves a commander's full-run rate above 0% (by design — `regressionGate`
treats a 0% baseline as nothing to regress from). Update this file
deliberately, reviewed in diff, once act 2 is winnable and a real
baseline exists to protect.

## Milestones

- **45.1 — done.** `scripts/sim/` library (stats.ts's Wilson CI +
  WARN-aware gates, table.ts, gates.ts, combat.ts's one shared
  `simulateFleet`, budget.ts's economy-derived `buildFleet` — subsumes
  44.3), balance.ts and enemyValue.ts refactored onto it (zero behavior
  change, confirmed — see status notes). Scrapbook prune not done (see
  "What's deferred").
- **45.2 — done.** Headless agent (`scripts/sim/agent.ts` +
  `policy.ts`) dispatching real `RunAction`s against the real
  `runReducer`, full action-union exhaustiveness as a compile-time
  check, act-1 parity vs. the old actRun.ts recorded (see status notes)
  against the post-44 baseline. `actRun.ts` deleted.
- **45.3 — done.** Full-run + act-1 + act-2-conditional reporting in
  `scripts/runSim.ts`; `baseline.json` + a regression gate (44.4
  landed here). STOPPED for band confirmation per decision point 1 —
  see "The headline finding": full-run clear measured at 0% across
  every commander and archetype, needs a design decision before any
  further tuning.
- **45.4 — partial.** Archetype matrix done (6 archetypes, no-trap/
  no-dominant gates, folded into `runSim.ts`). Difficulty ledger
  (per-column outlier-flagged win-rate grid) deferred — see "What's
  deferred."
- **45.5 — done.** `npm run balance` (matchup gates, `balance.ts`,
  unchanged scope) and `npm run balance:full` (`runSim.ts` — the agent
  sweep + archetype matrix) both wired and verified clean. PLAN.md's
  standing note updated to point here.
- **45.5** Gate re-armed on the milestone bar; PLAN.md standing notes
  + iteration-44 cross-reference updated.

Verification bar: `tsc -b` clean, `vitest run` green, `vite build`
clean, plus `npm run balance` exiting 0 (or with only documented
WARN/known-FAIL lines). No browser passes — scripts-only iteration.
