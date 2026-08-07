# Iteration 32 — Act-2 starchart expansion: more routes, unequal routes (implemented 2026-08-07)

> **Status: implemented 2026-08-07.** Built on top of iteration 33
> (already implemented, so `ACT2_QUOTAS` was written directly with the
> `shipyard` node type in place, per this file's original sequencing
> note). See "Implementation notes (2026-08-07)" at the end of this file.

User direction: "for act 2, let's expand it further, let's add more
routes, and also not every path should be the equal length, similar to FTL
where you can take a more roundabout path — at the cost of the increasing
threat."

Act 2 today is a copy of act 1's shape: a 3-row × 10-column trellis plus
the boss, every route exactly 11 stops. Fine for act 1 (the tutorial act
teaches one shape), flat for act 2 — by then the player knows the trellis
and every route reads the same. This iteration makes act 2 structurally
bigger (more lanes, more columns) and — the FTL part — makes route
*length* a decision: warp lanes let a route skip a column outright, and a
pursuit clock makes lingering on the long way cost heat. `heat.ts`'s own
docstring already calls the heat track "a legible, numbers-stripped
version of FTL's rebel fleet" — this iteration is that sentence finally
cashed in.

## 32.1 The bigger chart: 4 rows × 12 columns

- `ACT2_QUOTAS` grows from 10 columns × 3 entries to **12 columns × 4
  entries** (48 lane nodes, up from 30); the boss moves to column 12.
  Act 1 is untouched — 3×10 stays, so the act transition itself reads as
  "the war got bigger."
- Adjacency rule unchanged (|Δrow| ≤ 1). With 4 rows this alone creates
  real route identity: row 0 and row 3 can never see each other's nodes
  without spending two columns crossing the middle — "more routes" falls
  out of the geometry, not from new special cases.
- Proposed quotas (the implementer may re-shuffle within reason; the
  invariants that matter: ~1 recovery option per 2 columns, shops/
  shipyards placed per iteration 33's split, elite density rising toward
  the boss, and every column keeping at least one plain combat):

  ```
  col 0:  combat, combat, combat, event
  col 1:  combat, combat, event, shop
  col 2:  elite, combat, combat, event
  col 3:  repair, shop, combat, combat
  col 4:  elite, combat, event, combat
  col 5:  shipyard, combat, elite, event
  col 6:  repair, combat, combat, event
  col 7:  elite, elite, combat, shop
  col 8:  combat, elite, event, repair
  col 9:  shipyard, elite, combat, combat
  col 10: repair, elite, combat, event
  col 11: shop, elite, elite, combat
  col 12: [boss]
  ```

- **Per-act lane count.** `LANE_COLUMNS` (10) is currently shared by both
  acts and baked into `BOSS_COLUMN`, `nodesConnect`'s boss special-case,
  and `globalColumn`. Replace constant comparisons with structural/
  act-aware forms:
  - `laneColumns(act): number` (act 1 → 10, act 2 → 12) or read
    `columns.length - 1` where the columns array is already in hand.
  - `nodesConnect`'s boss case becomes structural: the target column being
    single-node is what makes it connect-from-everywhere (chartEdges in
    MapScreen already does exactly this — the model follows the view's
    lead for once).
  - `globalColumn(2, col)` stays `col + 11` — the offset is act **1**'s
    width, which didn't change. Rewards/escalation comparisons keep
    working; act-2 columns now reach global 23 instead of 21, which only
    means late-act-2 fights pay a little more (winReward is linear in
    column — acceptable, and the 31-M3 boss re-tune measures against
    whatever economy exists when it lands).

## 32.2 Warp lanes: routes of unequal length

- New field `GameMap.act2Shortcuts?: { from: MapPosition; to: MapPosition }[]`
  — generated edges from a node in column `c` to a node in column `c+2`,
  **skipping column c+1 entirely**. Generate **2 per map**, seeded, with
  placement rules:
  - `from.col` drawn from columns 2–8, the two shortcuts at least 2
    columns apart (so they can't chain into a triple-skip corridor).
  - `|from.row − to.row| ≤ 1` — a warp lane bends at most one lane, same
    as a normal edge, so the chart stays readable.
  - Never lands on (or departs from) a repair node — skipping is supposed
    to cost you resources, not hand you a free heal on arrival.
- `reachableNodes` gains the shortcut targets: signature grows to accept
  the shortcuts list (or the whole map + act); `PICK_NODE` must now carry
  the target column, since two different columns can be reachable at
  once: `{ type: 'PICK_NODE'; row: number; col?: number }` — `col`
  omitted means `position.col + 1` (existing tests and act-1 UI calls
  stay valid unmodified).
- Taking a shortcut is otherwise a normal move: heat, fog vision, cargo,
  everything keys off the arrival node exactly as today. The skipped
  column's nodes are simply never visited (and remain visitable-looking
  on the chart — grayed like fled nodes once passed, same "can't return"
  rendering rule).
- **What a shortcut buys**: 1 fewer fight/stop — arrive at the boss
  sooner, poorer, and less escalated-at (see the clock below). **What the
  long way buys**: more rewards, more shops — and the pursuit notices.

## 32.3 The pursuit clock: the roundabout tax

- New rule, act 2 only, pure counter arithmetic (heat.ts's "never touch
  this file with an rng draw" law respected): **arriving at any act-2
  lane node beyond your 10th adds +1 heat on arrival**, on top of
  whatever the node itself does. Full-length routes visit 12 lane nodes —
  the last two each tick the clock; a route using both warp lanes visits
  10 and never ticks it at all.
- Implemented in `PICK_NODE` off `visited` filtered to act-2 positions —
  no new persisted counter, derived state only. Threshold derived from
  the map (`laneColumns(2) − 2`), not a magic 10, so future re-sizing
  keeps the invariant "shortest possible route pays no tax."
- This composes with existing machinery rather than adding any: heat 4 is
  already "Hunted — next non-combat node is intercepted." The long-router
  doesn't face bespoke stronger enemies; they face the *existing* threat
  track with less headroom, which is exactly FTL's deal (linger and the
  fleet catches up — the game doesn't invent new rules, the clock just
  runs out).
- UI: the map hint line in act 2 states the rule plainly once the player
  is within 2 nodes of the threshold ("The armada is closing — every stop
  past the next one raises heat."). Transparency law: a deterministic tax
  the player can count on their fingers, never a surprise.

## 32.4 Renderer + fog + downstream

- `MapScreen.tsx`: `nodeCenter`/`chartSize` currently hardcode 3-row
  geometry (height `2 × ROW_H`, single-node columns centered at row 1).
  Generalize both to the act's max row count (`max(columns[i].length)`),
  centering single-node columns at `(rows−1)/2 × ROW_H`. Warp-lane edges
  render in the existing SVG edge layer as **dashed** lines (new
  `map-edge--warp` class) so a skip is visually distinct from a step;
  they participate in the same reachable/hover highlighting.
- `chartEdges` gains the shortcut edges; the edge-connects predicate
  otherwise unchanged.
- Fog (`fog.ts`) works untouched — `visionCol` is a column high-water
  mark and shortcuts only ever increase your column faster.
- `escalations.ts`: act-2 schedule gains a third entry
  (`landsAfterColumn: 9`) — 12 columns is room enough for three waves
  where 10 held two. Seeded-draw tests update (composition change ⇒ rng
  stream shifts — same documented consequence as every quota edit; old
  seed codes generate different sectors, which past iterations have
  accepted and noted rather than versioned around).
- `enemies.ts` `poolBand`/`veterancyBonus`: verify the band cutoffs read
  sensibly against 12 columns (the hard band simply covers more columns —
  likely fine as-is, but measure, don't assume: run `npm run balance` and
  eyeball an act-2 column sweep before calling it done).
- `scripts/actRun.ts` simulates act 1 only — unaffected beyond compiling
  against the new `PICK_NODE` shape and `MapNode` unions.
- Persistence: `act2Shortcuts` optional-additive; an old save's 3×10
  act-2 map keeps working because every consumer reads array lengths
  structurally after this iteration (that's 32.1's refactor). No
  SAVE_VERSION bump.

## Verification

- Map-gen unit tests: determinism (same seed ⇒ same chart + shortcuts);
  every generated shortcut satisfies the placement rules (sweep many
  seeds, not one); every act-2 node still has ≥1 incoming edge and the
  boss is reachable from every lane of the final column; shortest-path
  length across many seeds is `laneColumns − #usable-shortcuts-on-route`.
- Reducer tests: PICK_NODE via shortcut moves 2 columns and skips the
  middle; pursuit clock +1 heat exactly past the threshold, never in
  act 1, never on the boss node; threshold derived (re-run against a
  hypothetical smaller map fixture).
- Standard bar (`tsc -b --force`, `npx vitest run`, `npx vite build`)
  plus a live browser pass on a hand-edited act-2 save: 4-row chart
  renders and scrolls, dashed warp lanes visible and pickable, taking one
  skips the column, heat pips tick past the threshold, mobile Chart tab
  still fits (4 rows is taller — check the compact viewport).

## Files touched (anticipated)

- `src/game/map.ts` — quotas, per-act lane counts, shortcut generation +
  structural boss checks, `reachableNodes`.
- `src/game/reducer.ts` — PICK_NODE col param + pursuit clock.
- `src/game/escalations.ts` — third act-2 wave.
- `src/components/MapScreen.tsx`, `src/styles.css` — generalized
  geometry, warp-lane rendering, threshold hint copy.
- `src/game/map.test.ts` (or wherever map tests live), `reducer.test.ts`,
  seeded-expectation updates across the suite.

## Milestones

- **32-M1** — geometry: per-act lane counts, structural boss checks,
  4×12 quotas, renderer generalization (no shortcuts yet — the bigger
  trellis alone must be green end-to-end).
- **32-M2** — warp lanes: generation, reachability, PICK_NODE col,
  rendering, tests.
- **32-M3** — pursuit clock + copy, balance eyeball (`npm run balance`
  act-2 sweep), browser pass, status notes here and in `PLAN.md`.

## Implementation notes (2026-08-07)

All four sub-sections (32.1-32.4) implemented as specced, with a small
number of deviations and one deliberate scope narrowing, noted below.

**32.1 (the bigger chart).** `ACT2_QUOTAS` grew to the plan's exact
12-column x 4-lane table. `BOSS_COLUMN`/`LANE_COLUMNS` (flat constants
that silently assumed both acts were the same width) were replaced with
`laneColumns(act)` / `bossColumn(act)` — `LANE_COLUMNS` itself survives
unrenamed, since `globalColumn`'s act-2 offset (`col + LANE_COLUMNS + 1`)
specifically means act 1's width, not "whichever act is current," and
conflating the two would have been the exact bug this refactor exists to
prevent. `nodesConnect` dropped its `b.col === BOSS_COLUMN` special case
for a structural `targetIsSingleNode` flag the caller derives from the
target column's own array length — mirrors what `chartEdges` in
MapScreen.tsx already did, per the plan's own note. `generateActColumns`
now places the boss at `quotas.length` (structural) rather than a fixed
constant, so it never needs to know which act it's generating for.
`maxRows(columns)` is the new generalization point for "how many rows
should this act's renderer/fog-reveal loops iterate" — 3 for act 1, 4 for
act 2, computed once, not hardcoded anywhere downstream.
`MapScreen.tsx`'s `nodeCenter`/`chartSize` take that row count as a
parameter and center single-node columns at `(rows-1)/2 * ROW_H`, exactly
per spec.

**Deviation (found, not anticipated by the plan): a 5th escalation
draw exhausts the entire pool.** `drawEscalationSchedule` draws without
replacement from a 5-entry pool; adding act 2's third wave (landing after
column 9) makes every draw a full 5-of-5 — every run now gets all five
escalations, always, with only their (act, column) assignment left to
chance. Previously it was 4-of-5 (one omitted at random per run). Not
treated as a bug — proportionate to a run that grew from 20 to 22 lane
columns and the pool was never designed to be scarce — but flagged in
both `escalations.ts`'s comment and its test, since the plan's wording
didn't anticipate it.

**32.2 (warp lanes).** `GameMap.act2Shortcuts?: MapShortcut[]`
(optional-additive, absent on act 1 and on any pre-32 save).
`generateAct2Shortcuts` is rejection sampling over the already-open rng
stream: draws a candidate `from.col` (2-8), rejects if within 2 columns of
an already-placed shortcut, draws a `from` row excluding repair nodes,
draws a `to` row (same column-index bend rule, also excluding repair),
retries up to 500 times. Fully deterministic per seed (same seed -> same
number of draws -> same shortcuts) even though the draw *count* varies
with content — the same non-issue iteration 22's `pinToRow1`/quota edits
already established for this codebase. `reachableNodes` gained an
optional `shortcuts` param; a shortcut's target is added to the normal
+1-column set, never replacing it. `PICK_NODE`'s `row` field gained a
sibling `col?: number` (omitted = the pre-32 default, position.col + 1) —
needed because a shortcut target and the normal next node can now be
simultaneously reachable and can share a row, so row alone stopped being
enough to disambiguate a click. Taking a shortcut marks every node in the
skipped column `fled` (reusing the exact mechanism/CSS/copy WITHDRAW
already established, per the plan's explicit ask) — implemented directly
in the `PICK_NODE` case, no new state field. `MapScreen.tsx`: warp edges
render via a new `warp?: boolean` field on `ChartEdge`, class
`map-edge--warp` (dashed, positioned in the stylesheet before
`--reachable` so a warp edge that's also the live pick still shows the
reachable/marching-ants treatment on top). `onPickNode` now always passes
`(row, col)` explicitly from the renderer, rather than relying on the
reducer's omitted-col default — both `App.tsx` call sites updated.

**32.3 (the pursuit clock).** Implemented as a derived value inside
`PICK_NODE`, not a persisted counter: `pursuitThreshold = laneColumns(2)
- 2`, `arrivalOrdinal = (count of act-2-local `visited` entries with col <
laneColumns(2)) + 1`; +1 heat when `state.act === 2 && node.type !==
'boss' && arrivalOrdinal > pursuitThreshold`, folded into `base.heat`
*before* branching so every node type (not just docks) inherits it
automatically, with a dock's own +1-to-enter stacking on top afterward.
The heat-4 interception check was moved from `state.heat` to `base.heat`
so a pursuit-tax-triggered Hunted state correctly intercepts a dock
arrival in the same PICK_NODE dispatch, rather than one dispatch late —
composing with existing machinery exactly as the plan calls for. Map hint
copy ("The armada is closing...") appears once within 2 arrivals of the
threshold, using the identical formula so a future re-sizing keeps the
warning's timing correct with no second edit.

**32.4 (renderer + fog + downstream).** Fog needed literally no changes
— confirmed, not just assumed: `scannableRows`/`availableReveals`
(reducer.ts) already had a hardcoded `row < 3` loop bound and a
`LANE_COLUMNS`-based column bound that both needed generalizing to
`maxRows`/`laneColumns(state.act)`, but `fog.ts` itself (the module the
plan called out) was untouched, exactly as predicted — `visionCol`'s
high-water-mark design was already shortcut-safe. `escalations.ts` gained
its third act-2 wave (see the deviation above). `enemies.ts`'s
`poolBand`/`veterancyBonus` cutoffs (4/7, unchanged) now expose the hard
band to 4 act-2 columns (8-11) instead of 2 (8-9) — measured via `npm run
balance`, no regressions in any existing check, left as-is per the plan's
own "likely fine as-is, but measure" framing; nothing in `balance.ts`
actually exercises `combatEnemyPool` at a specific column today, so this
is an eyeball-level finding, not a gate result. `scripts/actRun.ts`
needed zero changes — it only ever simulates act 1, which this iteration
never touched structurally.

**Scope narrowing, stated rather than hidden**: `scripts/actRun.ts` was
not extended to simulate act 2 (the plan never asked for this here — see
plans/iteration-31.md's own "known limitation" paragraph, which already
defers a real act-2 clear simulation to a future iteration). The pursuit
clock and warp lanes are therefore verified by unit tests and a live
browser pass, not by an automated whole-run act-2 policy sim.

**Verification.** `map.test.ts` gained a `act2Shortcuts` describe block:
determinism, exactly-2-per-map across 60 seeds, every placement rule
(from.col range, skip-exactly-2, bend<=1, never-repair, >=2-apart)
across 60 seeds, `reachableNodes` folding shortcut targets in alongside
the normal set (and staying normal-only when no shortcuts array is
passed, confirming act-1 call sites are unaffected). `reducer.test.ts`
gained two new describe blocks: shortcut PICK_NODE (2-column move,
skipped-column-fled, col-omitted-still-works, invalid-col-refused) and
the pursuit clock (11th arrival taxed, 10th not, never in act 1, never on
the boss, stacks with a dock's own heat, a tax-triggered MAX_HEAT
intercepts a dock exactly like any other Hunted arrival). One pre-existing
test (`reducer.test.ts`, the interlude/act-2-column-0 fixture) assumed
act 2's column 0 was 3 uniform combat nodes — no longer true (it's now
combat/combat/combat/event, shuffled) — loosened to accept either
resulting phase, since the position reset was the actual thing under
test. `escalations.test.ts` updated for the 5-of-5 draw. `enemies.test.ts`
was untouched by this iteration (its one map-adjacent assumption, the
final-boss trio's shield ordering, was iteration 31-M3's fix, not 32's).

Full bar: `npx tsc -b --force` clean, `npx vitest run` 637/637 passing
(up from 619 pre-iteration — 18 new tests), `npx vite build` clean.
Live browser pass on a hand-edited act-2 save (real generated shortcut,
not a synthetic one): 4-row chart rendered at the correct canvas size
(432px tall, matching `PAD_Y*2 + 3*ROW_H`), 2 dashed warp edges present,
clicking a shortcut target moved position 2 columns, the skipped column's
4 nodes rendered fled with "(fled)" labels, heat read correctly (dock
+1, no pursuit tax yet at low visit count — confirmed separately by the
unit tests above), and the mobile viewport (375px) contained the wider
chart inside `.starchart`'s own horizontal scroll with no page-level
overflow.
