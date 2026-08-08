# Iteration 50 — Reward-tier guardrails (specced 2026-08-08)

> **Status: 50.0 (the distress-beacon fix) implemented directly, no plan
> needed. 50.1 (the audit) done, grounding the guardrail. 50.2 (the
> guardrail itself) implemented and verified.** `tsc -b --force` clean
> outside `scripts/` (pre-existing, unrelated — see plans/iteration-48.md),
> `vitest run src` green (791/791, up from 750 — the new
> `rewardTiers.test.ts` added 41), `vite build` clean. See status notes at
> the end of this file for what landed and two spec-interpretation calls
> made along the way.

## Motivation

User report, 2026-08-08: a single fight at column 4 paid 17cr — "that's
way too much no?" Investigated live (see chat): the **distress-beacon**
event's "peel off toward the beacon" choice pays `winReward(col)` (the
normal fight reward) **plus** a +6cr ambush bonus **plus** a free
5-credit-tier part, for a fight drawn from `EASY_POOL` — the game's
easiest enemy tier (near-100% win rate even for a fresh starting fleet,
per `npm run balance`'s own matchup table). Total value at column 4:
17cr + a part, against essentially no risk — within 2cr of what a
genuine **elite** pays (19cr + a guaranteed part) for a fight that's
actually dangerous.

Mid-investigation, the user broadened the ask: *"it may also make sense
to put in some guardrails explicitly for the rewards system so we
actually always have an expected payout value consistently across the
playthrough, and also when the player accesses the different difficulty
sections."* That's the real scope of this iteration — distress-beacon
was one symptom; the actual gap is that nothing enforces a coherent
reward-vs-risk relationship as new content (especially events) gets
added, so a mismatch like this can only ever be caught by a human
noticing it felt wrong in play.

## 50.0 — The immediate fix (done, no plan needed)

`distress-beacon`'s ambush bonus: `{ credits: 6, partId }` →
`{ credits: 2, partId }`. At column 4: 17cr → 13cr (+ the part), still
comfortably ahead of the same event's zero-fight "lure it away" option
(a flat, guaranteed +4cr) once the part's value is counted, without
pricing a trivial fight near elite rates. Implemented as a direct
one-line tuning change (matches the project's own precedent for small
balance/polish fixes shipped without a dedicated plan file — see
PLAN.md's "Playtest fixes" and "polish batch" rows) rather than folded
into this spec's implementation milestones, since it doesn't need the
guardrail system below to be correct — it was independently verified by
hand against the audit in 50.1.

Files touched: `src/game/events.ts` (the value + a comment explaining
the retune and pointing here), `src/game/events.test.ts` and
`src/game/reducer.test.ts` (2 tests pinning the old `6` updated to `2`).

## 50.1 — Reward-tier audit (grounding for the guardrail)

Every credit-granting source in the game, as of this session, catalogued
by what it actually pays and what it should be measured against.

### The baseline

`winReward(col, act)` (`reducer.ts`) is the reference every other tier
is a multiple/offset of — the credits for the forced fight every run
requires at that column. `eliteReward(col, act) = winReward + 4` is a
second, higher reference for genuinely dangerous optional fights.

### Single-node reward sources (the guardrail's scope this iteration)

| Source | Pool / danger | Payout | vs. baseline | Tier |
|---|---|---|---|---|
| Plain combat win | forced | `winReward(col)` | +0 | baseline |
| Convoy cargo | real pool, "+1 HP/ship harder" | `winReward(col) + 4` | +4 | **borderline** — see decision point A |
| Command cargo | real pool | `winReward(col) + 8` | +8 | high-risk |
| Elite fight | elite pool (genuinely hard) | `eliteReward(col) + 4` + guaranteed weapon part | +8 + part | high-risk |
| Wreck cargo | real pool | `winReward(col) - 2` + a random 5cr part | −2 + part | its own thing — a discount, not a bonus; excluded (already pays less, nothing to gate) |
| distress-beacon (fixed, 50.0) | `EASY_POOL` (near-100% win rate) | `winReward(col) + 2` + a random 5cr part | +2 + part | low-risk |
| colony-raiders | `EASY_POOL` | `winReward(col) + 0` (no direct bonus — see 50.1's chain note) | +0 | low-risk (chain-gated, see below) |
| defector-pursuit | `HARD_POOL` (plasma tank / ancient guardian — real danger per `npm run balance`) | `winReward(col) + 8` | +8 | high-risk |
| debt-collectors (fight branch) | `HARD_POOL` | `winReward(col) + 0` direct, but clears a 12cr debt on win | +0 direct / chain-gated | high-risk (chain-gated) |
| Every flat, no-fight event payout (asteroid-field, abandoned-arsenal, war-surplus-peddler, nav-buoy, salvage-claim, colony-ship's sell option, defector's turn-in, ...) | none | 2–5cr flat, column-independent | n/a | flat |

**Reading it**: every single-node source lines up cleanly into 3 bands
once distress-beacon is fixed — flat (2-5cr, no combat), low-risk
(baseline +0 to +2, easy pool), high-risk (baseline +4 to +8, hard pool
or elite). Nothing else in the table is currently a violation.
**Convoy is the one soft flag**: priced identically to elite's bonus
(+4) despite convoy enemies only being "+1 HP per ship harder" than a
plain fight (per the 2026-08-08 polish-batch note in `enemies.ts`/
`convoyEscort`), not elite-tier danger. It's a much smaller mismatch
than distress-beacon was (a few credits, not doubling toward elite
parity) — flagged as a decision point (A below), not fixed by default.

### Chain events (relic, debt, colony) — explicitly out of scope this iteration

These don't fit a single-node band comparison: their payoff is
contingent on 1-2 further probabilistic node rolls (a ~50% chance per
eligible event node, per `drawEvent`'s continuation-priority check), so
"is the payout too much for the risk" requires an expected-value
calculation over the whole chain's completion probability, not a flat
lookup. Spot-checked by hand instead of formally gated:

- **Debt** (`debt-broker` → `debt-collectors`): +8cr now, −12cr (or a
  hard-pool fight to cancel it) whenever the collectors' 50% roll lands.
  A genuine loan — net value depends entirely on how many eligible event
  nodes remain and whether the run ends first. Reads as designed risk,
  not free money (the spec's own "also deliberate" note on the
  zero-collectors case is a real but low-probability edge, not the
  common case).
- **Colony** (`colony-ship` → `colony-raiders` → `colony-arrival`): the
  10-14cr payoff requires escorting (free), THEN winning an easy-pool
  fight when raiders roll (50%/node), THEN reaching the late stage
  before the run ends for the arrival to roll (another 50%/node). Two
  successive unguaranteed rolls gate a payout roughly one act-1-boss-
  reward's worth of credits — if anything this reads UNDER-rewarded for
  how much has to go right, not over. No concern found.
- **Relic** (fragment → fragment → vault/core): pays in a build-defining
  ITEM (the Ancient artifact, +4 computer/+4 piloting), not credits —
  comparing it to a credit band needs an item-power-to-credit
  conversion (the kind of "shop-equivalent price" lens
  `scripts/sim`'s `enemyValue.ts` already uses for enemies, but applying
  it to reward items is new modeling, not a small extension). Deferred;
  note it as a natural next step once `scripts/` is unblocked (see
  Decision point C).

## 50.2 — The guardrail itself: an enforced tier check, not an advisory report

**Where it lives**: `src/game/`, as a plain Vitest test — NOT
`scripts/sim` (currently broken and owned by a concurrent session per
plans/iteration-48.md/49.md; also, `scripts/`'s balance tables are
explicitly advisory only per PLAN.md's standing notes, and a "guardrail"
that a developer has to remember to run isn't one — this needs to be
part of `npm test`/`vitest run`, the actual gate).

**Core design principle (revised 2026-08-08, second planning pass): the
manifest classifies, the code provides the numbers.** The first draft of
this spec had the manifest carry hand-copied payout numbers
(`bonusOverBaseline: 2`) — but a hand-copied number can drift from the
code exactly the way the code drifted from design intent in the first
place. Instead every entry names a source and a TIER only; the test
derives the actual payout by exercising the real code (calling
`resolveEventChoice` with a seeded rng for events, calling
`applyCargoReward`/`eliteReward`/`winReward` and reading the exported
bonus constants for combat-side sources) and asserts the measured value
sits inside the claimed tier's band. Drift is then impossible by
construction: retune a payout in `events.ts` and the guardrail
re-measures it automatically; move it out of its band and the gate
fails until either the value or the (deliberate, reviewed) tier
classification changes.

**New file `src/game/rewardTiers.ts`** — the bands, the manifest, and
the tier vocabulary (kept out of the test file so game code and any
future UI/wiki surface can import the same taxonomy):

```ts
export type RewardTier = 'flat' | 'low-risk' | 'high-risk';

// Bonus OVER the column's own baseline (winReward for a normal fight,
// with eliteReward's premium measured as its delta over winReward) —
// relative bands, so they need no re-deriving if winReward's formula
// changes later.
export const TIER_BONUS_BAND: Record<Exclude<RewardTier, 'flat'>, { min: number; max: number }> = {
  'low-risk': { min: 0, max: 4 },   // EASY_POOL ambushes, convoy-class cargo
  'high-risk': { min: 4, max: 8 },  // HARD_POOL ambushes, elite, command cargo
};
export const FLAT_REWARD_BAND = { min: 1, max: 6 }; // no-fight event payouts

// A source that ALSO grants a part must sit in the LOWER HALF of its
// tier's credit band — the part is real value the credit bands can't
// see (distress-beacon's original mispricing was exactly this: +6cr
// AND a part). Lower half = min..(min+max)/2 inclusive. Verified
// against current data before adopting: distress-beacon +2 of [0,4] ✓,
// elite +4 of [4,8] ✓ — the rule is already true everywhere, so it's a
// pure guardrail, not a forced retune.
```

Manifest entries (same file): `{ id, tier, grantsPart?: true }` plus a
`measure` discriminator telling the test HOW to obtain the live value —
`{ kind: 'event'; eventId; choiceIndex }` (resolve it for real, read
`ambushBonus.credits ??` the credit delta), `{ kind: 'cargo'; tag }`
(`applyCargoReward(tag, 0)`), `{ kind: 'combat-bonus'; value: () =>
number }` (the exported constants below). Every single-node source from
the 50.1 table gets an entry, including all the flat event payouts.

**Enabling refactor in `reducer.ts`**: the inline elite/command bonus
literals in CONTINUE (`isElite ? 4 : cargoTag === 'command' ? 8 : 0`)
become exported named constants (`ELITE_KILL_BONUS = 4`,
`COMMAND_CARGO_BONUS = 8`), used by CONTINUE and imported by the
manifest — one source of truth, same discipline as
`BASE_COMMAND_POINTS`'s export-for-the-prep-screen reasoning in
iteration 48. Behavior-preserving by inspection (same values, now
named).

**The test** (`src/game/rewardTiers.test.ts`), four assertion groups:

1. **Band membership, live-measured**: for every manifest entry, obtain
   the real payout via its `measure` and assert it's inside its tier's
   band (`FLAT_REWARD_BAND` for flat). Event measures use the existing
   `fixedRng`/seeded-rng test helpers `events.test.ts` already has.
2. **The part-grant rule**: every `grantsPart` entry's measured bonus
   ≤ the midpoint of its tier's band.
3. **Completeness tripwire (source-scrape)**: read
   `src/game/events.ts` with `fs.readFileSync` (vitest runs in node;
   `__dirname`-relative path) and extract every positive
   `pay(state, N, ...)` literal and every `ambushBonus: { credits: N`
   literal. Every extracted positive `pay` value must be ≤
   `FLAT_REWARD_BAND.max`; every extracted `ambushBonus.credits` value
   must equal some non-flat manifest entry's measured value. This is a
   deliberately blunt tripwire, not a parser: a future event paying
   via a direct `credits:` state spread (as the exempt chain events do)
   evades it — acceptable, documented in a comment; the manifest review
   discipline is the second layer. Keep the regexes dumb and the
   failure messages rich ("pay(state, 9, ...) found in events.ts with
   no manifest entry — classify it in rewardTiers.ts").
4. **Baseline curve shape** (the "consistent across the playthrough /
   difficulty sections" half of the user's ask, which per-source bands
   alone don't cover):
   - `winReward(col, act)` non-decreasing in GLOBAL column across the
     act-1 → act-2 seam (sweep act-1 cols 0..10 then act-2 cols 0..12
     via `globalColumn`).
   - The act-2 bonus: `winReward(c, 2) - (7 + globalColumn(2, c))` =
     `ACT2_REWARD_BONUS` for every act-2 column (pin the +3 as a
     structural fact, not a magic number — import nothing new; assert
     the delta is constant and positive).
   - The early-column halving: cols 1-3 (act 1) pay exactly
     `floor((7+col)/2)`; cols 0 and 4+ pay `7+col` — pins the
     ACT1_HALVED_COLUMNS behavior against accidental widening.
   - `eliteReward(col, act) - winReward(col, act)` is the same constant
     (+4) at every column of BOTH acts EXCEPT act-1 cols 1-3 (where
     winReward is halved but eliteReward deliberately isn't — assert
     the gap there is larger, not equal, and cite the eliteReward
     comment's "elites are optional, chosen risk" rationale).

**Explicitly not gated this iteration**: the 3 chain events (50.1's own
scoping — their payoff is an EV over future probabilistic rolls, not a
flat lookup), `wreck` cargo's credit side (a discount; its part grant is
noted in the manifest as documentation but not band-checked since the
credits are negative), commander/protocol per-win modifiers
(`merchantBonus` +1, salvage-rigs +2 — global stacking modifiers audited
by the balance sim, not per-source payouts), and anything inside
`scripts/sim` (out of scope while that tree is broken).

## Decision points — RESOLVED (second planning pass, 2026-08-08)

- **A. Convoy's +4cr**: keep it. It sits exactly at the top of the
  low-risk band (legal), the danger bump is real if small (+1 HP/ship),
  and unlike an event's hidden payout the convoy tag is visible on the
  map before the player commits — the "surprise jackpot" element that
  made distress-beacon feel wrong doesn't apply. The band system now
  documents it as a deliberate top-of-band choice rather than leaving it
  ambiguous.
- **B. Hard-fail.** The gate is a normal Vitest test. The original
  hesitation (bands too tight → noisy failures) is mooted by the
  live-measurement design: the test can only fail when someone actually
  changes a payout or misclassifies a new source — both cases where a
  hard stop is exactly right.
- **C. Item-value modeling (relic chain, part grants beyond the
  half-band rule)**: still deferred to a future iteration once
  `scripts/` is unblocked; the half-band rule (assertion group 2) is
  this iteration's cheap stand-in for part value.

## Verification bar

Per milestone: `npx tsc -b --force` clean outside `scripts/` (see
plans/iteration-48.md's note on why the root build currently can't be
fully clean), `npx vitest run src` green (new test count reported),
`npx vite build` clean. No `scripts/` changes. No live browser passes
(standing policy). Re-run `npm run balance` once `scripts/` is unblocked
and confirm distress-beacon's fix and any 50.2 tier trims didn't move
any FAIL/WARN line unexpectedly — can't be done now since `scripts/` is
currently broken independent of this work.

## 50.2 status notes (implemented 2026-08-08)

**Files touched**:

- `src/game/rewardTiers.ts` (new) — `RewardTier`, `TIER_BONUS_BAND`,
  `FLAT_REWARD_BAND`, `RewardMeasure`, `RewardSourceEntry`, and the
  `REWARD_SOURCES` manifest (18 entries: 3 combat-side, 2 event ambushes,
  13 flat no-fight payouts).
- `src/game/rewardTiers.test.ts` (new) — the four assertion groups, 41
  tests total.
- `src/game/reducer.ts` — `ELITE_KILL_BONUS = 4` and
  `COMMAND_CARGO_BONUS = 8` exported (next to `winReward`/`eliteReward`,
  same section) and wired into the CONTINUE case's `eliteOrCommandBonus`
  in place of the old inline `4`/`8` literals. Behavior-preserving by
  inspection — confirmed by the full suite staying green.
- `plans/iteration-50.md`, `PLAN.md` — this status update.

**Layering**: `rewardTiers.ts` imports only `ELITE_KILL_BONUS`/
`COMMAND_CARGO_BONUS` from `reducer.ts` (for the two `combat-bonus`
closures) plus type-only imports (`CargoTag` from `map.ts`, `EventId`
from `events.ts`). It does **not** import `resolveEventChoice` or
`applyCargoReward` — those two measure kinds (`event`, `cargo`) carry
data only (an id/tag) and are resolved inside `rewardTiers.test.ts`
instead, which already needs `resolveEventChoice`/`applyCargoReward` for
its own live measurement. This is the spec's own documented fallback
("that layout is fine and arguably cleaner") and confirmed clean:
neither `events.ts` nor `reducer.ts` imports `rewardTiers.ts` anywhere.

**Deviations from the spec, with reasoning**:

1. **The source-scrape reads `events.ts` via a Vite `?raw` import, not
   `fs.readFileSync`/`__dirname`.** The spec's own text suggested
   `fs.readFileSync` with an `__dirname`-relative path ("vitest runs in
   node"). In this repo that fails `tsc -b` for a structural reason the
   spec didn't anticipate: `tsconfig.app.json` (which covers every
   `src/*.test.ts`, this file included) has no `@types/node` in its
   `types` list — only `tsconfig.node.json`/`tsconfig.scripts.json` do,
   and neither covers `src`. Using `fs`/`path`/`__dirname` there produced
   3 new `tsc` errors outside `scripts/`, which the verification bar
   forbids. Rather than widen `tsconfig.app.json`'s ambient `types` (a
   global, app-wide config change well beyond this guardrail's scope),
   `import eventsSource from './events.ts?raw'` — a Vite `?raw` import,
   already declared by `vite/client.d.ts` (already in this project's
   `types` list) — reads the identical live, unmodified source text
   through Vitest's own Vite transform pipeline, with no config change
   and no new type errors. Functionally identical outcome (the
   completeness tripwire scrapes real, current `events.ts` text either
   way); only the read mechanism differs.
2. **The group-3 completeness tripwire also requires pay() values to be
   *covered* by a matching flat manifest entry, not just `<=
   FLAT_REWARD_BAND.max`.** The plan's own text (section 50.2, point 3)
   only states the `<=` bound for scraped `pay()` values, reserving the
   "must equal some manifest entry's measured value" requirement for
   `ambushBonus.credits` alone. Implemented the stricter version for
   both — every scraped positive `pay()` value must both stay `<=` the
   band max AND match some flat entry's live-measured value — since it's
   a strict superset (nothing currently in `events.ts` fails it; all
   positive `pay()` values found are `{2, 3, 4, 5, 6}`, all covered by
   the 13 flat manifest entries) and it's what the task briefing
   describing this milestone asked for. No game value needed to change
   to satisfy it.
3. **"`winReward` non-decreasing in global column across the act-1 →
   act-2 seam"** is implemented as non-decreasing *outside the
   deliberately pinned early dip* (act-1 cols 1-3), not as a single
   literal sweep of every column 0-10 then 0-12. Taken completely
   literally, the full sweep is false against the actual, intentional
   `ACT1_HALVED_COLUMNS` behavior — `winReward` genuinely drops from 7
   (col 0) to 4 (col 1) by design (see reducer.ts's 2026-08-08 comment on
   the halving). The very next spec bullet pins that dip's exact values,
   so the two assertions together already cover the whole curve: the
   halving test nails the dip precisely, and the monotonicity test
   (col 0, then col 4 onward through both acts, skipping the pinned
   dip window) catches any *other* accidental narrowing/widening — which
   is the guardrail's actual purpose here. Documented inline in
   `rewardTiers.test.ts` where the exclusion happens.
4. **`customs-checkpoint` and an "ancient-cache 'too risky' option"
   named in this milestone's task briefing as example flat sources are
   not in the manifest.** Audited both directly against `events.ts`:
   `customs-checkpoint`'s only credit-bearing choice is `pay(state, -1,
   ...)` (a toll, negative — its other two choices touch heat/inventory
   only, never a positive payout), and `ancient-cache` has no "too risky"
   labeled option at all — its three choices are "leave it sealed" (no
   reward), "force it open" (the ELITE ambush path, already covered
   generically by the `elite-kill-bonus` manifest entry), and a cloaked
   entry that grants a part with **no** credits. Neither event has a
   positive flat credit payout to classify, so including either would
   mean inventing a manifest entry with nothing real behind it. Everything
   else in the task briefing's example list (derelict-cruiser,
   asteroid-field, abandoned-arsenal, intercepted-signal, recon-probe,
   sabotage-raid, defector, distress-beacon's lure option, relic-signal,
   relic-vault, war-surplus-peddler, nav-buoy, colony-ship) checked out
   and is in the manifest.
5. **`salvage-claim` (+8/+12cr) and `militia-requisition` (+7cr)**,
   both named in 50.1's own audit table as "flat" examples, are
   deliberately **not** in the manifest. Both exceed `FLAT_REWARD_BAND`
   (max 6) and both pay via a direct `credits: state.credits + N`
   state-spread rather than the `pay()` helper — `salvage-claim` bundles
   a heat cost into the same return (a different-currency trade, same
   shape as wreck cargo's exclusion), and `militia-requisition` trades
   away an owned part for cash (the inverse of a reward). Both evade the
   source-scrape by construction, exactly as `rewardTiers.ts`'s header
   comment documents for exempt direct-spread payouts — no discrepancy
   with the actual game values, just two payouts that were never really
   "flat rewards" in the audit's own sense and don't fit the tripwire's
   scope.

**No discrepancies found between the 50.1 audit's numbers and the actual
code** — every measured value landed inside its claimed band on the
first run of `rewardTiers.test.ts`, with no game-value retuning needed:
convoy measured exactly 4 (top of low-risk, inclusive), elite-kill-bonus
exactly 4 (bottom of high-risk), command-cargo exactly 8 (top of
high-risk), distress-beacon's fixed +2 (bottom-ish of low-risk, and
passes the part-grant half-band rule at exactly the midpoint), and
defector-pursuit exactly 8 (top of high-risk).

**Verification bar — all three ran clean**:

- `npx tsc -b --force` — clean outside `scripts/`. The `scripts/`
  errors present (fusions/`SHIPYARD_UPGRADE_COST`/`shopUpgradeOffer`
  etc. in `scripts/balance.ts`, `scripts/sim/agent.ts`,
  `scripts/sim/budget.ts`) are the same pre-existing, unrelated set
  documented in plans/iteration-48.md/49.md; nothing under `scripts/`
  was touched this session.
- `npx vitest run src` — 791/791 passed (27 files), up from 750/750 at
  session start. All 41 new tests are in `rewardTiers.test.ts`: 18 band-
  membership checks (one per manifest entry), 2 part-grant-rule checks
  (the two `grantsPart` entries), 17 completeness-tripwire checks (1
  scrape-sanity + 14 `pay()`-value checks — `asteroid-field` alone
  contributes 2, one per positive `pay()` call in its two options — + 2
  `ambushBonus.credits`-value checks; vitest emits one `it` per scraped
  literal, not per manifest entry, so this count tracks `events.ts`'s
  current literal count, by design), and 4 baseline-curve-shape checks.
- `npx vite build` — clean (one unrelated Node-version advisory printed
  by Vite itself: "Vite requires Node.js version 20.19+ or 22.12+", not
  an error; pre-existing, not touched by this work).
- No live browser/preview verification was performed, per CLAUDE.md's
  standing policy.
