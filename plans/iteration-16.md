# Iteration 16 (planned) — Mobile shell: tabs + PWA

**Thesis.** The game already *stacks* acceptably on small screens
(breakpoints from iterations 10–13), but it navigates like a desktop page:
peek buttons, a modal fleet overlay, everything reached from the top of a
scrolling column. This iteration gives mobile an app's navigation model —
a fixed bottom tab bar — and makes the game literally installable as an
app. A no-backend, localStorage-saved game is the ideal PWA; this is
mostly free capability we haven't claimed.

Decisions taken in planning chat (2026-08-02):

- **Tab set: Mission / Chart / Fleet** (three tabs, bottom bar). A fourth
  Hand tab was considered and rejected — it duplicates what the combat
  screen shows inline.
- **Full PWA**: manifest + icons + service worker (offline), not just
  standalone install.
- Desktop (> 720px) is **unchanged** — same peek buttons, same modal.

**Sequencing.** Implement after iteration 14 lands (it is rewriting
App.tsx/EventScreen now). Recommended order 14 → 15 → 16; 16 is
mechanically independent of 15 but both touch App.tsx and the HUD, so
whichever goes second rebases on the other. **No SAVE_VERSION bump** —
everything here is view-layer; tab state is never persisted.

## 16.1 The tab shell

- **Breakpoint:** the tab bar exists at ≤ 720px (the existing stacking
  breakpoint); above it, nothing changes.
- **Tabs:**
  - **Mission** — exactly what App renders for the current phase today.
  - **Chart** — MapScreen. Interactive during the `map` phase (PICK_NODE
    live); read-only peek styling otherwise, with no Close button — the
    tab bar *is* the way out. The reducer's phase guard already makes
    stray picks no-ops; the UI additionally hides pick affordances
    outside the map phase.
  - **Fleet** — the FleetOverlay's content promoted to a full screen
    (desktop keeps it as the modal).
- **Suggested unification** (implementer latitude): replace the
  `viewingMap`/`viewingFleet` booleans in App with one
  `surface: 'mission' | 'chart' | 'fleet'` view state. Desktop's existing
  peek/overlay buttons set the same state and render it as today
  (peek/modal); mobile renders it as tabs. One state machine, two skins.
- **Auto-switch, no badges:** on any phase change, snap back to Mission
  (this generalizes the existing phase-change effect that closes
  peeks/overlays). Reasoning, recorded: phase only changes from the
  player's own dispatch, and the one off-Mission dispatch that matters —
  picking a node from the Chart tab — *should* land you on Mission for
  the resulting prep/shop/event. With auto-switch there is no
  "unseen input needed" case, so no badge system.
- **Layout:** bar fixed to the bottom, ~56px tall plus
  `env(safe-area-inset-bottom)`; `.app` gains matching bottom padding at
  the breakpoint so content never hides behind it. Tab glyphs are
  code-authored inline SVG in the ShipSilhouette/NodeGlyph idiom (chart =
  the starchart node circle, fleet = a frame silhouette, mission = a
  crosshair/chevron); active tab gets the accent treatment.
- **`viewport-fit=cover`** added to the index.html viewport meta (needed
  for safe-area env vars on notched phones).

## 16.2 Touch + small-screen polish

- **Target audit:** every interactive element ≥ 44px on coarse pointers —
  known suspects: part cards' small variants, card tiles, HUD buttons,
  shop lane buttons. Fix by padding at the breakpoint, not by redesign.
- **Combat thumb-reach:** the round controls (Next round / Withdraw)
  must be reachable without scrolling on 375×812 mid-fight. If the
  compacted layout (earlier this session) doesn't already guarantee it
  with the tab bar present, make the command bar sticky above the tab
  bar on mobile.
- **Chart on phones:** the iteration-12 coordinate layer is wider than
  375px — confirm it lives in its own horizontal-scroll container (page
  body must never scroll horizontally) and that the existing
  auto-center-on-current-node behavior fires on the tab, not just the
  map phase.
- **Platform feel:** `touch-action: manipulation` on all game controls
  (kills double-tap zoom), transparent `-webkit-tap-highlight-color`,
  `overscroll-behavior: none` on the body, `user-select: none` on
  controls (the combat log stays selectable).
- Landscape phones: not optimized, just not broken — bar stays bottom,
  content scrolls.

## 16.3 PWA

- **vite-plugin-pwa** (devDependency), `registerType: 'autoUpdate'`,
  default `generateSW` precache — the entire app is static hashed assets
  (fonts included), so the defaults cover full offline play after first
  load.
- **Manifest:** name "Eclipse Roguelike", short_name "Eclipse",
  `display: standalone`, `orientation: any` (don't fight tablets),
  `theme_color`/`background_color` `#05070d` (`--bg`).
- **Icons:** 192, 512, and a maskable variant, committed as static
  assets in `public/`, generated from a new code-authored `icon.svg`
  (Flagship silhouette over the nebula palette — reuse the existing
  silhouette path). How the PNGs get rasterized is implementer's choice
  (throwaway script, headless-browser render); the SVG source stays in
  the repo, the PNGs are committed.
- **GitHub Pages base path:** the deploy workflow exists; verify the
  vite `base` setting and confirm the manifest scope + SW registration
  respect it (vite-plugin-pwa handles this when `base` is set — check,
  don't assume).
- **Update-vs-save note:** autoUpdate can swap the app under a returning
  player. Saves are localStorage and SAVE_VERSION-gated, so the worst
  case is the existing "save discarded on version bump" behavior — no
  new failure mode, but record it in the status notes.

## 16.4 Verification (browser-first — there is no component test rig)

- Unit suite untouched and green; `tsc -b`, `vite build` clean.
- Per milestone, browser pass at the 375×812 mobile preset: tab bar
  present with safe-area padding; all three tabs render; Chart pick →
  auto-switch to Mission; no horizontal body scroll on any phase screen;
  round controls reachable mid-fight without scrolling; desktop viewport
  (1280) shows zero visual change.
- PWA: `vite build` + preview server — manifest and SW present,
  Lighthouse-installable, and the game loads with the network disabled
  after a first visit.

## 16.5 Milestones

- **I16-M1 — tab shell:** surface-state unification, the bar, Chart and
  Fleet as tabs, auto-switch. Mobile-preset browser pass.
- **I16-M2 — touch polish:** target audit, safe areas, sticky command
  bar if needed, chart scroll container, platform-feel CSS.
- **I16-M3 — PWA:** plugin + manifest + icons, offline verification,
  Pages base-path check.

**Definition of done:** a full run is playable one-thumb on 375×812 with
no pinch-zoom and no horizontal body scroll; the game installs to a phone
home screen and launches fullscreen; it plays offline after first load;
the desktop experience is pixel-for-pixel what it was.
