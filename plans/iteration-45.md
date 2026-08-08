# Iteration 45 — The balancing engine rebuilt (specced 2026-08-08)

> **Status: specced, not implemented.**
> This is the "separate, bigger initiative" iteration 44 explicitly
> deferred: 44.4's gate re-calibration lands here (44.3's missing fixture
> is subsumed by 45.1's budget-derived fleets). Touches only `scripts/`
> plus, at most, small named-export additions in `src/game/` — zero
> game-behavior changes. Safe alongside feature threads unless one
> renames reducer actions mid-flight.

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

## Milestones

- **45.1** `scripts/sim/` library, CIs + WARN gates, budget-derived
  fixtures (44.3 subsumed), balance.ts/enemyValue.ts refactored,
  scrapbook pruned.
- **45.2** Headless agent over the real reducer; act-1 parity vs
  actRun recorded against the post-44 baseline; actRun deleted.
- **45.3** Act-2 policies + full-run/conditional reports;
  baseline.json + regression gate (44.4 landed); STOP for band
  confirmation.
- **45.4** Archetype matrix + difficulty ledger with outlier flags.
- **45.5** Gate re-armed on the milestone bar; PLAN.md standing notes
  + iteration-44 cross-reference updated.

Verification bar: `tsc -b` clean, `vitest run` green, `vite build`
clean, plus `npm run balance` exiting 0 (or with only documented
WARN/known-FAIL lines). No browser passes — scripts-only iteration.
