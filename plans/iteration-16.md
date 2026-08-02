# Iteration 16 — complete

> **Status:** implemented and browser-verified 2026-08-02. All three
> milestones (tab shell, touch polish, PWA) landed in one pass, verified
> milestone-by-milestone as specified. `npx vitest run` 372/372 (unchanged
> from the pre-iteration baseline — this is a view-layer iteration with no
> `src/game/` changes and no component test rig, so verification is
> browser-first per the plan's own 16.4; no new automated tests were added,
> and none of the reducer/persistence suites needed touching), `npx tsc -b`
> clean, `npx vite build` clean (now also emitting `dist/sw.js`,
> `dist/workbox-*.js`, and `dist/manifest.webmanifest` via vite-plugin-pwa).
>
> **M1 — tab shell.** `viewingMap`/`viewingFleet` unified into one
> `surface: 'mission' | 'chart' | 'fleet'` state in `App.tsx`, reset to
> `'mission'` on every phase change (the existing effect, generalized).
> A new `useIsCompact()` hook (`src/components/useIsCompact.ts`,
> `useSyncExternalStore` over `matchMedia('(max-width: 720px)')`, mirroring
> the breakpoint already used throughout `styles.css`) is the one JS-level
> signal for which skin to render: desktop keeps the exact pre-16 code
> paths (Chart as an early-return full-screen peek with a Close button,
> Fleet as an additive `modal-backdrop` overlay on top of Mission, both
> gated on `!isCompact`); mobile renders `TabBar` (`src/components/
> TabBar.tsx`, three code-authored inline-SVG glyphs on the NodeGlyph/
> ShipSilhouette 0-100-viewBox idiom) fixed to the bottom and shows exactly
> one surface at a time. `MapScreen` gained an `interactive` prop (default
> `true`, so desktop and the live map phase are byte-for-byte unchanged);
> the mobile Chart tab passes `interactive={phase === 'map'}` and omits
> `onClose`, which suppresses reachable-node highlighting/hover/click and
> the Close button together — read-only styling, "switch tabs" copy, no
> stray affordances. `FleetOverlay.tsx` gained a sibling export
> `FleetScreen` (shares a `fleetBody()` render helper with the unchanged
> `FleetOverlay`) for the mobile Fleet tab — the same content, no modal
> chrome, no Close button (tab bar is the way out, same reasoning as
> Chart). The redundant HUD-bar "Map" button is hidden at ≤720px via CSS
> (desktop untouched) since the Chart tab supersedes it once tabs exist.
>
> **M2 — touch + small-screen polish.** Target audit at ≤720px bumped
> `.hud-bar__motion-button`, `.shop-button` (covers its narrower
> contextual variants — card lane buttons, the cargo-pod mover — since
> neither overrides height), `.continue-button`, `.withdraw-button`, and
> `.engage-button` to a 44px min-height (measured pre-fix: 22–41px;
> `.card-tile`/`.part-card`/`.map-node`/`.tab-bar__button` were already
> ≥72px, no change needed). Combat thumb-reach: measured directly in a
> live 2-ship fight at 375×812 with the tab bar present — "Next round"/
> "Withdraw" sit well above the tab bar with no scrolling required, so the
> compacted command-bar layout from earlier this session already satisfies
> this; no sticky treatment was added (would have been unnecessary
> complexity). Chart-on-phones: `.starchart`'s existing `overflow-x: auto`
> container and the position-driven auto-center effect both already work
> unmodified on the Chart tab (same `MapScreen` instance, same effect) —
> confirmed via `scrollLeft` being non-zero on tab-open and zero
> `document.body` horizontal overflow. Platform feel: `overscroll-behavior:
> none` on `body`, and `touch-action: manipulation` / `-webkit-tap-
> highlight-color: transparent` / `user-select: none` on the blanket
> `button` selector (every control in this app is a `<button>`), with an
> explicit `user-select: text` carve-out for `.combat-log`. None of these
> four rules affect paint, so — like the target-size bump, which *is*
> breakpoint-gated — they're applied unconditionally rather than gated
> behind ≤720px; this was a judgment call to keep the CSS simple, and
> desktop verification confirmed zero visual difference. Landscape: not
> literally "bar stays bottom" at every landscape width, since the
> breakpoint is width-only (matching the codebase's existing convention,
> and the task's explicit instruction to keep the ≤720px cut literal) —
> phones whose landscape width exceeds 720px (most modern flagships) fall
> back to the desktop peek/modal skin instead of the tab bar. This is a
> deliberate deviation from the letter of "bar stays bottom" for the
> common case, but satisfies "not broken": verified at 812×375 (falls back
> to desktop skin, no overflow) and 667×375 / iPhone-SE-landscape (tab bar
> present, flush to the bottom, content scrolls above it, no overflow).
>
> **M3 — PWA.** `vite-plugin-pwa` added as a devDependency, `registerType:
> 'autoUpdate'`, default `generateSW` precache. Manifest: name "Eclipse
> Roguelike", short_name "Eclipse", `display: standalone`,
> `orientation: any`, theme/background `#05070d`. Icons: a new
> code-authored `public/icon.svg` (nebula backdrop + the Flagship
> silhouette lifted straight from `ShipSilhouette.tsx`'s
> `FRAME_SHAPES.cruiser` path, rescaled), rasterized to `public/icons/
> pwa-192x192.png`, `pwa-512x512.png`, and `maskable-512x512.png` — the
> source has enough padding around the ship to already be maskable-safe,
> so one rendering serves both the "any" and "maskable" manifest entries.
> Rasterization was a throwaway script (`sharp` installed temporarily in
> the scratch directory, not added to the project) — an initial attempt
> with `msedge --headless --screenshot` produced blank-white PNGs from a
> malformed `file://` URI (git-bash `pwd` emits `/d/...`, not a Windows
> drive path); switched approaches rather than debugging the URI further.
> GitHub Pages base path: `vite.config.ts`'s existing `base: './'` (a
> relative path, not a hardcoded `/<repo>/`, chosen in an earlier iteration
> so the same build works at any URL depth) flows through to
> vite-plugin-pwa unmodified — confirmed, not assumed, by inspecting the
> build output: `dist/manifest.webmanifest` has `"start_url":"./"` and
> `"scope":"./"`, and `dist/registerSW.js` registers with
> `{ scope: './' }`. Offline verification: built + served via `vite
> preview` on port 4173, confirmed the manifest fetches, a service worker
> reaches `activated` state, and `caches` holds 33 precached entries
> (including `favicon.svg`, `icon.svg`, `icons.svg`, and all three PNG
> icons); then the preview server process was killed outright (`curl`
> confirmed connection refused) and the page was reloaded — it loaded
> fully from the service worker's cache (network panel showed 200s for
> every request with no live server behind them) and stayed fully
> interactive (clicked through "Continue run" into commander pick,
> state driven by the cached bundle + localStorage). This is a harder
> offline test than a DevTools network-throttle toggle, since literally no
> server process existed on the other end. Lighthouse itself was not run
> (no CLI/debugging-port path available in this tool set); the individual
> installability criteria it would check were verified by hand instead —
> valid manifest with name/short_name/icons(192,512,maskable)/
> start_url/display, and an activated service worker controlling the page.
>
> **Browser verification** (both breakpoints, per screen, using DOM
> inspection rather than screenshots — see note below): 375×812 confirmed
> tab bar presence/safe-area padding, all three tabs rendering real
> content (Mission = live phase screen, Chart = MapScreen, Fleet =
> FleetScreen), Chart-tab PICK_NODE auto-switching to Mission on a phase
> change, no horizontal `document.body` overflow across map/chart, prep,
> combat, reward, victory, and event screens, and touch targets at 44px
> post-fix. 1280×800 confirmed zero tab bar, the HUD "Map" button
> preserved, the desktop Chart peek (Close button + full interactivity)
> and the desktop Fleet modal (backdrop + Mission still mounted
> underneath + Close button) all matching pre-16 behavior exactly.
> **Tooling note:** this environment's Browser-pane `computer` click/
> screenshot actions did not work (screenshot: "pane is not displayed,
> not compositing"; synthetic OS-level clicks silently no-op) and the
> `resize_window` viewport override does not dispatch native `resize` or
> `matchMedia` `change` events to the page — a `navigate` reload was used
> after every resize to force a fresh read of the breakpoint. All
> interaction in this verification pass was done via `dispatchEvent`
> through `javascript_tool` and structural checks via `get_page_text`/
> `read_page`/direct DOM queries — not a limitation of the app, but worth
> recording since it means no actual screenshots were captured this pass.
>
> No deviations from the spec's explicit decisions (tab set, PWA scope,
> desktop-unchanged, no SAVE_VERSION bump — confirmed: `src/game/` was not
> touched at all this iteration). Judgment calls made under "implementer
> latitude" are called out inline above (Fleet/Chart tabs drop their Close
> button same as Chart; platform-feel CSS applied unconditionally rather
> than breakpoint-gated; landscape falls back to the desktop skin above
> 720px width rather than special-casing orientation).

**Thesis.** The game already *stacks* acceptably on small screens
(breakpoints from iterations 10–13), but it navigates like a desktop page:
peek buttons, a modal fleet overlay, everything reached from the top of a

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
