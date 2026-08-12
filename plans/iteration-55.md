# Iteration 55 — Flatten the difficulty curve against the wealth curve (specced 2026-08-08)

> **Status: specced, not implemented.** Implementer: record deviations and
> verification results here, per the established style.
>
> **Depends on [iteration 52](plans/iteration-52.md).** 52 changes the
> shop draw, adds the hull refit and further credit sinks — all of which
> move the player's real spending power. Enemy scaling cannot be tuned
> against an economy that is about to shift underneath it, so this
> iteration baselines against 52's post-change measurement, not today's.

## Motivation (user question, 2026-08-08)

> *"i also want to make sure the power level of enemies scale
> accordingly. do we currently have it scaling roughly alongside the $
> value of the equipment/ship value?"*

Measured answer: **no — it inverts.** Enemy value is nearly flat within
an act while player wealth grows roughly five-fold across it.

## The finding

`scripts/enemyValue.ts` prices an enemy composition in credits using the
player's own shop as the yardstick, against an optimistic
"won-everything, spent-nothing" budget. Its three documented staleness
bugs (47.7.3) were fixed 2026-08-08 before taking these numbers.

| Act 1 | c1 | c5 | c9 |
|---|---|---|---|
| Player budget (ceiling) | ~21cr | ~45cr | ~98cr |
| Worst combat node | 45cr | 52cr | 51cr |
| **Enemy share of budget** | **217%** | **115%** | **52%** |

| Act 2 | c0 | c5 | c11 |
|---|---|---|---|
| **Enemy share of budget** | **54%** | **30%** | **29%** |

Act-1 enemy value rises 45 → 52cr (+16%) across nine columns while the
budget rises 21 → 98cr (+367%). The only column-linked scaling in the
game is `veterancyBonus` — **+1 HP at c5–7, +2 at c8–9** — which is a
rounding error against a 5× wealth curve. Enemy *pools* change by band
(`poolBand`), but that is a step function, not a curve, and the steps
are small relative to the same growth.

**Method caveat, load-bearing**: the value model prices HP and dice
linearly, so multi-hull formations look expensive but fold fast — the
balance table has a fresh fleet beating c1's "217% of budget" Missile
swarm 88% of the time. Do **not** treat the absolute percentages as
truth. The robust signal is the *slope*: whatever the correct starting
level, the ratio falls monotonically through every act.

### This explains the death data, exactly

Iteration 51's per-commander death columns put **~half of all act-1
deaths at c5–c7** and **~40–50% of act-2 entrants dying at global c11**
(= act-2 column 0). Both are the *early* portion of an act — precisely
where this ratio is worst. Players die early when they are poor, then
coast late when they are rich, which is also the reported *"too much
money and not enough buying options."* One curve, three symptoms.

## The reframe: this is not "make enemies harder"

The instinct behind the user's question is that enemies should scale
with player power. But the corrective is **not** a global buff — act-1
clear is already 7–12% against a 20–40% target band, and the deaths are
concentrated exactly where the enemy/budget ratio is *highest*.

The goal is to **flatten the curve**: slightly easier where players
actually die (early act), meaningfully harder where they are bored and
rich (late act). Done right this should *raise* clear rates while
removing the late-run surplus — the two goals point the same way, which
is rare and worth exploiting.

Any milestone below that makes early fights harder is going the wrong
direction and should be reconsidered.

## 55.1 Pick the target curve first, then tune to it

Before changing a single stat, decide and write down the intended
enemy-share-of-budget curve — otherwise this is eyeball tuning again.
Proposed shape, to be confirmed by the user:

- Roughly **flat within each act** rather than falling, at a level taken
  from wherever today's curve crosses a *survivable* clear rate rather
  than from an invented number.
- The concrete anchor available: c7–c8 in act 1 currently sits at
  61–77% of budget and is not where players die. Holding ~65–75%
  across the whole act is therefore a defensible first target, meaning
  **early columns come DOWN** substantially and late columns come **up**
  modestly.

Add the target curve to `enemyValue.ts`'s report output as a column
(target vs actual vs delta) so the tuning loop is a single command and
subsequent iterations inherit the instrument.

## 55.2 Make column scaling continuous

`veterancyBonus(col)`'s three steps (0 / +1 / +2 HP) are the only
per-column dial and they only touch HP, so a late enemy is a slightly
tougher version of an early one rather than a genuinely bigger threat.

Replace with a continuous scaler that can reach offense as well as
durability. Options, in preference order:

1. **A per-column value multiplier** applied through the existing
   `bumpGroupHp`-style helpers — derive the factor from the target
   curve in 55.1 and the column's budget, so scaling is defined by the
   thing it is supposed to track instead of a hand-tuned table.
2. A finer HP ladder (e.g. +1 per two columns) plus a separate
   late-column offense bump. Simpler, less principled.

Whichever is chosen, keep it a **pure function of (act, column)** — the
determinism rules (iteration 9) mean it must not read live fleet state,
or a reload could change a fight. Scaling to the player's *actual*
fleet value is explicitly out of scope for that reason; scaling to the
*expected* budget curve at that column is the deterministic equivalent.

## 55.3 Smooth the act-2 entry wall (highest single-leverage item)

Act-1 c9's worst node is 51cr; act-2 c0's is 73cr — a **43% jump in one
step** (88cr for its elite), landing at the same moment as a fresh
escalation pair and, if drafted, a counter-protocol. It is the single
largest death cluster in the game and the reason act-2 conditional clear
is 0%.

Levers (pick with measurement, do not stack blindly):

- Give act 2's easy band a genuinely easier first rung — currently
  `EASY_POOL_ACT2`'s Raider wing IS the c0 worst case.
- Delay act 2's first escalation landing beyond column 0.
- Ramp the counter-protocol in rather than applying it from the first
  act-2 node.

Note iteration 51's finding that the Merchant is the outlier here (c11
deaths = 3, versus 26–32 for everyone else) purely because his
shop-seeking routing defers his first act-2 *fight*. That is evidence
the wall is about the first fight's difficulty, not about arriving
under-equipped — a fleet that gets one shop first survives it.

## 55.4 Measurement

- `npx tsx scripts/enemyValue.ts` — the target-vs-actual table from
  55.1, before and after. This is the tuning instrument.
- `npm run balance:full` — per-commander clear rates and, critically,
  **the death-column histogram**: success looks like the c5–c7 and c11
  spikes flattening, not just the headline percentage moving. Baseline
  is iteration 52's post-change run.
- `npm run balance` — the matchup table will move (enemy stats change).
  Record before/after per matchup; the documented KNOWN-FAIL/KNOWN-GAP
  lines are expected to move too, and several may resolve.
- Standard bar: `npx tsc -b --force`, `npx vitest run`, `npx vite
  build`. No browser passes.

**Prediction to test**: act-1 clear rises toward the 20–40% band and
act-2 conditional becomes non-zero for the first time. If act-1 clear
falls, the curve was flattened in the wrong direction — early fights got
harder — and that is a stop-and-reconsider, not a re-tune.

## Out of scope

- The final boss: across 3,000 simulated runs no run has ever reached
  global column 23, so the boss has never once been the thing that
  killed anybody. Tuning it is measuring noise until the gauntlet before
  it is survivable.
- Scaling to the player's live fleet value (breaks determinism — see
  55.2).
