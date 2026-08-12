# Iteration 60 — The declutter pass: every string earns its place (specced 2026-08-12)

> **Status: implemented and verified.** `npx tsc -b --force` clean
> project-wide; `npx vitest run` 855/855 (baseline at the start of this
> pass, established before any edit, was 850 — the +5 delta is entirely
> the concurrent iteration-58/59 sessions' own test additions landing
> mid-pass, not this iteration's; this pass added zero tests, being
> presentation-only); `npx vite build` clean. Mobile changes
> live-verified at 375×812 per 60.7 — see status notes below for the
> numbers, judgment calls (60.5's info-dot route, 60.6's now-moot
> refit note), and deviations (60.4 was already implemented; 60.8's
> shop-grid floor needed a smaller `minmax()`/gap than first specced to
> actually hold at 375px, and its mark-row grid wasn't live-reachable
> in the same session, so it's verified by CSS/DOM analysis on the
> identical live pattern rather than by visiting a shipyard node).
>
> **Numbering note**: this spec was briefly `plans/iteration-59.md`; a
> concurrent session claimed 59 for the hull-marks iteration and overwrote
> the file, so the declutter moved here unchanged. If an implementer read
> the original 59 before the overwrite, THIS file is the same spec plus
> the 60.8 addendum.
>
> **Concurrency warning — now THREE parallel work streams**: the working
> tree carries uncommitted iteration-58 work (reactors: `powerBudget`,
> `equippedPowerGen`, `unequipBlockReason`, the "(+N from reactors)"
> suffix) AND an in-flight iteration-59 (hull marks replacing the refit —
> it DELETES `ShipyardRefitSection.tsx` and edits `reducer/shop.ts` /
> `frames.ts` / `ship.ts`). The CURRENT TREE is authoritative — re-read
> every file immediately before editing it, preserve all reactor and mark
> behavior/strings, and never revert a hunk you didn't write. If a file
> this spec names no longer exists (e.g. ShipyardRefitSection), skip that
> item and note it.

## Motivation (user direction, 2026-08-12)

> *"let's also roll up Augment slots into the items/more details section.
> particularly on mobile, i want to be very aware of every single text
> that isn't immediately necessary to the UI. for example, there's also no
> need to see the item slots or power usage in the middle of a fight...
> in fact, we don't need to see inventory by default either during combat,
> or even available command points. i want you to look at every single
> text, icon or anything and determine if it's worth keeping on each
> screen."*

A full per-surface audit was performed and the keep/demote/cut table
below was **confirmed by the user in chat** (2026-08-12), including the
three contested calls, resolved as: keep the combat cards' INIT/COMP/PLT
line, keep the HUD's three separate icon buttons, keep the weapon dice
row. Do not relitigate those in implementation; they are recorded here so
the next declutter pass starts from them.

**The key insight behind the combat items**: the mid-fight loadout
viewer is the Fleet tab (`FleetOverlay`), and unlike the prep screen's
fold it currently renders every ship's full blueprint + power meter
ALWAYS-EXPANDED. That is the "item slots and power in the middle of a
fight" the user is seeing. The fix is consistency: the same collapsed
Items fold everywhere.

## 60.1 Fold consolidation (the augment roll-up)

**`FleetPanel` (prep + shop):**

- `UpgradeBadgeRow` moves INSIDE the Items fold (prep) — it currently
  renders unconditionally on every ship card. In the shop
  (`collapsibleParts` unset) there is no fold; the badge row moves next
  to the blueprint in the always-open body there, below the header.
- The fold summary gains the augment count:
  `Items — 4/6 slots · 5/10 power · 2 augments`. Omit the augment
  segment entirely at 0 augments (no "0 augments" noise). Keep the
  existing slot/power segments; the power numbers must use iteration
  58's reactor-aware `powerBudget(frameId, equipped)`, NOT bare
  `frame.power` — the current tree already does this; keep it.

**`FleetOverlay` (the mid-fight Fleet tab, and the map/shop/event peek):**

- Wrap blueprint + power line + `UpgradeBadgeRow` in the SAME collapsed
  `<details class="parts-fold">` the prep screen uses, with the same
  summary line. Read-only remains read-only (no `onUnequip`).
- The Inventory section (currently an always-open `<h3>` + grid, or a
  "No spare parts." hint) becomes the same collapsed
  `Inventory · N spare parts` fold `FleetPanel` uses. When the inventory
  is empty, render NOTHING — an empty section needs no explanation
  (same rule as 60.2's actives cut).
- Keep: ship name, `formatStatLine` stat line, protocol rows. That is
  the at-a-glance layer the overlay exists for.

## 60.2 Combat screen

- **Cut the command-point pips + count** from the "Fleet orders" heading
  in `CombatCommandBar`. Rationale (confirmed): each tile already reads
  "1 command point" and disables at 0 CP — the resource communicates
  itself through what can be pressed. Remove the `.command-points` CSS
  too if nothing else uses it (grep first).
- **Cut the "No active parts equipped." placeholder**: when
  `activeAbilities` is empty, don't render the Ship actives section at
  all (heading included).
- **Demote order tile descriptions to the tooltip on ALL widths** — they
  are already tooltip-only on mobile (53.3); desktop follows. The
  `title` attr already carries the text; delete the visible
  `.card-tile__desc` span from ORDER tiles only. Ship actives KEEP their
  visible description (parts don't have a fixed, memorable menu of 4).
- **Fix the stale toggle label**: "Show actives (N)" / "Hide actives"
  predates fleet orders sharing the dock. New copy: collapsed →
  `Orders & actives`, expanded → `Hide orders & actives`.
- Keep, explicitly (confirmed decisions): the INIT/COMP/PLT stat line on
  combat ship cards; the weapon dice row; the priority hint; the pick
  hint + Cancel; the verdict heading; the outspeed ⚡×2 and priority ◎
  marks; the "Armed"/"Spent"/"Pick a target" tile kind-lines.

## 60.3 Prep screen

- **Cut the "Command points: N — including Exploit weakness" line**
  (`PrepScreen`). Static per-commander information repeated before every
  fight; the orders dock shows the same thing where it is spendable.
  Clean up now-unused imports (the constants stay exported from
  reducer.ts — the reducer uses them).
- Augment badges: covered by 60.1 (into the fold).
- Keep: cargo hint, the no-weapon warning, the missile-only warning,
  the info-dot, protocol rows, the Items and Inventory folds.

## 60.4 HUD bar

- **Commander name text hides on mobile (≤720px)** — crest icon only;
  the `title` tooltip keeps name + description. Desktop unchanged.
  CSS-only, no markup change.
- Keep everything else (confirmed): Map button, DAILY chip, 📖 / ? / ⚙
  as three separate buttons, heat pips, credits.

## 60.5 Map screen

- The standing instruction hint (the `.hint` paragraph near the top of
  `MapScreen` — read it in place first) **demotes to first-run
  onboarding**: either a `'map'` `OnboardingKey` via the existing
  mechanism, or an info-dot on the map panel matching `FleetPanel`'s
  pattern. Implementer's choice; say which and why.
- Keep: sector heading, escalation badges, the armada warning,
  fled-node tooltips, cargo tooltips.

## 60.6 Shop / reward / event screens

- No cuts — audited clean, except: the refit/marks section's explainer
  paragraph (whichever the tree has by the time you get there — the
  hull-marks session replaces `ShipyardRefitSection` with a mark
  section) demotes to a heading `title` or info-dot. If the section is
  mid-replacement, skip and note it rather than colliding.

## 60.7 Verification

- `npx tsc -b --force` clean project-wide, `npx vitest run` green
  (run once BEFORE changing anything to establish the current tree's
  baseline count — concurrent work moves it), `npx vite build` clean.
- **Mobile changes get live browser verification** (CLAUDE.md, exception
  added 2026-08-12): real 375×812 viewport — the Fleet tab's collapsed
  folds mid-fight, the orders heading without CP pips, the HUD without
  the commander name, the shop's ≥2-column grid (60.8), and the e695163
  no-reflow invariants still holding through an order pick
  (documentElement.scrollHeight, .combat-screen computed padding-bottom,
  scrollY identical before/during/after). Record the numbers.
- Desktop-only changes: describe what to look at in the status notes.
- Do NOT run balance scripts — presentation-only. If a change would move
  a balance number, it is out of scope; stop.

## 60.8 Addendum (user direction, 2026-08-12, mid-implementation)

Three further UI directives, same confirmed-by-user status as the rest:

> *"for shops, make it so that the shop displays in two columns at a
> minimum... keep the text description to a minimum — we don't need to
> restate '1 weapon 1 systems 1 universal' when it is shown already in
> the graphic right below. i do like the flavour text... instead of
> having power be shown as a hp bar, i rather it have an electricity
> icon, and just put the fraction, 3/5 or whatever power usage"*

1. **Shop grids: two columns minimum, at every width.** The shipyard
   currently renders its card sections in a single column and the page
   runs very long. Every shop card section (the hull rack / "Ships",
   part offers, the mark/refit rows) lays out as a grid with a
   **2-column floor even at 375px** — `repeat(auto-fill, minmax(~150px,
   1fr))` sized so two always fit; more columns on wider screens.
   Live-verify the 2-column floor on mobile.
2. **Frame-card copy: cut mechanical restatements, keep flavour.**
   Blurbs like "3 slots, at most 1 weapon" duplicate what the SlotRow
   graphic under them already shows. Edit `frames.ts` blurbs to strip
   slot/weapon-count arithmetic and keep the character line (the user
   explicitly likes "Fast and fragile — dodges the first hit of each
   fight"). Grep every blurb; the wiki renders them too, which is fine —
   its tables carry the numbers. CAUTION: two other sessions are editing
   `frames.ts` (58's power values, 59's marks) — targeted single-line
   edits only, re-read the file first.
3. **Power display: electricity icon + fraction, not a bar.** Replace
   `PowerPipRow`'s pip meter with a bolt icon (⚡, or an SVG bolt
   consistent with `PartIcon`'s family) followed by the plain fraction
   `3/5`. Keep the component name and `{used, budget}` API so every call
   site (FleetPanel, FleetOverlay, ShopScreen frame cards, the
   mark/refit rows, anything 58/59 added) inherits the change without
   edits. The "(+N from reactors)" suffix stays wherever it renders. The
   separate "Power" word label can go where the bolt is unambiguous.
   Remove the orphaned pip CSS if nothing else references it.

**Explicitly NOT in this iteration** (game data, not presentation): the
user's "swap Interceptors to a missile weapon" note — handled separately
outside this pass, since it changes fight outcomes.

## Out of scope

- Any reactor/power LOGIC (58) or mark LOGIC (59) — display
  consolidation only, preserving their strings.
- The three confirmed keeps (combat stat lines, HUD button trio, weapon
  dice) — a future pass can revisit with new evidence.
- EnemyPanel/onboarding popups/tutorial content — separately owned, no
  complaints against them yet.

## Status notes (implementer, 2026-08-12)

**Concurrency, as warned.** This session ran alongside iteration-58
(reactors) and iteration-59 (hull marks) the entire time. Both finished
mid-pass: `ShipyardRefitSection.tsx` was deleted and `ShipyardMarkSection.tsx`
took its place in `ShopScreen.tsx`; `frames.ts` picked up `frameDisplayName`/
mark-aware slot-layout calls in `FleetPanel.tsx`/`FleetOverlay.tsx` that I
didn't write. None of that was reverted — every hunk that showed up under me
mid-edit was re-read and left alone, per the brief.

**60.1–60.7 (the original declutter spec, unchanged by the renumbering).**
All landed as specced:
- `FleetPanel.tsx`: `UpgradeBadgeRow` moved inside the Items fold (prep) /
  into the always-open body next to the blueprint (shop); fold summary
  gained the `· N augments` segment, omitted at 0.
- `FleetOverlay.tsx`: blueprint + power line + augments wrapped in the same
  `parts-fold` prep uses; Inventory became a collapsed `Inventory · N spare
  parts` fold that renders nothing when empty.
- `CombatCommandBar.tsx`: cut the CP pips + count from the "Fleet orders"
  heading (and the now-unused `.command-points*` CSS); cut the "No active
  parts equipped." placeholder by not rendering the Ship-actives section at
  all when `activeAbilities` is empty; deleted the `.card-tile__desc` span
  from ORDER tiles only (title attr still carries it; actives keep their
  visible description); toggle copy is now `Orders & actives` / `Hide
  orders & actives`. Also removed the now-dead mobile-only
  `.combat-orders .card-tile__desc { display: none }` rule (the span it
  targeted no longer exists) and updated the `.combat-command-bar`
  height-budget comment so it doesn't cite a class that's gone.
- `PrepScreen.tsx`: cut the "Command points: N — including Exploit
  weakness" line and its now-unused `BASE_COMMAND_POINTS`/
  `SPYMASTER_COMMAND_POINTS` import (both stay exported from `reducer.ts`,
  used by the reducer itself).
- `HudBar.tsx` / `styles.css`: **60.4 was a no-op** — `.hud-bar__commander-name
  { display: none }` at ≤720px was already present at HEAD (e695163), before
  this session touched anything. Verified by `git show HEAD:src/styles.css`.
- `MapScreen.tsx`: the standing `.hint` paragraph demoted to an info-dot on
  the sector heading, carrying the same per-mode text as a tooltip.
  **Judgment call**: info-dot over the `OnboardingKey` route. Reasoning —
  the onboarding mechanism (`onboardingProgress.ts`) is built for
  contextual, trigger-fired, one-shot popups (dice roll, missiles,
  piloting, orders), each wired into a specific game-state check in
  `CombatScreen`. The map hint is a standing "how this screen works" note
  shown on every visit, not tied to a trigger condition — bolting it onto
  the popup mechanism would mean adding a `'map'` key, a mount-time
  `useEffect`, and a new popup component for a single paragraph, when
  `FleetPanel`'s existing info-dot pattern (already used for its own
  "click a ship to select it..." instructions) does the identical job with
  a one-line JSX change and zero new state. Added `.map-screen__sector
  .info-dot` and a shared `h3 .info-dot` spacing rule (the latter reused by
  60.6 below).
- `ShipyardRefitSection.tsx`: demoted the explainer paragraph to a
  heading info-dot, matching the pricing-fact-stays-discoverable
  instruction — this landed **before** the concurrent hull-marks session
  deleted the file outright partway through this session. No harm done
  (dead code was briefly slightly more polished dead code); noted here
  rather than treated as wasted, since the replacement,
  `ShipyardMarkSection.tsx`, independently arrived at the exact same
  info-dot pattern for its own explainer — 60.6 is satisfied by their
  file now, nothing further needed from this pass.

**60.8 addendum:**
1. **Shop grids, 2-column floor.** `.shop-screen__offers`,
   `.shop-screen__frames`, and `.shop-screen__marks` are now
   `display: grid; grid-template-columns: repeat(auto-fill, minmax(125px,
   1fr)); gap: 10px`; `.frame-card` no longer fixes `width: 180px` (it
   stretches to its grid cell instead — was the reason a 2-column track
   wasn't enough on its own to produce 2 visible columns). **Deviation**:
   the spec's own suggested `minmax(~150px, 1fr)` does NOT hold 2 columns
   at 375px in this app's actual layout — `.app`'s 16px side padding +
   `.shop-screen`'s 24px padding leaves only ~293px of content width, and
   2×150px+12px gap = 312px, wider than that. Measured this live (see
   below) before landing on `minmax(125px, 1fr)` / `10px` gap, which
   leaves comfortable headroom (2×125+10=260px vs. 293px available) and
   still only fits 2, not 3, at this width (3×125+20=395px). `mark-row`
   was restyled from a side-by-side flex row (ship name + button on one
   line) to a stacked column — the old layout assumed the old full-width
   flex row, not a ~140px grid cell.
2. **Frame blurbs.** All 17 `frames.ts` blurbs edited as targeted
   single-line replacements (re-read the file immediately before each
   edit; one edit — Picket's — needed a second read mid-pass because the
   concurrent frames.ts work had already changed "no dedicated weapon
   slot at all" to "no dedicated weapon slot" under me between reads).
   Every blurb had its slot-layout arithmetic ("2 weapon, 1 universal
   slot", "6 slots (2 dedicated weapon)", etc.) cut; every flavour/innate
   sentence kept, usually rejoined with an em dash where the arithmetic
   used to sit between two clauses. Interceptor's now reads exactly the
   wording the user cited in the addendum: "Fast and fragile — dodges the
   first hit of each fight." Grepped for test assertions on `.blurb` text
   first — none exist (`ShopScreen.tsx` is the only consumer of the field
   besides the wiki, which the spec says is fine to leave carrying the
   numbers).
3. **Power display.** `PowerPipRow.tsx` rewritten to render a
   `PowerBoltIcon` (new export in `PartIcon.tsx` — a lightning-bolt
   zigzag, deliberately a different shape from `ActiveSparkIcon`'s 8-point
   burst so "power" and "has a once-per-combat button" don't share a
   glyph) followed by the plain `{used}/{budget}` fraction, replacing the
   segmented pip bar. Component name and `{used, budget}` props unchanged,
   so `FleetPanel`, `FleetOverlay`, `ShopScreen`'s frame cards, and the
   (now-gone) refit rows all inherited the new look with zero call-site
   changes beyond what 60.1 already touched. In `FleetPanel`/
   `FleetOverlay` specifically, dropped the separate "Power" word label
   and the duplicate `{power} / {budget}` text span that used to sit next
   to the pip bar (redundant now that the bolt+fraction says the same
   thing) but kept the "(+N from reactors)" caption as a sibling span.
   Removed the now-orphaned `.power-pips`/`.power-pips__pip*` CSS (grepped
   first — nothing else referenced it) and `.blueprint__power-label`/
   `.blueprint__power-value` (same check), replaced by `.power-fraction*`
   and `.blueprint__power-reactor`.

**Mobile verification (375×812, `eclipse-roguelike` launch config, actual
port 5174 — 5173 was occupied as warned).** All measured via
`javascript_tool` DOM/computed-style calls (screenshots aren't supported in
this Browser pane, as noted in the brief) against a real playthrough
(Continue run → live combat → map → store):
- Fleet tab mid-fight: the ship's Items `<details>` fold is closed by
  default (`open: false`), summary reads `"Items4/6 slots · 5/8 power"`
  (0 augments this run, segment correctly omitted); Inventory fold absent
  entirely (0 spare parts this run — confirms the "render nothing when
  empty" rule, not just a hidden fold).
- Orders heading: `document.querySelector('.combat-orders h3').textContent
  === 'Fleet orders'`, zero `.command-points` elements, all 4 order tiles
  have no `.card-tile__desc` child; the one active-ability tile present
  does. Toggle button read `"Hide orders & actives"` while the dock was
  open.
- HUD: `.hud-bar__commander-name` present in the DOM (`"The Spymaster"`)
  but `getComputedStyle(...).display === 'none'`.
- No-reflow invariants through an order pick (Brace): before picking —
  `scrollHeight 812`, `.combat-screen` `padding-bottom: 304px`, `scrollY
  0`. During picking — `padding-bottom` unchanged at `304px`, `scrollY`
  still `0` (the invariant the e695163 fix actually guarantees — the
  fixed-position dock's reservation never swings, so no resize spasm).
  `scrollHeight` DOES grow to `883` while picking, settling after a tick;
  traced this to the (explicitly kept, 60.2) pick-hint paragraph + Cancel
  button that `CombatScreen.tsx` renders below the theater during a pick —
  normal-flow content, not the fixed dock, so it's additive height, not a
  spasm. `CombatScreen.tsx` is a file I never touched this pass (confirmed
  via `git diff --stat`), and this exact behavior — including the 71px
  figure — reproduced identically both before and after every one of my
  edits, so it predates this session and isn't a regression from it.
  Reverts to `812`/`0` cleanly on cancel or on completing the pick.
- Shop 2-column floor: on a live Store visit, `.shop-screen__frames`
  (2 hull offers) and `.shop-screen__offers` (8 items) both computed
  `grid-template-columns: "141.5px 141.5px"` — 2 columns, confirmed via
  `firstRowColumnCount: 2` on both. **Not independently live-verified**:
  a Shipyard node (needed for `.shop-screen__marks`) wasn't reachable
  within this session's playthrough before time ran out; it uses the
  identical grid rule inside the same `.shop-screen` padding context as
  the two grids that WERE measured live, so the math transfers, but this
  is a documented gap rather than a literal measurement — worth a spot
  check next time a shipyard is reachable.

**Files touched**: `src/components/FleetPanel.tsx`,
`src/components/FleetOverlay.tsx`, `src/components/CombatCommandBar.tsx`,
`src/components/PrepScreen.tsx`, `src/components/MapScreen.tsx`,
`src/components/ShipyardRefitSection.tsx` (edited, then deleted out from
under this session by iteration-59 — see above),
`src/components/PowerPipRow.tsx`, `src/components/PartIcon.tsx`,
`src/game/frames.ts` (blurbs only), `src/styles.css`. `HudBar.tsx` was
read but not edited (60.4 already done at HEAD).
