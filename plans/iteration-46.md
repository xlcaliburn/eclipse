# Iteration 46 — The 50/50 tuning pass (specced 2026-08-08)

> **Status: specced, not implemented.**
> Requires iteration 45's engine (`npm run balance:full`, the headless
> agent, `scripts/sim/`). This is a MEASURED tuning pass: every lever
> below gets an isolation sweep (iteration 44.1's discipline) before it
> ships, and the numbers land in this file's status notes. Game-data and
> reducer edits only — no combat-engine mechanics changes except where a
> decision point below explicitly says so.

User direction: "time to tackle the balancing. let's configure it so
that act 1 should end at a 50% win rate, and act 2 should be 50% as
well. what areas need the most tuning."

## The targets

- **Act-1 clear: 50%** (agent, balanced floor policy, n=500 —
  currently 5.6–12.6% depending on commander).
- **Act-2 conditional clear (given act 1 cleared): 50%** (currently
  literally 0% — no run in ~1,500+ act-2 samples has ever won).
- Implied **full-run clear ≈ 25%**.
- Measurement instrument: `npm run balance:full`. The floor policy is
  deliberately "reasonable, not optimal," so a skilled human will land
  ABOVE these numbers — 50% for the floor means the game reads as
  beatable-but-demanding for a real player. (Decision point 1 confirms
  this interpretation.)

## What the ledger probe found (2026-08-08, pre-implementation)

A rough cut of the 45.4 difficulty ledger (600 sims/cell, balanced
budget fleet at ~55% of banked-optimal credits per column, veterancy +
representative escalations applied; act 2 adds the silver counter):

**Act 1 — the curve is fine except two specific cliffs:**

| Col | Budget | Pool win rates | Elite |
|---|---|---|---|
| c1 | 4cr | 95–100% everywhere | 55% |
| c3 | 13cr | 100% everywhere | 87% |
| c5 | 25cr | Shield cruiser 95, Interceptor swarm 97, **Sniper pair 21** | **2%** |
| c6 | 31cr | 99, 100, **Sniper pair 44** | **10%** |
| c7 | 39cr | 100, 100, Sniper pair 89 | 65% |
| c8 | 46cr | Plasma tank 83, Ancient guardian 83, Escorted sniper 59 | 70% |
| c9 | 54cr | 97, 98, 81 | 93% |
| c10 boss | 63cr | GCDS 87, Hive Mother 95, Dreadnought 92 | — |

Two readings: (1) **Sniper pair at c5–6 is the act-1 wall** — a 1-in-3
mid-pool draw at 21–44% while its pool-mates are at 95%+, and the mid
elite (also sniper-based) at 2–10%. Snipers kept greedy lowest-HP
targeting AND computer 3 (+1 more from a firecontrol escalation =
hitting on 2s against a low-piloting midgame fleet). (2) **The bosses
are not the problem** — a HEALTHY 63cr fleet beats all three 87–95%,
yet real runs die at c10 at scale (48–105 deaths/500). The gap between
those two facts is **attrition**: real fleets arrive at the boss
damaged and poorer than the ledger's healthy fixture. Deaths at c5–c7
in the agent sweep line up with Sniper-pair draws + carried damage
compounding.

**Act 2 — three separate problems, one of them fatal:**

| Col | Budget | Pool win rates (full stack: veterancy + 4 escalations + silver counter) |
|---|---|---|
| c0–3 | 73–104cr | **Raider wing 52**, Torpedo boats 100, **Lance frigate 58** |
| c5–7 | 128cr+ | Rift cult 71, **Flak fortress 38**, Antimatter battery 73, Carrier group 83 |
| c8–11 | 182cr+ | **Guardian pair 0, Warden 0, Command wing 0, Swarm armada 5** |

- **The hard pool (c8–11) is arithmetically closed** — 0–5% against a
  fleet at its build ceiling. Even a perfect act-2 entry dies here; this
  alone guarantees the 0% conditional. These four enemies are
  iteration-8/9 designs never re-measured under veterancy + 4
  escalations + a counter-protocol.
- **The opening (c0–3) is a coin flip on 2 of 3 draws** (52/58%) for a
  fleet that just scraped through act 1 — matches the c11 death spike in
  the agent data. Isolation: those same enemies PLAIN are 94–97%;
  act-1's two escalations carrying across the act boundary alone cost
  ~28–30pp (69/68%); act-2's own escalations + the counter stack the
  rest. **The cross-act stack, not the enemies, is most of the opening
  problem.**
- **The final trio is INVERTED**: Titan/Empress/Citadel sit at 65–73%
  for the endgame fixture — easier than their own approach corridor.
  Fixing c8–11 without touching the trio would make the last fight the
  easiest thing in act 2.

**One more regression to fold in**: the random-targeting change (the
2026-08-08 polish batch) silently rewrote tuning assumptions — the
balance.ts "Empress tempo-cover" check now FAILS (the interceptor no
longer measurably helps; with spray targeting the fragile tempo escort
gets shot at random instead of being safely ignorable), and every
"greedy targeting" assumption in enemy design notes is stale except the
three sniper entries that opted out.

**Instrument caveat, recorded honestly:** `buildFleet('balanced')`
saturates around ~75cr (fleet + priority list full) — the identical
win rates across act-2 budget rows above are that ceiling, not a probe
bug. Real late fleets keep spending via Foundry fusions/upgrades, so
the act-2 ledger slightly UNDERSTATES a real fleet's ceiling — but the
agent (which does buy upgrades) still measured 0% conditional, so the
conclusions stand. 46.1 fixes the fixture ceiling anyway.

## The plan, ranked by measured impact

### 46.1 Instruments first (small, do not skip)

- **Commit the difficulty ledger** as `scripts/ledger.ts` (the 45.4
  deferral): per act × column × pool enemy (+ elite + boss), budget
  fleet vs full scaling stack, outlier flags (>15pp below column pool
  median). Add `--sweep` support for printing the same grid under a
  hypothesis (e.g. an escalation-rule change) so 46.2/46.3's isolation
  sweeps are one-liners.
- **Fix the fixture ceiling**: extend `buildFleet` to spend surplus on
  Foundry-style fusions (flat stat adds) past the parts ceiling, so
  late-game cells measure a real late-game fleet.
- **Fleet-at-boundary snapshot**: `AgentRunOutcome` gains
  `atAct2Entry?: { credits, partsValue, totalHp, damage }` so the
  attrition hypothesis (fleets reach the boss/act-2 poor and damaged)
  gets numbers, not vibes.

### 46.2 Act 1 → 50% (current: ~6–13%)

In lever order, isolation-swept one at a time via the ledger + a
500-seed `balance:full` after each:

1. **Sniper pair + the mid elite** (the c5–6 cliff). Options, pick by
   sweep: drop the pair's computer 3 → 2 (the hit-math cliff: comp 3 +
   firecontrol = hitting on 2s); or stagger the pair to arrive at c7+
   only (pool re-banding); or cut it back to a solo sniper at mid. The
   elite variant follows whatever the base does.
2. **Attrition softening** — the reason real runs underperform the
   healthy-fleet ledger everywhere, and the main boss-death driver.
   Preferred lever (cheapest, most legible): **+1 free repair to every
   surviving ship after every WON fight** (the old POST_WIN_REPAIR
   experiment, now shipped as a rule — reducer CONTINUE case). Sweep
   at +1 and +2. Alternative if it overshoots: cheaper BUY_REPAIR
   (2 → 1cr/HP).
3. **Escorted sniper (c8, 59%)** — mild outlier; likely fixed by
   lever 2 alone. Re-measure before touching.
4. **Deliberately NOT touched**: c1–c4 (easy is supposed to be easy),
   Shield cruiser / Interceptor swarm / Plasma tank / Ancient guardian
   (all in-band), boss stats (87–95% healthy-fleet is right for a
   50%-clear curve once attrition is fixed — re-measure after levers
   1–2 and only then consider).

### 46.3 Act 2 conditional → 50% (current: 0%)

1. **The cross-act scaling stack** — the big structural lever.
   Measured: act-1 escalations alone cost ~30pp at act-2 entry, before
   act-2's own two escalations and the counter stack on top. Options,
   sweep each: (a) act-1 escalations retire at the act boundary
   (reverses iteration 8.4's "permanent once landed" — decision point
   2); (b) keep 8.4 but delay act-2's own escalations to land after
   columns 6/9 instead of 4/7; (c) cap the total live-modifier count
   any single enemy carries in act 2 (e.g. max 3 of
   {escalations, counter}). Recommendation: (a) — cleanest to explain
   ("a new sector, a new enemy doctrine"), biggest measured effect,
   and the counter-protocol already gives act 2 its own signature
   scaling identity.
2. **The hard pool (c8–11), all four enemies** — re-tune from 0–5% to
   a 35–60% band against the (46.1-fixed) late fixture, using the
   iteration-26/31 method: shield first (the hit-threshold lever),
   then computer, then dice; one stat at a time per enemy. Warden
   (comp 3 / shield 3 / hp 10) and Guardian pair (2× comp 2 shield 2)
   are the headline offenders.
3. **Opening outliers** — Raider wing (3 ships × 2 dice × 2 dmg at
   init 3) and Lance frigate to ~75–85% at entry; largely fixed by
   lever 1, re-measure before stat edits. Flak fortress (38% at mid)
   likewise.
4. **The final trio, LAST** — after 1–3 land, re-measure. The trio
   must end HARDER than its approach (target ≈ 50% against the
   then-current entry population, band 40–60%); with weaker average
   fleets now reaching them, observed rates drop naturally — only buff
   stats if they still sit above the band after the corridor is fixed.

### 46.4 Re-anchor every gate to the 50/50 world

- `balance.ts` sanity bands re-derived: the failing GCDS/Hive-Mother/
  col-3-elite checks get bands consistent with the new curve (or their
  fixtures replaced with `buildFleet` outputs); the Empress
  tempo-cover check re-designed for random targeting (compare
  vs a no-escort fleet of equal cost, or retire it if tempo-cover is
  no longer a designed counter — decision point 3).
- `scripts/sim/baseline.json` updated to the achieved rates (real
  numbers, reviewed in diff); the regression gate becomes live for the
  first time.
- `runSim.ts` gains WARN-level band checks: act-1 clear 40–60%,
  act-2 conditional 40–60%, full-run 15–35%.
- PLAN.md standing notes + iteration-44/45 cross-references updated.

## Decision points (defaults chosen — flag if wrong)

1. **50% is measured with the balanced floor agent.** Skilled humans
   will clear more often. If the intent was "a skilled human clears
   50%," the floor targets should be ~30/30 instead — say so.
2. **Act-1 escalations retiring at the act boundary** (46.3 lever 1a)
   reverses iteration 8.4's explicit rule. It's the single biggest
   measured contributor to the act-2 wall and the recommendation, but
   it's a design reversal, not a number tweak — confirm.
3. **Empress tempo-cover**: with random targeting, the "one fast escort
   denies her Outspeed" counter no longer measurably works in the old
   fixture. Default: redesign the check; alternative: give the Empress
   `targetsLowestHp: true` (she's a boss — deliberate greedy targeting
   fits "the swarm coordinates") which restores the designed
   counterplay. The alternative is one line and thematically clean —
   flagged as genuinely 50/50.
4. Stat edits happen in `enemies.ts` data + reducer knobs only; no
   combat-engine mechanics changes anywhere in this iteration.

## Verification bar

Per milestone: `tsc -b` clean, `vitest run` green (update seeded
expectations alongside stat changes, never delete), `vite build` clean,
`npm run balance` exit 0 (WARN/known-FAIL lines documented), and the
headline: `npm run balance:full` showing act-1 ≈ 50%, act-2
conditional ≈ 50% within the 40–60 bands. Every sweep's numbers
recorded in this file's status notes. No browser passes.

## Milestones

- **46.1** Ledger committed (+ sweep mode), buildFleet fusion ceiling
  fix, act-2-entry snapshot in AgentRunOutcome.
- **46.2** Act-1 levers (sniper cliff, attrition rule, re-measures) →
  act-1 clear 40–60%.
- **46.3** Act-2 levers (cross-act stack decision, hard-pool re-tune,
  opening outliers, trio re-measure) → conditional 40–60%.
- **46.4** Gates/bands/baseline re-anchored; all documented FAILs
  either fixed or re-justified against the new curve.
