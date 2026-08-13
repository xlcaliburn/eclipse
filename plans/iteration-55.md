# Iteration 55 — Flatten the difficulty curve against the wealth curve (specced 2026-08-08, rescoped 2026-08-12)

> **Status: specced (deep), not implemented.** Implementer: record
> deviations and verification results here, per the established style.
>
> **Sequencing (load-bearing): baseline AFTER iterations 56 and 62 land.**
> Both are in flight as of this rescope, and both move the numbers this
> iteration tunes against:
>
> - **56** (act-2 events + bonus berth) adds +1 hull exactly at the act-2
>   entry wall — a survivability buff at this iteration's biggest death
>   cluster.
> - **62** (fire-control convergence + CP regen) changes long-fight
>   outcomes globally — fights organically cap at ~13 rounds, which
>   shifts clear rates on its own, in either direction.
>
> Take a fresh `npm run balance:full` (n=500, per-commander act-1 clear +
> act-2 conditional + **death-column histograms**) and a fresh
> `npx tsx scripts/enemyValue.ts` snapshot after both are merged, record
> them at the bottom of this file, and tune against THOSE — not against
> any table in an earlier iteration's status notes. (The old dependency
> on 52 is satisfied — it landed 2026-08-12.)

## Motivation (user question, 2026-08-08; re-confirmed 2026-08-12)

> *"do we currently have it scaling roughly alongside the $ value of the
> equipment/ship value?"* … *"to clarify 55 — is the player getting too
> strong in act 2?"*

Measured answer: **no scaling — the ratio inverts, twice.** Enemy value
is nearly flat within each act while player wealth grows several-fold
across it. Re-measured 2026-08-12 on the post-52/57/58/59/61 economy —
the shape survived every change:

| Act 1 (worst combat node) | c1 | c5 | c9 |
|---|---|---|---|
| Enemy value | 45cr | 52cr | 51cr |
| Share of optimistic budget | **217%** | **115%** | **52%** |

| Act 2 (worst combat node) | c0 | c5 | c11 |
|---|---|---|---|
| Enemy value | 73cr | 76cr | 122cr |
| Share of optimistic budget | **54%** | **30%** | **29%** |

And the seam between them: act-1 c9's worst node is 51cr; act-2 c0's is
73cr — **+43% in one step**, onto a fleet still carrying act-1 damage.

**Method caveat, load-bearing**: `enemyValue.ts` prices HP and dice
linearly, so multi-hull formations look expensive but fold fast — the
balance table has a fresh fleet beating c1's "217%" Missile swarm 88% of
the time. Do NOT treat absolute percentages as truth. The robust signals
are **slopes and steps**: the ratio falls monotonically through every
act, and the deaths sit exactly on the steps (band entries, the act
seam). The instrument's own bottom-of-report simulation makes the same
point from the other side: a lean 31cr fleet beats an escalated c9 elite
13–18% of the time; a rich 74cr fleet beats it 97%. The wealth gap IS
the difficulty gap.

### This explains the death data, exactly

The per-commander death histograms put **~half of all act-1 deaths at
c5–c7** (the mid-band entry: pool step + veterancy step + first
escalation, all landing at c5) and **~40–50% of act-2 entrants dying at
global c11** (= act-2 c0, the seam). Players die early-in-act when they
are poor, then coast late when they are rich — which is also the
reported *"too much money and not enough buying options."* One curve,
three symptoms. So: not "the player is too strong in act 2" — the player
is too WEAK at each act's entrance and too strong at each act's exit,
relative to what's thrown at them.

Live corroboration (user playtest, 2026-08-12): a Warlord run reached a
shop **two columns before the act-1 boss carrying 55cr unspent** — right
where the model says the worst node has fallen to ~52–61% of budget.
That is the late-act surplus in the wild, on the commander whose tall
build has the least natural hull appetite (his sinks are parts and
shipyard marks, and a store visit offers only the former). Stage C below
is the half of this iteration that makes that 55cr feel necessary
instead of idle.

## The reframe: flatten, don't buff

Act-1 clear is already below its 20–40% target band, and the deaths
concentrate exactly where the enemy/budget ratio is HIGHEST. The
corrective is **flattening**: slightly easier where players actually die
(band entries, the act seam), meaningfully harder where they are rich
and bored (each act's back half). Done right this *raises* clear rates
while removing the late-run surplus. Any change below that makes a
band-entry column harder is going the wrong direction — stop and
reconsider.

## 55.0 Grounding: the scaling stack as it exists (code-verified 2026-08-12)

Everything applies at `PICK_NODE` (reducer.ts ~817–843), pure in
(act, col, schedule) — the determinism-compatible insertion point for
anything new is this exact stack:

```
withCounterProtocol( applyEscalations( applyVeterancy( raw, node.col ), globalCol, actScopedEscalations ), state )
```

- **`veterancyBonus(col)`** (enemies.ts): the ONLY per-column dial —
  +0 HP (c≤4), +1 (c5–7), +2 (c8–9). HP only, three steps, both acts.
- **`poolBand(col)`**: easy (c≤4) / mid (c5–7) / hard (c≥8). The pools
  step 45→52→51cr in act 1 and 73→76→122cr in act 2 — near-flat until
  act 2's hard band.
- **Escalations**: land after local cols 4/7 (act 1) and 4/7/9 (act 2).
  **Act-scoped since iteration 46** — `PICK_NODE` filters
  `e.act === state.act`, so act-1 escalations do NOT carry into act 2.
  The original 55.3's "fresh escalation pair lands at the seam" claim is
  STALE — at act-2 c0 there are zero live escalations. Do not re-fix it.
- **Counter-protocol**: applied to every act-2 enemy from c0 inclusive,
  boss included, IF a protocol was drafted.
- **`EASY_POOL_ACT2`** = Raider wing (3×{2hp, 2d×2dmg, init 3} — the
  priced-worst at 73cr and the act's stated "baseline damage check"),
  Torpedo boats (2 ships, missile alpha), Lance frigate (1×5hp,
  shield-pierce). The pool has a genuinely cheaper bottom, so a
  band-entry ramp has real material to work with.

So the act-2 c0 wall today = the 43% pool jump + the counter-protocol +
act-1 carried damage — nothing else. Iteration 51's Merchant finding
(his shop-first routing makes him nearly immune to c11 deaths: 3 vs
26–32 for everyone else) says the wall is about the FIRST FIGHT's
difficulty against a worn fleet, not chronic under-equipment.

## 55.1 The target curve — three measurable invariants

Written as gate-able invariants on `enemyValue.ts`'s worst-combat-node
share, not absolute percentages (per the method caveat):

- **T1 — no band-entry cliff**: entering a pool band / veterancy step /
  escalation landing must not raise the worst-node share above the
  previous column's by more than ~15%. (Today c5 jumps 134%→115% of a
  larger budget in raw value terms — the c5–c7 cluster.)
- **T2 — within-act slope**: the last lane column's worst-node share ≥
  **60%** of the act's first lane column's. (Today: act 1 sits at 24% —
  52/217; act 2 at 54% — 29/54. Both fail.)
- **T3 — the act seam**: act-2 c0's worst-node VALUE ≤ **1.15×** act-1
  c9's. (Today: 1.43× — 73/51.)

T2 is satisfied mostly by raising the back half (where the surplus is);
T1 and T3 mostly by shaving the entry spikes (where the deaths are). The
outcome checks are 55.4's: act-1 clear moves toward 20–40%, act-2
conditional becomes non-zero, and the c5–c7 / act-2-c0 histogram spikes
flatten. **Decision point 1 (user)**: confirm the 60% / 1.15× numbers or
adjust before tuning starts.

## 55.2 Mechanisms — three, independently measurable, staged in this order

### A. Act-seam trim (highest single leverage; attacks T3)

1. **Band-entry ramp for `EASY_POOL_ACT2`**: at act-2 local col ≤1,
   `combatEnemyPool` excludes the pool's hardest entry (Raider wing) —
   the first rung becomes Torpedo boats / Lance frigate. Pure function
   of (act, col); one `if` plus a filtered pool. Alternative if the
   remaining 2-entry pool feels too samey: a hand-authored
   "Raider patrol" understrength variant (2 raiders, not 3) that only
   appears at c0–1. Prefer the filter first — measure before authoring
   content.
2. **Counter-protocol ramp-in**: `withCounterProtocol` skips application
   at act-2 local col ≤1 (deterministic, data-only, engine untouched).
   Show it honestly: the prep/draft UI already displays the counter —
   add "(takes effect from the 3rd sector column)" style copy rather
   than letting it silently not-apply.

### B. Band-entry ramp, act 1 (attacks T1, the c5–c7 cluster)

Same pool-filter mechanism at mid/hard band entry columns (c5, c8): the
band's hardest entry doesn't appear in the first column of its band.
Plus ONE hand check: the c5 elite (Sniper pair, 119% share, sitting
directly on the biggest death cluster) — if stage measurements still
show c5 elite deaths dominating, drop its `eliteVariant` HP bonus a
step, exactly like the recorded col-3 sniper precedent (+1 not +2).

### C. Continuous late scaling (attacks T2; the "harder where rich" half)

Replace `veterancyBonus`'s 3-step with a per-(act, col) **SCALING_TABLE**
in enemies.ts, same application site (`applyVeterancy` slot), same
purity. Shape:

```ts
// { hp: flat per-ship HP, computer: 0 | 1 } — computer only at the top
// of each act, where the surplus is; never at a band entry column.
const COLUMN_SCALING: Record<1 | 2, { hp: number; computer: 0 | 1 }[]> = ...
```

- A **table, not a formula** — tunable per column, but gated (55.3) so
  it can't silently drift from the target curve.
- Reaches **offense (computer) at the top end**, not just HP — pure
  additions to fields `applyEscalations` already writes, so the combat
  engine, telegraphs, and enemy-panel readouts inherit them with zero
  engine changes. The +computer entries are what makes late columns
  genuinely harder rather than just longer (and note 62's convergence
  ALSO adds late-round computer — after 62 lands, check the interaction:
  both stacking may overshoot; that's a reason C is staged last).
- Start values: derive against the post-56/62 budget snapshot so that
  T2 passes with T1 still holding; expect roughly +1 HP per 2 columns
  with +1 computer only in each act's last 2–3 columns. Record the
  derivation.
- The enemy panel/wiki copy that names "veterancy" should keep working —
  keep the `veterancyBonus` field on `EnemyDef` populated (it's display
  surface), even if the function behind it changes.

## 55.3 Instrument upgrade: make the curve self-checking

- `enemyValue.ts` output gains **target vs actual vs delta** columns for
  T1–T3, so the tuning loop is one command.
- **Decision point 2 (user)**: additionally promote T1–T3 to a
  `src/game/` vitest gate (a `difficultyCurve.test.ts` computing shares
  from the real pools/scaling/reward functions, iteration-50-style) so
  future content changes can't silently regress the curve — or leave it
  a script-level report. The gate is the better long-term answer; it
  does make every future enemy/pool edit answerable to this test.

## 55.4 Measurement protocol (staged; every stage n=500 `balance:full`)

0. **Baseline** (post-56, post-62): balance:full + death histograms +
   enemyValue snapshot, recorded here.
1. **Stage A** (act-seam trim): expect act-2 conditional > 0% for the
   first time and the global-c11 histogram spike to flatten. Act-1
   numbers should not move (act-1 untouched) — if they do, something
   leaked.
2. **Stage B** (act-1 band-entry ramp): expect act-1 clear up and the
   c5–c7 spike down. The c5-elite hand check happens after this
   measurement, not before.
3. **Stage C** (continuous scaling): expect act-1/act-2 clear roughly
   HELD (not raised — this stage takes back the late-act coast) while
   T2 goes green. If clear rates crater, the table's top end is too
   aggressive — halve the computer entries first, HP second.
4. Full bar throughout: `npx tsc -b --force`, `npx vitest run`,
   `npx vite build`, sim smoke (zero rejectedDispatch). No browser
   passes. `npm run balance` matchup table recorded before/after per
   stage (enemy stats change; KNOWN-FAIL/GAP lines may move — explain
   every moved line).

**Stop conditions**: act-1 clear FALLS after A or B → a band-entry
column got harder, wrong direction, stop and reconsider. Act-2
conditional still 0% after A → the wall isn't (only) the seam; re-read
the death histogram before reaching for bigger hammers.

## Out of scope

- **The final boss** — across 3,000+ simulated runs nothing has ever
  reached global c23; tuning it is measuring noise until the gauntlet
  is survivable.
- **Scaling to the player's live fleet value** — breaks iteration 9's
  determinism rules (a reload could change a fight). Scaling to the
  expected budget curve is the deterministic equivalent and is what
  this whole iteration does.
- **Reward-curve changes** — this iteration moves the difficulty side
  only. Touching income at the same time would make stage attribution
  impossible. The late-run credit surplus is EXPECTED to stop being a
  surplus because fights get more expensive to survive, not because
  income drops; if a reward change turns out to be wanted anyway, it's
  its own iteration with this one's post-measurements as baseline.

## Open decisions for the user (confirm before implementation starts)

1. **T2/T3 numbers** — 60% within-act floor, 1.15× seam cap: confirm or
   adjust (55.1).
2. **Vitest gate vs script report** for the curve invariants (55.3).
3. **Counter-protocol ramp-in** (A.2) — comfortable with the drafted
   counter not applying for act-2's first two columns, with honest UI
   copy? (The alternative — halving its stats there — touches more data
   for the same effect.)
