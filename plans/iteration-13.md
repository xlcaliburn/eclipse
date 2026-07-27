## Iteration 13 — complete

> **Status:** implemented and browser-verified 2026-07-27. 289/289 tests
> (+2 engine tests for priority targeting), `tsc -b` and `vite build`
> clean. Verified live: stance toggle + firing tables with zero forecast
> UI; enemy panel/fleet panel/combat cards all on the shared StatBar with
> weapon dice; combat has no "In progress"/side headings/Auto-resolve;
> clicking Scout pack #2 focused every player die on it that round, and
> clicking again released the lock. One live-caught fix: a priority ring
> stuck on a destroyed ship (engine correctly fell back; the UI now derives
> the displayed lock from the target's liveness). Die-roll fx verified
> structurally; this machine's `prefers-reduced-motion` suppresses them
> (as designed). The map threat strip now reads "Sector threats — From
> column N: …", 1-indexed, with intel guidance in copy and tooltips.

**Dice on the table.** Play feedback on the live iteration-12 build:

1. The map's escalation strip ("After col 3: unknown") is unreadable — and
   its column numbers are 0-indexed while the quest marker's are 1-indexed.
2. Enemy and player stat displays don't match — standardize one stat bar.
3. Combat should *show* dice: render the die when a roll happens, and show
   weapons as dice on ship cards instead of text lines.
4. **Remove the win-rate forecast entirely.** The Monte Carlo forecast has
   been the core instrument since iteration 1; the user now prefers
   reading per-weapon odds (the iteration-12 firing-solutions matrix
   stays) and discovering outcomes by playing. `forecast.ts` survives for
   the balance script and tests — only the player-facing forecast UI and
   the hover delta go.
5. Remove the Auto-resolve button (Next round / Withdraw / cards /
   actives remain — fights are played, not skipped).
6. **Click an enemy ship to prioritize it**: a manual priority target.
   While it lives, ALL player dice (including the siege cannon's own
   override) fire at it; when it dies or is cleared, targeting falls back
   to the doctrine stance. Set/cleared between rounds by clicking enemy
   cards in the theater.
7. Remove the "In progress" heading and the "Your fleet"/enemy-name side
   headings in combat — the silhouettes carry that information.

### Mechanics detail (6)

- `CombatState.priorityTargetIndex?: number | null` (serializable,
  additive — no save-version bump). New reducer action
  `SET_PRIORITY_TARGET { index: number | null }`, combat phase only,
  toggling off when the same index is clicked again. No RNG involved;
  determinism unaffected. Enemy targeting untouched.
- Priority beats stance and beats `weapon.targetHighest` — player intent
  outranks doctrine. Illegal/dead priority = plain stance fallback.

### UI detail

- `Die` component: SVG d6 with standard pip layout (1–6). Used by (a) the
  theater fx layer — every roll spawns a die near the shooter, tinted by
  hit/miss, alongside the existing tracer; (b) `WeaponDiceRow` — each
  weapon renders as `diceCount` dice showing the weapon's DAMAGE as its
  face, solid for cannons, dashed ring for missiles (tooltip carries the
  old text).
- `StatBar` component: HP pips + init/computer/shield with the existing
  part-type glyphs, identical markup for enemy panel, fleet panel, and
  combat cards.
- Map escalation strip: retitled "Sector threats", 1-indexed columns,
  "From column N: unknown enemy upgrade — decrypt via intel" (or the
  revealed name + effect); quest badge reworded to "target: column N,
  lane M".

Verification: tsc/test/build green + live browser pass (dice visible on
cards and in the replay, priority ring on a clicked enemy and dice
actually retargeting, no forecast/auto-resolve anywhere, matching stat
bars both sides).
