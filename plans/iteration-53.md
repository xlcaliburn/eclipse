# Iteration 53 — Mobile responsiveness pass (specced 2026-08-08)

> **Status: implemented (2026-08-12).** All four milestones landed: 53.1
> re-derived the command bar's mobile height budget (300px → 280px, stale
> comment corrected — see `styles.css`'s `.combat-command-bar` ≤720px
> rule); 53.2 auto-collapses the bar on pick entry and restores it on
> completion/cancel/round-change (`CombatScreen.tsx`), scrolls the theater
> into view on pick entry, and replaces the "click the tile again to
> cancel" hint text with an always-reachable Cancel button on the hint
> line; 53.3 picked option A (a narrower, description-less mobile-only
> tile for the orders row specifically — `.combat-orders .card-tile`,
> 128px → 92px); 53.4's sweep bumped the picking/armed/pick-target glow
> states to a 2px border at mobile sizes and confirmed the rest (CP pips,
> prep-screen CP line, `fightsWithdrawn`) already clean. 808/808 tests,
> `tsc -b --force` and `vite build` clean. No browser pass, per the
> standing policy — the user verifies live. See "Implementation notes"
> at the end of this file for the full what-to-look-at list and the one
> judgment call made (53.1: both sections stayed visible — the re-derived
> budget fits both without needing to prioritize one).

## Motivation (player feedback via the user, 2026-08-08)

*"may also need to review the mobile responsiveness, especially with the
new actions being introduced."*

The "new actions" are iteration 48's fleet orders, which added a whole
section to the combat command bar and a two-step targeting flow — neither
of which was designed against the mobile layout the bar already had.

**Standing constraint**: per CLAUDE.md, no live browser verification. The
implementer cannot screenshot or measure this in a real viewport; the
user verifies UI manually. So this spec is written as *specific, reviewable
CSS/markup changes with stated intent*, not "look at it and fix what
seems off." Where a change genuinely needs a visual judgment call, the
spec says so and leaves it to the user rather than guessing.

## Grounding (read at spec time, 2026-08-08)

`styles.css`'s `@media (max-width: 720px)` block for
`.combat-command-bar` (around line 2242):

- The bar is `position: fixed`, pinned above the 56px tab bar
  (`bottom: calc(56px + env(safe-area-inset-bottom, 0px))`, `z-index: 39`).
- `max-height: 300px; overflow-y: auto`, with a comment justifying 300px
  as covering *"both sections (hand + ship actives) at one row each"* —
  written when the bar held the reaction-card hand plus actives. The
  hand was removed in iteration 35; **fleet orders took its place in
  iteration 48 without the cap being re-examined**, and the orders
  section is taller than the hand was (a `.command-points` pip row now
  sits inside its `<h3>`).
- Each section's `.combat-hand__cards` is `flex-wrap: nowrap; overflow-x:
  auto` — one horizontally-scrolling row per section, deliberately, so
  the bar's height stays constant regardless of item count.
- `.combat-command-bar .card-tile` is `width: 128px` with a 2-line
  clamped `.card-tile__desc`.

## 53.1 The command bar's height budget

The 300px cap and its comment are now both stale. Concretely:

- Update the comment to name the real current contents (Fleet orders +
  Ship actives), and to note that the orders heading carries an inline
  `.command-points` pip row the old hand heading did not.
- Re-derive the cap rather than keeping 300px by inheritance. Two
  section headings + two card rows + the toggle strip + padding is the
  budget; state the arithmetic in the comment so the next person can
  re-check it instead of guessing again.
- **Judgment call for the user, not the implementer**: whether both
  sections should be visible at once on a small phone, or whether the
  orders row should take priority (actives are 1-per-combat and often
  empty; orders are every-round). If a choice is needed, prefer showing
  orders and letting actives scroll — but flag it rather than deciding
  silently.

## 53.2 The targeted-order pick flow is the real problem

Brace and Exploit weakness use: tap the tile in the bar → the theater
enters pick mode → tap a ship card in the theater. On desktop both are
on screen. On mobile the command bar is *fixed over* the theater, and
the ship cards may be scrolled out of view entirely — so the player taps
"Brace", and then must scroll a partially-occluded theater to find a
target, with a pinned bar covering the bottom ~300px.

Options, in the order I'd try them:

1. **Auto-collapse the bar when a pick starts.** `CombatScreen` already
   owns both `pickingOrder` and `handCollapsed` — collapsing on pick
   entry and restoring on pick completion/cancel is a few lines in the
   existing state, no new machinery, and it frees the whole viewport for
   the theater exactly when the player needs it. Strongly preferred.
2. **Scroll the theater into view on pick entry** (`scrollIntoView` on
   `theaterRef`). Complements (1); cheap.
3. Make the pick-mode hint (`.combat-order-pick-hint`) sticky/visible
   while picking — it currently renders below the bar in document order
   and may be off-screen on mobile, which is where the "click a ship to
   complete this order" instruction lives.

Also verify the cancel affordance survives: cancelling means tapping the
same tile again, which requires the bar — so if (1) collapses the bar,
the toggle must still be reachable, and tapping the toggle must not be
mistaken for cancelling. Consider a cancel control on the hint line
instead, which is the more discoverable place for it on a phone anyway.

## 53.3 Order tiles at 128px

Four order tiles at `width: 128px` in a nowrap row is ~512px of content
in a ~360px viewport, so two tiles are always off-screen behind a
horizontal scroll — including, for the Spymaster, the exclusive Exploit
weakness tile that is the whole point of his kit.

Options (pick one, note which and why):

- A tighter mobile-only tile for orders specifically (name + cost, with
  the description in the `title`/tooltip only) — orders have short,
  memorable names, unlike parts.
- A 2×2 wrap for the orders row specifically, overriding the shared
  `nowrap`. Costs vertical space, which 53.1 is already budgeting.
- Leave the scroll but add a visible affordance that it scrolls.

## 53.4 Sweep the rest of the new surfaces

Check and fix as needed, each at ≤720px:

- `.command-points` pips inside an `<h3>` — verify they don't force the
  heading to wrap awkwardly at small widths.
- `.card-tile--picking` / `--armed` states: both are box-shadow glows;
  confirm they read at mobile tile size (they may need a border-width
  change rather than glow alone on a small tile).
- `.combat-ship--pick-target` glow on ship cards in a cramped theater —
  same question, since the theater is at its tightest on mobile.
- The prep screen's new "Command points: N" line (iteration 48).
- `EndScreen` and the wiki after iteration 51 removed `fightsWithdrawn`
  — confirm no empty row or dangling label remains at mobile widths.

## Verification

`npx tsc -b --force` clean project-wide, `npx vitest run` green (808 at
1d2a920 — this pass is CSS/markup and should not change the count unless
a component test needs updating), `npx vite build` clean.

**No browser passes** — the user verifies visually. The implementer's
status notes must therefore be explicit about what was changed and what
the intended visual result is, so the user knows what to look at:
list each change with the viewport width it targets and the expected
before/after.

## Implementation notes (2026-08-12)

### 53.1 — height budget re-derived, 300px → 280px

`styles.css`, `.combat-command-bar`'s `@media (max-width: 720px)` block.
The comment now spells out the full arithmetic (toggle strip + bar padding
+ two section margins/headings/rows) instead of asserting a number by
inheritance — see the comment itself for the line items. Net: 245px of
real content + ~35px headroom (font scaling, a wrapped ship-owner label)
= 280px, down from the stale 300px. `.combat-screen--dock-open`'s
matching `padding-bottom: calc(280px + 24px)` was updated to stay in sync
(there's a comment cross-referencing the two so a future change to one
doesn't silently desync from the other).

**Judgment call (flagged per the spec, not decided silently)**: the spec
asked whether both sections (Fleet orders + Ship actives) should stay
visible together on a small phone, or whether orders should take
priority with actives pushed to scroll. The re-derived budget — helped by
53.3's narrower, description-less orders tile, which shrinks that row's
height — fits both sections with headroom to spare, so no prioritization
was needed and both stay visible, matching the spec's stated fallback
preference anyway. **What to look at**: at ≤720px width, open combat and
confirm the pinned dock (open state) shows "Fleet orders" AND "Ship
actives" both without vertical clipping or an unexpected inner scrollbar
kicking in on ordinary content (that inner `overflow-y: auto` should stay
dormant — it's a safety net, not the normal path).

### 53.2 — auto-collapse on pick, theater scroll-into-view, hint Cancel button

`CombatScreen.tsx`: `handleOrderTileClick` now collapses the dock
(`setHandCollapsed(true)`) the moment a Brace/Exploit-weakness pick
starts, and a new `cancelPick()` (shared by the tile-toggle-off path and
the new Cancel button) restores it. `handleOrderPick` (a completed pick)
also restores it. The round-boundary cleanup effect restores it too, for
the edge case of advancing the round mid-pick without resolving it. A new
effect calls `theaterRef.current?.scrollIntoView(...)` whenever
`pickingOrder` becomes non-null (respects `prefers-reduced-motion` — no
smooth-scroll animation when that's set).

The pick-mode hint (`.combat-order-pick-hint`) no longer tells the player
to "click the tile again to cancel" (the tile is now hidden behind the
just-collapsed dock) — it renders an actual `Cancel` button inline instead,
styled in `styles.css` as an outlined warning-hued chip next to the hint
text.

**What to look at**: at ≤720px width, open combat, scroll the log so the
theater is out of view, then tap "Brace" or "Exploit weakness" in the
command bar. Expect: the dock collapses to just its toggle strip, the
theater scrolls into view, the ship cards are tappable without further
scrolling, and a "Cancel" button sits next to the pick-mode hint text
below the theater. Tapping Cancel (or completing the pick by tapping a
ship) should reopen the dock. This is a view-state change only — no
combat/engine logic changed.

### 53.3 — compact mobile order tile (option A)

Picked **option A** (tighter mobile-only tile, description dropped to the
`title` tooltip) over the 2×2 wrap or a scroll affordance: orders are a
fixed set of four short, memorable names ("Brace", "Attack run", …) unlike
parts, so the description is the cheapest thing to cut, and shrinking the
tile also helps 53.1's height budget rather than costing it more vertical
space (the 2×2 wrap option's stated tradeoff). `styles.css`:
`.combat-command-bar .combat-orders .card-tile` is 92px wide (down from
the shared 128px) with `.card-tile__desc` hidden via `display: none`; ship
actives tiles are untouched (still 128px, description visible — part
names don't reliably disambiguate the way order names do).

**What to look at**: at ≤720px width, open combat, look at the "Fleet
orders" row specifically. Tiles should be visibly narrower than the "Ship
actives" row below it, showing only a kind label ("1 command point" /
"Pick a target" / "Armed") and the order name — no description text. All
four order tiles (or three, without Spymaster) should require noticeably
less horizontal scroll than before to reach the last one. The description
is still available via a long-press/hover tooltip (the button's `title`
attribute is unchanged).

### 53.4 — sweep results

- `.command-points` pips in the "Fleet orders" `<h3>`: verified, no
  change made. CP is capped at 2–3 (`BASE_COMMAND_POINTS` /
  `SPYMASTER_COMMAND_POINTS` in `reducer.ts`), and `inline-flex`'s default
  `flex-wrap: nowrap` already prevents the pip row itself from wrapping.
  Existing comment's claim ("row is always short... no wrap handling
  needed") holds.
- `.card-tile--picking` / `--armed`: bumped `border-width: 2px` at
  ≤720px (was the shared 1px). **What to look at**: while picking Brace,
  the armed order tile (after a stance order like Attack run is issued)
  and the picking-state tile should show a visibly thicker colored border
  at mobile tile size, not just a faint glow.
- `.combat-ship--pick-target`: same border-width bump, at ≤640px (the
  theater's own mobile breakpoint) via `.combat-ship--pick-target {
  border-width: 2px; }`. **What to look at**: mid-Brace-pick at ≤640px
  width, pickable ship cards in the theater should show a clearly thicker
  warning-colored border, not just a glow easy to miss against the
  cramped mobile ship card.
- Prep screen's "Command points: N" line: plain `<p className="hint">`
  text, no special layout class — wraps normally like any other hint
  line. Confirmed no fix needed.
- `EndScreen` / wiki `fightsWithdrawn`: confirmed fully absent from
  `src/` (`grep -r fightsWithdrawn src` returns nothing) — iteration 51's
  removal was already complete, no dangling row/label found at any width.

### Verification

`npx tsc -b --force`: clean, no exclusions. `npx vitest run`: 808/808
passed (unchanged from the 1d2a920 baseline — this pass didn't need any
test updates). `npx vite build`: clean.

No live browser pass was run, per CLAUDE.md's standing policy — all of
the above is reasoned from the CSS cascade and component logic, not
observed. The "what to look at" notes above are written specifically so
the user's manual pass has a concrete checklist per change.
