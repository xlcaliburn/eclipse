## Iteration 12 — complete

> **Status:** implemented directly by the planning thread with live browser
> verification, 2026-07-27. All three milestones landed; 287/287 tests,
> `tsc -b` and `vite build` clean.
>
> - **M1 starchart:** coordinate layer verified in-browser — 29 nodes/62
>   edges at exact computed centers, reachable-edge animation, visited
>   trail polyline, hover onward-preview (keyboard focus included), scroll
>   auto-centering. Flexbox lanes fully replaced.
> - **M2 theater fx:** verified live — arced enemy missile tracers, player
>   tracers, shield ripples, floating −N, destruction shards all observed
>   in a real fight; banner verified via injected element (organic banners
>   need a triggered card/part effect). One environment finding: this
>   machine runs with `prefers-reduced-motion: reduce`, which accidentally
>   proved the reduced-motion path (instant reveal, zero fx) before the
>   animated path was verified with a temporary override (reverted).
> - **M3:** hit-chance matrix verified against hand-computed values (comp 1
>   → 33%, comp 0 → 17%); **restored the forecast display** — the
>   working tree had lost ForecastBar and all forecast/stance UI in an
>   interrupted refactor, so TacticalReadout rebuilds it (two-stance rows +
>   pips + doctrine switching) alongside the new tables; hover delta
>   verified ("Ion cannon on Flagship #1: 100% → 100%"); shop and
>   fleet-overlay credit/intel badges removed (HudBar is the single
>   source).
> - Scale bug caught live: `forecastWinRate` returns 0–100, not 0–1 — the
>   readout showed "10000%" until fixed. The kind of thing only a browser
>   pass catches.

**The coordinate layer & decision support.** Finishes iteration 10's two
explicitly-deferred visual systems by giving the map and combat theater
real coordinates, and adds the two highest-value legibility tools the prep
screen lacks. Browser verification is authorized for this iteration (user,
2026-07-27) — each milestone ends with an eyeballed screenshot, reversing
the prior standing skip.

Presentation-first, same guardrails as iteration 10: code-authored SVG/CSS
only; engine/reducer changes only where a feature genuinely needs a
derivable number that doesn't exist (none anticipated); existing tests
stay green.

### 12.1 Starchart coordinate layer (M1)

`MapScreen` moves from flexbox columns to a **fixed coordinate system**:
node centers computed from `(col, row)` (`x = PAD + col * COL_W`,
`y = PAD + row * ROW_H`), nodes absolutely positioned, and a single SVG
overlay (same pixel size as the chart) drawing beneath them:

- **Constellation lines**: an edge for every legal adjacency between
  visible columns; faint by default.
- **Reachable edges** (from the current position): brighter, animated
  marching dashes.
- **Visited trail**: the traveled path as a soft cyan polyline behind the
  fleet chevron; fled nodes' edges dimmed out.
- Hover a reachable node: its outgoing onward edges glow one step ahead
  (the routing-preview seed; full reachability shading can come later).
- Horizontal scroll if 11 columns overflow, current column auto-centered.

### 12.2 Combat theater vocabulary (M2)

The theater gets a positioning container: each ship card registers its
ref; an absolutely-positioned SVG overlay computes card centers via
`getBoundingClientRect` relative to the container, recomputed on resize.
The iteration-10 event replay already reveals log entries one at a time —
each newly-revealed event now also emits a transient visual:

| Event | Visual |
|---|---|
| cannon hit | tracer line attacker→target (stroke-dash sweep) + target flash/shake (exists) |
| miss vs shield/evasion | tracer ending in a shield-ripple arc on the target |
| miss (natural 1 / jink) | tracer veering past the card |
| damage | floating `−N` drifting up from the target |
| destruction | break-apart: two half-silhouette shards drifting/fading (CSS) |
| missile phase | slower, arced tracer (quadratic curve) |
| flak/chaff intercept | spark burst mid-tracer, tracer terminates |
| card/active played | banner strip across the theater top |

Transient elements are keyed by log index and removed after animation end;
auto-resolve and reduced-motion skip all of it (existing flags);
click-to-fast-forward clears pending transients immediately.

### 12.3 Decision support (M3)

- **Hit-chance matrix** on the prep screen: for each equipped player
  weapon vs each enemy group (and each enemy group's weapons vs the
  player's ships), the computed to-hit ("4+ · 50%"), fully accounting for
  computer, shield, pierce, and iteration 11's evasion. Pure presentation
  math mirroring the resolver's formula — extract a shared
  `hitThreshold(attacker, weapon, defender)` helper from the engine so
  the table can never drift from the truth.
- **Forecast delta preview**: hovering a purchasable part (shop) or an
  inventory part (prep) shows the forecast change if equipped to the
  selected ship ("42% → 51%") against the committed enemy at prep; at
  shops (no committed enemy) the preview is omitted this iteration.
- **HUD dedup**: remove the legacy per-screen credit/intel badges that
  iteration 10 kept alongside `HudBar`.

### 12.4 Verification

Per milestone: `npm test` / `tsc -b` / `vite build` green, plus a live
browser pass with screenshots (map with lines and trail; a mid-replay
combat round showing a tracer and a floating damage number; the prep
screen matrix vs a formation enemy). Final: full-run smoke test in the
preview browser.
