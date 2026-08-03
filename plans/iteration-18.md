## Iteration 18 — complete

> **Status:** implemented and browser-verified 2026-08-03. 401/401 tests
> (16 new across daily/shipNames/reducer/persistence suites), `tsc -b` and
> `vite build` clean. Verified live end-to-end: landing shows the Daily
> section with today's date; starting it consumes the attempt (record
> written), boots from the deterministic date seed, and shows the DAILY
> chip in the HUD; the combat log reads "Picket drones #1 rolls 1 —
> misses **ISV Osprey**"; the prep fleet card shows name + frame tag; the
> victory end screen renders the full summary (fights won/withdrawn,
> damage 64/38, "Ships lost: ISV Kestrel", "Most kills: ISV Osprey — 7")
> plus the formatted share block; finalization clears the daily slot and
> writes outcome + share text to the record; reloading shows the locked
> "come back tomorrow" landing state with the result and Copy button; and
> a standard run started afterward saves to its own slot (its own seeded
> flagship, "ISV Quasar") with the daily record intact.
>
> Notes: the Copy button's clipboard write is rejected in the hidden
> verification pane (browsers require focus for `navigator.clipboard`) and
> the guarded catch handles it — expected to work in any real focused
> tab; the share `<pre>` is user-selectable as the manual fallback. The
> end-screen verification used the established patched-save technique
> (exercises the real render pipeline against a controlled state).

**The daily run & the fleet remembers.** Two features sharing one theme —
runs that are memorable and comparable — and one set of plumbing (run
counters):

1. **Daily run:** a seeded challenge, same sector for everyone on the same
   date. Iteration 9's full-run determinism makes this nearly free: seed =
   FNV-1a hash of the local date string (`YYYY-MM-DD`). One attempt per
   day (consumed on start, resumable mid-run via its own save slot);
   result recorded with a copyable share text. No backend, no leaderboard
   — the share text IS the social layer.
2. **The fleet remembers:** seeded ship names ("ISV Resolute", not
   "Interceptor #2"), per-ship kill counts + fights survived, and a real
   run summary (fights won/withdrawn, ships lost by name, damage
   dealt/taken, MVP) on the end screens — filling the "ships lost" hole
   iteration 10's notes flagged.

### Mechanics pinned

- **Seed derivation** (`src/game/daily.ts`, pure): FNV-1a over the date
  string → uint32 (0 coerced to 1). The `Date` call lives in App.tsx —
  `src/game/` stays `Date`-free per the no-stray-randomness ban.
- **Attempt rules:** starting today's daily writes a `DailyRecord`
  (`eclipse.daily.v1`) with the date; victory/defeat/abandon finalizes it
  with outcome + share text. A finalized record for today = no replay
  until tomorrow (standard runs unaffected). The daily uses its own save
  slot (`eclipse.save.daily.v1`) so it can coexist with a standard run;
  `saveRun`/`loadRun`/`clearRun` gain a slot parameter.
- **Determinism caveat, accepted:** same seed + same choices = same
  outcomes; different choices diverge. That's the point — the daily
  compares decisions, not luck.
- **Share text** (pure, from RunState): date line, outcome line
  (🏆/💥/🏳️ + act + column), stats line (⚔️ won · ↩️ withdrawn · ☠ lost).
  No per-node route strip — `visited` resets at the act transition, so a
  full-route strip would silently lie about act 1; scope-cut rather than
  fabricate.
- **Ship names:** `shipName(seed, counter)` — "ISV " + a 48-name list,
  indexed by `(seed + counter * 7919) % 48` (7919 prime, coprime with 48
  → no repeats for 48 consecutive commissions). Assigned at fleet
  creation (initial Flagship = counter 0), the Warlord's free
  Interceptor, and BUY_SHIP, via a `shipsCommissioned` counter on
  RunState — derived from the map seed, NOT the rng stream, so naming
  never perturbs existing draw sequences.
- **Stats attribution** (from the fight's `CombatEvent[]` at
  CONTINUE/WITHDRAW/defeat): damage dealt/taken summed from roll events
  (arc/prow/rift side-damage flows through part-effect events without
  amounts — undercounted by design, noted here); kills credited to the
  last player hit-roll whose target matches the destroyed ship (prow/arc
  edge cases fall back to unattributed rather than misattributed).
  `fightsSurvived` increments for surviving ships on wins AND
  withdrawals (you survived the fight that happened).
- **Compatibility:** all new fields (`PlayerShipState.name/kills/
  fightsSurvived`, `RunState.mode/dailyDate/shipsCommissioned/runStats`)
  are OPTIONAL with `??` fallbacks at every read — old saves keep
  loading (their ships fall back to "Frame #N" labels, stats start
  counting from resume), ~30 test fixtures stay untouched, and
  SAVE_VERSION does not bump. This deliberately diverges from the
  bump-on-change precedent because every new field degrades gracefully;
  the v2 postmortem's hazard was REQUIRED-at-render fields, which none
  of these are.
- **App wiring:** a `LOAD_STATE` reducer action (pure state replacement)
  lets the landing screen choose between slots; `NEW_RUN` gains optional
  `{ seed, mode, dailyDate }`. The landing screen adds a Daily section
  (start / continue / today's result + copy); the HUD shows a DAILY
  chip; end screens show the run summary and, for dailies, the share
  text with a copy button.

### Tests

- `shipName`: deterministic, prefixed, 48 consecutive counters distinct.
- `dailySeed`: same date → same seed; different dates differ; nonzero.
- `dailyShareText`: fixed synthetic state → exact expected string.
- Reducer: NEW_RUN with a fixed seed ≡ initialRunState with that seed;
  daily fields set; Flagship (and Warlord Interceptor, and bought ships)
  named deterministically; LOAD_STATE replaces wholesale.
- Stats: a scripted won fight increments fightsWon, credits kills to the
  right ship, records lost ships by name, bumps fightsSurvived only for
  survivors; WITHDRAW increments fightsWithdrawn and still processes
  kills/survival; defeat folds damage totals.
- Persistence: the two slots are independent (save/load/clear one never
  touches the other); DailyRecord roundtrip.
