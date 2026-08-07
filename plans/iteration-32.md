# Iteration 32 — Act-2 starchart expansion: more routes, unequal routes (specced 2026-08-07)

> **Status: specced, not implemented.** Implement **iteration 33 first** —
> this iteration rewrites `ACT2_QUOTAS`, and those quotas should be written
> with 33's `shipyard` node type already in the game (otherwise 32 ships
> with placeholder `shop` entries that 33 immediately rewrites).

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
