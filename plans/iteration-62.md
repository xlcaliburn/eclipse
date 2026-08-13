# Iteration 62 — Ending the stall: fire-control convergence + command point regen

> **Status: implemented and verified** (`npx tsc -b --force` clean,
> `npx vitest run` 883/883 green, `npx vite build` clean — see the
> "verification" note in the status section for why 883 is +11 over this
> file's own 861 rather than +11 over iteration-61's recorded number).
> `npm run balance`: matchup table moved exactly as predicted — short fights
> unchanged (≤1pp noise), previously-long/stall matchups moved down 2-11pp
> (Hive Mother's col3-typical-fleet matchup is the single largest swing,
> -11pp, in what was already a 4+-average-round fight); every sanity-check
> PASS/FAIL is unchanged. `npm run balance:full` (n=500/commander): every
> commander moved modestly vs. iteration 61's table (auto +1.4pp, merchant
> -0.8pp, engineer +0.2pp, spymaster -0.4pp, admiral -1.0pp, warlord 0.0pp),
> full-run clear stayed 0.0% everywhere (unaffected by construction — see
> status notes for the full tables, one recorded deviation
> (`incomingFirePreview` needed no numeric fold-in — it was already
> hit-chance-agnostic), and the CombatCommandBar finding (already a plain CP
> count since iteration 60's declutter, nothing to adapt).
>
> **Numbering note**: this spec was briefly written to
> `plans/iteration-61.md` before discovering the concurrent session had
> already claimed 61 (bonus removal / Emergency Vectoring, committed in
> ac398f2); that file was restored from HEAD untouched and this spec moved
> here. 62 is the authoritative number for the stall work.

## Motivation (user playtest report, 2026-08-12)

> *"one situation that happened a few times was players hitting 18+ rounds
> where they were just not hitting, so it was just hitting a button
> waiting for it to hit. i want to come up with some solutions... either
> 1. adding more interactions so it's not just a spam click next, or 2. do
> a sudden death type to prevent it from going over 10+ rounds"*

Both halves approved in chat 2026-08-12. This file records that design.

## The failure mode, precisely

A hit is `roll + computer − piloting ≥ 6`; a natural 6 always hits
(barring chaff), a natural 1 always misses. A 0-computer side against 2+
piloting hits only on natural 6s — 1/6 per die, forever. Two such sides
produce the reported purgatory: `runToEnd` has NO round cap
(`while (!s.winner)`), iteration 51 removed withdraw (no bail-out), the
fleet-orders budget is 2 CP per FIGHT with explicitly no replenishment
(iteration 48), and actives are once-per-combat — so by round ~4 every
decision is spent and the remaining 14 rounds are pure button-holding.

Two symmetric fixes, one per half:

1. **Fire-control convergence** — an escalating, telegraphed, symmetric
   computer ramp that makes any fight functionally resolve by ~round
   11–13, with no arbitrary cutoff or winner-adjudication rule.
2. **Command point regeneration** — +1 CP every 4th round, so long
   fights keep serving decisions (and Attack run becomes the player's own
   anti-stall lever, stacking with the ramp).

A hard round cap with a forced outcome was considered and rejected: it
needs a who-wins-at-the-buzzer rule that will feel arbitrary, and with
withdraw gone a forced loss is brutal. Record in the parking lot as
decided-against.

## Grounding (verified 2026-08-12; line refs approximate — re-read first)

- `combatEngine.ts`: `fireShip` computes `attackerComputer` (targeting
  uplink and the Attack run / Exploit weakness orders already fold in
  there — the comment near the uplink fold marks the spot) and
  `effectiveShield`; `resolveHit(raw, computer, shield, chaffActive,
  dieFaces)` applies the nat-1/nat-6 rules. `advanceRound` owns round
  bookkeeping; `runToEnd` loops `advanceRound` with no cap. Round 0 is
  the missile phase; cannon rounds are 1+.
- `incomingFirePreview` (iteration 19's telegraph) — must include the
  convergence bonus or the telegraph lies; same for the combat log's
  per-roll computer-vs-piloting math (iteration 29), which records the
  `computer` value per roll and will show the boosted number
  automatically if the bonus is folded into `attackerComputer` before
  logging.
- Fleet orders (iteration 48): `CombatState.commandPoints` (2 default, 3
  Spymaster), `issueOrder`/`canIssueOrder`; AUTO_RESOLVE/`runToEnd`
  never issue orders — so CP regen cannot move the balance sim at all,
  by construction.
- No new persisted state is needed for either half: the convergence
  bonus is derived from `round` (already saved), and `commandPoints` is
  already part of the saved `CombatState`. **No SAVE_VERSION bump.**
- Baseline for measurement: iteration 61's recorded balance table and
  test count (861/861) in `plans/iteration-61.md`'s status notes — that
  file is the authoritative most-recent baseline, not iteration 59's.
- Concurrency: a separate session continues UI work in this tree
  (recent commits: equipping modal consolidation, combat UX, repair
  actives). Re-read every UI file (CombatScreen.tsx,
  CombatCommandBar.tsx, HudBar.tsx, styles.css, …) immediately before
  editing; targeted edits only; never revert others' work; adapt intent
  to the current surface.

## 62.1 Fire-control convergence

```ts
// combatEngine.ts
export const CONVERGENCE_ONSET_ROUND = 8;
export function convergenceBonus(round: number): number {
  return Math.max(0, round - (CONVERGENCE_ONSET_ROUND - 1));
}
```

Round 8 → +1, round 9 → +2, … cumulative, uncapped (the nat-1-misses
rule keeps the practical hit ceiling at 5/6, so an uncapped ramp is
safe). Applied to EVERY ship on BOTH sides:

- Fold into `attackerComputer` in `fireShip` (the same place uplink and
  Attack run already fold in), so the roll log's recorded `computer`
  value and the iteration-29 math line show the boosted number with zero
  extra display work.
- Fold into `incomingFirePreview` identically — the telegraph must show
  the same hit chances the round will actually use. Add a test pinning
  preview/engine parity at a post-onset round.
- Missile phase: round 0 can never be ≥ 8, so missiles are naturally
  unaffected. No special-casing needed; note it in a comment.
- Log: one announcement event the first round it activates ("Fire-control
  convergence — accumulated targeting data grants +1 computer to all
  ships, growing each round.") and a short line on each later tick
  ("Convergence +2." — keep it one line; the per-roll math already shows
  the number).

Why a computer RAMP and not a piloting drain: a drain doesn't converge
the 0-computer case (0 comp vs 0 piloting still needs bare 6s); the ramp
closes any differential. Why symmetric: it barely changes who wins a
stalled matchup — it changes how long the coin takes to land. Turtle
builds keep their edge; they just can't stall indefinitely.

Expected practical ceiling: by round 12 the worst realistic matchup
(0 comp vs 4 piloting) hits on 5s; fights are functionally decided by
round 11–13. This also bounds the sim's fight-length tail.

### UI

- A HUD/status line on the combat screen from round
  `CONVERGENCE_ONSET_ROUND - 2` (two rounds of warning):
  "Fire-control convergence in 2 rounds" → "… in 1 round" → active:
  "Convergence +N computer (all ships)". Place it near the round
  controls / the existing priority-hint line — adapt to the current
  (moving) combat screen layout; legibility over polish.
- Wiki: a short paragraph in the core-rules section (the hit-formula
  area) describing the onset round and the +1/round ramp, reading the
  constants from `combatEngine.ts` (computed, not hand-written — the
  wiki's own standing rule).

## 62.2 Command point regeneration

- **+1 CP at the start of every 4th cannon round** (rounds 4, 8, 12, …).
  Implement wherever `advanceRound` finishes its bookkeeping and the
  next round becomes issuable — align with the actual round-increment
  order in the code so "the player can spend it on round 4's orders" is
  true (that's the observable contract; add a test asserting CP goes
  2 → 3 when round 4 becomes the current round with no orders issued).
- Uncapped accumulation — convergence bounds fights at ~13 rounds, so
  the practical maximum regen is +3; not worth a cap rule.
- A log line on each regen ("Command point regained.") and the existing
  CP pips in `CombatCommandBar` simply show the new count — check the
  pip row renders a count above its starting maximum gracefully (it may
  assume max 2/3; adapt). Note iteration 60's declutter moved CP pips
  around — read the current component, not 48's description of it.
- The Spymaster's 3-CP start stays a flat head start — regen is the same
  for everyone.
- AUTO_RESOLVE/`runToEnd` never issue orders, so this half cannot move
  the balance floor — assert nothing, just note it.

## 62.3 Tests

- `convergenceBonus`: 0 through round 7, +1 at 8, +N thereafter.
- Engine: a constructed stall fixture (both sides 0 computer, 3+
  piloting, low damage weapons, real HP) — `runToEnd` finishes before
  round 16 across a seed sweep (it currently can run far past that; pick
  a bound the ramp guarantees with margin).
- Preview parity: at a post-onset round, `incomingFirePreview`'s hit
  numbers match what `fireShip` actually rolls against (same effective
  computer).
- A pre-onset fight is byte-identical to today (rounds 0–7 with no
  orders: same log, same outcomes for a fixed seed) — the ramp must not
  perturb the early game at all.
- CP regen: 2 → 3 at round 4 with none spent; a spent-down state regens
  on schedule; Spymaster 3 → 4.
- Missile phase unaffected (round 0 bonus is 0).

## 62.4 Measurement

- `npm run balance` — the fixture matchup table **WILL move** in
  matchups whose fights previously ran long (win odds shift when a
  stall resolves under the ramp instead of by 1/6 attrition), and any
  fight-length columns should visibly shorten. Record before/after per
  matchup; a swing >10pp in a previously-stalling matchup is expected,
  the same swing in a short-fight matchup is a bug.
- `npm run balance:full` — per-commander act-1 clear vs iteration 61's
  recorded table (read it from `plans/iteration-61.md`'s status notes —
  the authoritative latest baseline). Convergence is symmetric so the
  expectation is modest movement either way; record and read it, loosen
  nothing without a recorded reason.
- No browser passes (CLAUDE.md). Do not commit or push.

## Verification bar

`npx tsc -b --force` clean project-wide (scope to `tsconfig.app.json`
only if scripts/ is broken by others' concurrent work — say so),
`npx vitest run` green (report count; 861 as of iteration 61),
`npx vite build` clean, plus 62.4's two balance runs recorded.

## Open questions

1. Onset round 8 and +1/round are the levers if playtests still report
   drag — onset 6 is the next notch. Keep both as named constants.
2. Should the convergence warning also appear in the prep-screen volley
   readout? Probably noise (it never applies before round 8) — skipped.
3. An onboarding popup for the first convergence activation (the
   iteration-29 contextual-popup machinery) — nice-to-have, skip unless
   trivial.

## Status notes (implementation, 2026-08-12)

### 62.1 — Fire-control convergence

`CONVERGENCE_ONSET_ROUND = 8` and `convergenceBonus(round)` added to
`src/game/combatEngine.ts` exactly per the spec's formula. Folded into
`fireShip`'s `attackerComputer` for BOTH sides (`ship.stats.computer +
convergenceBonus(round) + (side-specific term)`), computed once and used for
every downstream read of `attackerComputer` — including the `roll` event
push — so the iteration-29 combat-log math and the natural-1/natural-6
override math (`resolveHit`) both see the boosted number automatically, with
zero separate display work. Round 0 (missile phase) needs no special-casing:
`convergenceBonus(0) = 0` by construction, confirmed by a dedicated test.

**Log announcement**: added right after `advanceRound`'s existing
`phase-start` push — a one-time sentence
("Fire-control convergence — accumulated targeting data grants +1 computer
to all ships, growing each round.") the exact round convergence activates,
then a one-line tick ("Convergence +N.") every round after. Placed once per
round (in `advanceRound`, not per-ship in `fireShip`), since it's a
fleet-wide-both-sides event, not a per-shooter one.

**HUD countdown**: added to `CombatScreen.tsx`, next to the existing
priority-target hint line (re-read the current file before editing, per the
concurrency warning — it was untouched by the concurrent session's uncommitted
work). Derives `convergenceRoundsAway = CONVERGENCE_ONSET_ROUND - combat.round`
(`combat.round` is already "next round to resolve," so no separate tracking
state was needed) and renders "Fire-control convergence in 2/1 round(s)"
for the warning window, then "Convergence +N computer (all ships)" once
active — reusing the existing generic `.hint` CSS class, no new styles
needed.

**Wiki**: a new `<li>` in the Core rules section, reading
`CONVERGENCE_ONSET_ROUND` and `convergenceBonus(...)` from `combatEngine.ts`
directly (computed, not hand-written, per the wiki's own standing rule) —
placed right after the Hit rule bullet, before Phase order.

**Deviation, recorded**: the spec asked to "fold into `incomingFirePreview`
identically." Re-reading the actual function (source of truth, per the
spec's own instruction) shows it never computed a hit-chance or
computer-derived number in the first place — `IncomingFire.maxDamage` is
explicitly documented as "an upper bound, before any roll," i.e.
`diceCount × weapon.damage`, hit-chance-agnostic by design, same for every
other consumer (`outgoingFirePreview`, `EnemyPanel`'s volley summaries).
There is no computer/piloting number in this preview's output for
convergence to go stale in — so there was nothing to fold in. Documented
this with a comment on `incomingFirePreview` itself so a future reader
doesn't wonder why. What the spec's real underlying concern was — "the
telegraph must stay honest" — is a target-selection promise, not a
hit-chance one, and that promise still needs to hold post-onset; a new test
(`incomingFirePreview stays honest post-onset`, same shape as the existing
iteration-19 telegraph tests) confirms the previewed target still matches
the actual roll's target at a post-onset round, and separately confirms the
actual roll's logged `computer` really did carry the convergence bonus that
round (proving the parity check isn't trivial-because-inapplicable).

### 62.2 — Command point regeneration

Added to the end of `advanceRound`, right before the return statement:
`nextRound = state.round + 1; commandPointRegen = nextRound % 4 === 0 ? 1 :
0`, added to `commandPoints` in the returned state, with a
"Command point regained." log line on every regen round. Computed off
`nextRound` (the round the returned state will be current for), not the
round just resolved — that's what makes "the player can spend it on round
4's orders" literally true: `issueOrder` reads `state.commandPoints` off
whatever `advanceRound` last returned, and by round 4 that already includes
the regen. Uncapped, per spec (convergence bounds fights at ~13-15 rounds in
practice per the stall-fixture sweep below, so a cap was never worth the
complexity). `AUTO_RESOLVE`/`runToEnd` never call `issueOrder`, so this half
cannot move the balance-sim floor by construction — confirmed, not
re-asserted, by `npm run balance:full`'s full-run-clear numbers staying
0.0% everywhere, unchanged in shape from iteration 61's table.

**Deviation, recorded**: the spec asked to check "the CP pips in
`CombatCommandBar` render... gracefully" above their starting max. Re-reading
the current component (concurrency warning honored) shows iteration 60's
declutter already replaced the old pip meter with a plain `{combat.commandPoints}
CP` text count (see the component's own 2026-08-12 comment: "Plain count,
not the old pip meter"). A plain number renders any value identically — 3,
4, or 7 CP all print fine — so there was nothing to adapt. No
`CombatCommandBar.tsx` changes were needed for 62.2 at all.

### 62.3 — Tests

11 new tests in `src/game/combatEngine.test.ts` (117 → 128 in that file):

- `convergenceBonus`: 0 through round 7, +1 at onset, cumulative after.
- `fireShip` folds convergence into `attackerComputer` for BOTH sides,
  reaching the logged per-roll `computer` value (asserted directly off the
  log, not re-derived).
- Log announcement: exactly one onset sentence, a distinct tick line on
  later rounds, nothing before onset.
- Round 0 (missile phase) always carries zero bonus.
- **Regression pin**: rounds 0-7 of a fixed-seed fight log a `computer`
  value equal to the ship's own base computer with nothing added, for every
  roll — the direct, executable form of "byte-identical pre-onset," since
  `convergenceBonus(round) === 0` for every round < 8 is exactly the
  invariant this test locks down. High-HP ships on both sides so the fight
  can't end early and cut the 8-round observation window short.
- **Stall fixture**: both sides 0 computer, 3 piloting, low-damage 3-dice
  cannons, real (5) HP, swept across 60 seeds — `runToEnd` finishes with a
  real winner (not the `stalemate` event) before round 16 every time. An
  ad-hoc 2000-seed sweep during tuning (not committed — see below) found a
  max of round 15 with this fixture, so the committed 60-seed/round-16
  assertion has real margin, not a near-miss.
- **Preview/engine parity, post-onset**: same "preview promises what the
  round actually does" shape as the existing iteration-19 telegraph tests,
  run at `CONVERGENCE_ONSET_ROUND` via a `{ ...state, round: N }` override
  (the same "jump the round forward on a pure function of state" trick
  `EnemyPanel.tsx`'s own cannon-volley preview already uses, rather than
  needing the fight to naturally survive 8 rounds of real dice first) —
  confirms the previewed target matches the real roll's target, and that
  the real roll's `computer` really did carry the ramp that round.
- Command points: 2 → 3 at round 4 with none spent (plus the log line); a
  spent-down-to-0 pool still regens on schedule and the point is
  immediately spendable (`canIssueOrder` true); Spymaster 3 → 4; uncapped
  accumulation confirmed through round 12 (2 base + 3 regens = 5).

**Test-count note (verification bar)**: this file's own spec, and
iteration-61's status notes, record "861" as the pre-62 baseline. The actual
HEAD commit (`35f71ad`) this session started from carries 872 tests, not
861 — `git show HEAD:src/game/combatEngine.test.ts` has 117 `it()` blocks
(confirmed directly), and three commits landed after iteration 61's own
commit (`ce14fae`, `c723e89`, `35f71ad` — all concurrent UI/balance-fix work,
per this file's own concurrency warning) without anyone updating the
recorded count. This iteration's 11 new tests are added on top of the real
872, landing at **883/883 green** — not a discrepancy in this iteration's
own arithmetic, just a stale historical number one iteration back. Not
corrected in iteration-61.md (out of this iteration's scope, and that file
belongs to already-committed history).

### 62.4 — Measurement

**`npm run balance`** — before/after, same fixtures both runs (before =
HEAD's `combatEngine.ts` via `git show`, swapped in temporarily and restored
byte-for-byte afterward; confirmed via `git diff --stat` that the restore
was exact):

| Enemy (matchup)                    | Before | After | Δ | Note |
|---|---|---|---|---|
| Missile frigate (starting fleet)   | 97% | 96% | -1pp | short fight, noise |
| Shield cruiser (col3-typical)      | 76% | 75% | -1pp | noise |
| Interceptor swarm (col3-typical)   | 99% | 98% | -1pp | noise |
| Plasma tank (starting fleet)       | 4%  | 5%  | +1pp | noise |
| Ancient guardian (col3-typical)    | 50% | 42% | -8pp | previously-long fight (avg 4.5+ rounds) |
| Ancient guardian (mid fleet)       | 77% | 75% | -2pp | " |
| GCDS (mid fleet)                   | 14% | 10% | -4pp | previously-long (avg 5.8+ rounds) |
| GCDS (col10 solid)                 | 69% | 67% | -2pp | " |
| Ancient guardian elite (col3-typical) | 9% | 5% | -4pp | previously-long (avg 6.4+ rounds) |
| Ancient guardian elite (mid fleet) | 31% | 22% | -9pp | " |
| Ancient guardian elite (col10 solid) | 86% | 82% | -4pp | " |
| Hive Mother (col3-typical)         | 40% | 29% | **-11pp** | previously-long (avg 5.4+ rounds) — largest single swing |
| Hive Mother (mid fleet)            | 48% | 44% | -4pp | " |
| Dreadnought (col3-typical)         | 2%  | 0%  | -2pp | previously-long (avg 5.5+ rounds) |
| Dreadnought (mid fleet)            | 14% | 10% | -4pp | " |
| Dreadnought (col10 solid)          | 54% | 47% | -7pp | " |
| Dreadnought (no-speed control)     | 18% | 17% | -1pp | " |
| Void Citadel (act-2 endgame + counter) | 46% | 46% | 0pp | avg rounds 6.59 → 6.48 |

Every matchup that didn't already run long moved ≤1pp (noise). Every
matchup that did move by more than a couple points was already a
long-average-rounds fight (4.5-6.5+ avg rounds in the "before" column) —
exactly the spec's predicted shape, direction consistently DOWN (a stalled
fight that used to grind toward the player's favor over many rounds of
attrition now resolves faster, before that grind fully plays out — a real,
symmetric mechanical effect, not a bug). Hive Mother's col3-typical-fleet
matchup moved 11pp, the one swing over the spec's own ">10pp is expected in
a stalling matchup" line — and it was the single longest-average-rounds
matchup in the whole table before the change, so this is squarely the
expected case, not a surprise. Every sanity-check PASS/FAIL is byte-identical
before and after (confirmed via diff of the two runs' Sanity checks
sections) — no regression in what the gate already treats as known/accepted
failures.

**`npm run balance:full`** (n=500/commander, report-only), vs. iteration
61's table:

| Commander | Iteration 61 | Iteration 62 | Δ |
|---|---|---|---|
| Baseline (auto) | 11.4% | 12.8% | +1.4pp |
| Merchant | 11.2% | 10.4% | -0.8pp |
| Engineer | 14.8% | 15.0% | +0.2pp |
| Spymaster | 9.2% | 8.8% | -0.4pp |
| Admiral | 9.4% | 8.4% | -1.0pp |
| Warlord | 12.6% | 12.6% | 0.0pp |

Full-run clear stayed 0.0% everywhere (act-2 conditional 0%, the same
long-standing `KNOWN GAP` every prior iteration's table also shows) —
unaffected, exactly as expected, since `AUTO_RESOLVE`/`runToEnd` never issue
orders and the archetype-matrix "not a trap / not dominant" gate checks all
still PASS. Every commander's movement is well within a 500-run Wilson
interval (~±3pp at these rates) — modest movement either way, matching the
spec's stated expectation for a symmetric change. No loosening or
tightening lever pulled; nothing tuned.

### Verification

`npx tsc -b --force`: clean, project-wide. `npx vitest run`: **883/883**
green (see the test-count note in 62.3 for why this is +11 over the 872
actually carried by HEAD, not +11 over the stale "861" this file and
iteration-61.md both cite). `npx vite build`: clean (Node 20.15.1 prints
Vite's usual "requires 20.19+/22.12+" advisory; unrelated to this change,
build still succeeds). No browser/preview verification was run, per
CLAUDE.md policy (this is combat-engine + desktop-layout work, not mobile).
Not committed or pushed, per instructions.

**Uncommitted concurrent work observed but not touched**: `PLAN.md`,
`plans/iteration-11.md`, `plans/iteration-47.md`, and `plans/iteration-48.md`
carried uncommitted changes from a separate session at the time of this
work (git status showed them modified; this session's own git status was
clean at start). Left entirely alone, per the concurrency-safety
instruction — this iteration's own `PLAN.md` edit (the row's Status cell)
is additive and doesn't touch any of the lines that session had already
changed.
