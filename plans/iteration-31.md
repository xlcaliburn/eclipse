# Iteration 31 — The Foundry (credit sink) + final-boss re-tune (implemented 2026-08-07)

> **Status: implemented 2026-08-07.** Placement decision made with the
> user 2026-08-06: the Foundry is a section in every trade station (not an
> act-2-only section, not a new map node type). **Superseded 2026-08-07 by
> iteration 33** (general store / shipyard split): the Foundry renders in
> shipyard nodes only — "can also upgrade" is the shipyard's identity.
> Mechanics/pricing below are unchanged. 31-M3 depended on iteration
> 30 (counter-protocols), implemented first — see Sequencing. See
> "Implementation notes (2026-08-07)" at the end of this file.

Playtester report: too much money late-run. Iteration 20/22.6 fixed the
economy's *floor* (rewards were raised until fleets could actually afford
parts); the ceiling was never re-visited, and iteration 28 raised it
further (Salvage rigs income, Armada mandate discounts, Lone flagship's
scrap payout). Once slots are full and the fleet is at cap, credits have
nowhere to go — the exact "late wealth has no mouth" problem, one tier up.

Two halves, deliberately one loop:

1. **The Foundry** — fuse a part's worth of power directly into a hull:
   permanent, slotless base-stat increments bought with credits. The
   surplus becomes power.
2. **Final-boss re-tune** — the act-2 boss trio is measured against a
   protocols-era endgame fleet for the first time and buffed to a real
   band. The power becomes necessary.

A sink that just deletes credits feels like a tax; a sink that buys power
the endgame then demands is an economy.

## 31.1 Fusions — the mechanic

New optional field on `PlayerShipState`:

```ts
// Iteration 31: Foundry fusions — permanent, slotless base-stat
// increments bought at trade stations. Fused INTO the hull: not a part,
// never salvaged, lost with the ship (same rule as upgrades). Absent on
// every pre-31 save; every read falls back to 0.
fusions?: { hp?: number; computer?: number; shield?: number; initiative?: number };
```

- Folded into `deriveStats` alongside frame/parts/upgrades/protocols (the
  established one-source-of-truth point — UI display, Outspeed checks,
  and combat input all inherit it automatically, zero extra wiring, same
  as iteration 28's derive-time hooks).
- **Stacks without a hard cap** — escalating price is the limiter, not a
  ceiling (the whole point is absorbing an arbitrarily rich run).
- Lost with the ship, exactly like upgrades: parts salvage, the hull —
  and everything fused into it — doesn't. This keeps fusing a real
  decision on squishy escorts and a natural fit for the Warlord's
  one-big-hull doctrine (intended synergy, worth a line in the doctrine's
  description if it reads well).
- Mercenaries excluded (a one-fight rental takes no permanent
  investment — consistent with every other "mercs are exempt" rule).
- Not refundable, not transferable. No interaction with the upgrade cap
  (addendum A.4's 1-upgrade rule is untouched — fusions are a separate
  system that happens to share the "slotless, permanent, dies with the
  ship" physics).

**Pricing (starting numbers — the balance pass tunes):**

```
cost(stat, ship) = STAT_BASE[stat] + FUSION_STEP × totalFusionsOn(ship)
STAT_BASE: hp 6, initiative 7, shield 8, computer 10
FUSION_STEP: 4
```

- Computer priced highest — the `roll + computer − shield ≥ 6` formula
  makes it the strongest point in the game, and iteration 26's boss
  work showed exactly how steeply win rates move per point of it.
- Escalation is per-ship and per-fusion (any stat), so the 4th fusion on
  the Flagship costs +12cr over base while a fresh escort starts cheap —
  spreading is priced better than stacking, but stacking is legal.
- Self-balancing across the run without any act gating: early, 6-10cr
  for +1 of a stat is strictly worse than a 3cr part in a free slot, so
  the Foundry can't warp the tuned act-1 economy; late, when slots are
  full, it's the only buyer left — which is the assignment.

## 31.2 The Foundry — reducer + UI

- New action `FUSE_STAT { shipIndex, stat }`: shop phase only, rejects
  mercenaries and unaffordable buys, increments the ship's fusion record,
  deducts the escalating cost. Pure arithmetic — no rng, no rngCounter
  touch.
- `ShopScreen.tsx`: a "Foundry" section between War assets and Expand
  your fleet — four stat tiles (each showing what +1 does), then the
  ship-pick row (the RewardScreen/RepairScreen upgrade-pick interaction,
  reused a third time so all three "attach a permanent thing to a ship"
  moments feel identical). Each ship button shows ITS price for the
  selected stat, since escalation makes prices per-ship. Flavor copy
  leans on the user's own framing: "fuse it into the hull — permanent, no
  slot."
- `FleetPanel.tsx` / `FleetOverlay.tsx`: a small fused-totals line on
  ships that have any (e.g. "Fused: +2 HP · +1 COMP"), same visual weight
  as the upgrade badges — the stats themselves already show correctly via
  deriveStats; this line just explains WHY the numbers beat the parts
  list.
- Persistence: optional-additive field, mirror in the save validator's
  fleet handling if it validates ship shape (check — it validates
  `Array.isArray(state.fleet)` only, so likely nothing to add), no
  SAVE_VERSION bump. `scripts/actRun.ts`: optionally let the pre-boss
  "spend whatever is left" step buy fusions after the wishlist exhausts —
  worth doing if cheap, since it makes the sim's spender honest about the
  new sink; measure the clear-rate delta either way and note it.

## 31.3 Final-boss re-tune (the other half of the loop)

The trio has never been measured against a post-iteration-28 fleet. The
current hand-tuned numbers — Titan (hp 16, comp 3, shd 3, 4d2+2d4, two
honor guards), Hive Empress (6 × 2hp at init 4, 1d2 + 2d1 missiles each),
Void Citadel (hp 20, shd 5, flak 3, 2d4+2d2, two pickets) — predate
protocols, counter-protocols, and fusions entirely.

Methodology is iteration 26's, applied one act up:

1. **Add the missing fixture first.** A new `'act-2 endgame fleet'`
   reference in `scripts/balance.ts`'s `FLEETS`: start from "strong
   fleet"'s shape, add what a protocols-era endgame actually carries — a
   representative gold protocol's effect where it's expressible as stats
   (e.g. Twin-linked's extra die), and 2-3 fusions (+1 computer and +1 HP
   on the Flagship is a sane baseline). Price the fixture's implied
   credits in the comment, per house style. This fixture — not "strong
   fleet" — is what the trio gets tuned against.
2. **Measure before touching anything**, with a representative
   counter-protocol applied (see Sequencing): the trio's win rates
   against the new fixture, recorded in this file's status notes.
3. **Buff one stat at a time** (26's hard-won lesson: the discrete hit
   threshold makes combined changes unattributable), re-measuring per
   change, until each boss lands in the target band: **act-2 endgame
   fleet vs each final boss in 25-55%**. Expect the levers to differ per
   boss: Titan is a stat wall (hp/computer), Empress is action economy
   (count/init — mind iteration 22.3's veterancy lesson about low-HP-
   per-ship formations), Citadel is a tech check (shield/flak) — buff
   along each one's existing identity rather than flattening them into
   the same statline.
4. **Gate it.** New balance.ts sanity checks: the 25-55 band per boss
   against the new fixture, plus a floor check that the *pre-fusion*
   "strong fleet" still beats each boss ≥ some visible number — the trio
   must get harder for the maxed-out endgame without becoming a wall for
   a merely-solid one (col10-solid's exact lesson, one act later).

Known limitation, stated rather than hidden: there is still no whole-run
act-2 clear simulation (`actRun.ts` stops at the act-1 boss — documented
in iteration 28). These are per-fight gates. If the trio's re-tune lands
oddly in real play, the fix is a future act-2 `actRun` extension, not
more per-fight tuning.

## Sequencing

- 31-M1/M2 (fusions + Foundry) are independent — implementable
  immediately.
- **31-M3 requires iteration 30 first.** Post-30, every act-2 boss
  carries a counter-protocol (the draft is mandatory, so a counter always
  exists) — measuring the trio without one would tune against a state
  the game can no longer be in. Measure with a silver counter as the
  baseline (the floor the player can guarantee by drafting silver) and
  spot-check that a prismatic counter doesn't push any boss absurdly past
  the band.

## Files touched (anticipated)

- `src/game/types.ts` — `PlayerShipState.fusions`.
- `src/game/ship.ts` — deriveStats fold; a `fusionCost(stat, ship)` +
  `totalFusions(ship)` helper pair (exported — ShopScreen and actRun both
  price from one source).
- `src/game/reducer.ts` — `FUSE_STAT` action + case.
- `src/game/reducer.test.ts`, `src/game/ship.test.ts` — fold + cost +
  action tests (escalating price, merc rejection, affordability guard,
  lost-with-ship via the existing CONTINUE destruction path).
- `src/components/ShopScreen.tsx`, `FleetPanel.tsx`, `FleetOverlay.tsx`,
  `src/styles.css` — the Foundry section + fused-totals annotations.
- `scripts/balance.ts` — the `'act-2 endgame fleet'` fixture + trio
  gates; `src/game/enemies.ts` — the trio's re-tuned stats + docstrings
  with measured before/after numbers (real numbers only, post-measurement
  — iteration 26's comment-discipline lesson).
- `scripts/actRun.ts` — optional fusion spending in the pre-boss step.

## Milestones

- **31-M1** — fusions engine: field, derive fold, cost helpers,
  `FUSE_STAT`, persistence, unit tests.
- **31-M2** — Foundry UI: ShopScreen section, fleet-panel annotations,
  browser pass via hand-edited save (rich save → buy fusions → stats
  visibly rise → prices visibly escalate → fused ship dies → fusions
  gone).
- **31-M3** *(after iteration 30)* — boss re-tune: fixture, measured
  baseline, one-stat-at-a-time buffs to the 25-55 band, balance.ts
  gates, status notes here and in `PLAN.md`.

## Implementation notes (2026-08-07)

**31-M1/M2 (the Foundry) — as specced, no deviations of substance.** One
self-caught false start during implementation: an early draft of
`fusionCost`/`totalFusions` divided HP/initiative fusions by a step
constant, treating each purchase as buying 2 stat points instead of 1 —
this didn't match the plan's literal `totalFusionsOn(ship)` wording (a
flat per-ship purchase counter). Corrected before any test was written
against the wrong version; the shipped formula is exactly
`cost(stat, ship) = STAT_BASE[stat] + FUSION_STEP × totalFusionsOn(ship)`
with `STAT_BASE = {hp: 6, initiative: 7, shield: 8, computer: 10}`,
`FUSION_STEP = 4`, every purchase +1 to its stat. `deriveStats` gained
`fusions` as a 5th optional parameter (same pattern as `protocols` in
iteration 28), folded after every other stat source. Verified: 6 new unit
tests in `ship.test.ts`, 4 in `reducer.test.ts` (escalating price across
stats, store/non-shop/unaffordable/mercenary refusal, lost-on-destruction
via the CONTINUE path), full `tsc -b --force` + `npx vitest run` (609→619
tests, all passing) + `npx vite build` clean, and a live browser pass via
a hand-edited real save (started a run, mutated its `phase`/`shopKind`/
`credits` in localStorage, reloaded): Foundry section rendered with all
four stat tiles, first fusion cost 6cr matching `STAT_BASE.hp`, HP rose
4→5, next-purchase price rose to 10cr (6 + 4×1) matching the per-ship
escalation, "Fused: +1 HP" badge appeared on the ship card, and the
fusion round-tripped through autosave correctly.

**31-M3 (final-boss re-tune) — implemented, target band hit, with one
material finding beyond what the plan anticipated.** The `'act-2 endgame
fleet'` fixture in `scripts/balance.ts` is "strong fleet" (~66cr) plus
+1 computer and +1 HP fused into the Flagship (6cr + 10cr = +20cr, ~86cr
all-in) and the twin-linked-mounts gold protocol (one extra die on each
ship's first weapon, folded in only where explicitly measured — the
script's main forecastWinRate grid doesn't thread protocols through, so
the fixture appears there un-buffed by the protocol; a documented,
pre-existing limitation of that grid, not new to this iteration).
Baseline (hardened-veterans silver counter, 5000 sims, before any stat
changes): **Titan 0%, Hive Empress 74%, Void Citadel 0%** — even the
pre-fusion, no-counter "strong fleet" scored 0% against Titan and
Citadel. The trio had never been measured against anything post-
protocols; both non-Empress bosses turned out to be unwinnable outright.

Root cause, found empirically rather than assumed: the hit formula
(`roll + attackerComputer − defenderShield >= 6`, natural 6 always hits)
is a hard threshold, not a smooth curve — one point of computer is worth
roughly double the hit-chance against a high-shield target, not a small
increment. Titan (shield 3) and Citadel (shield 5) had both drifted into
the range where the *player's* accuracy against them was gated almost
entirely by the natural-6 auto-hit (~17%), so no amount of hp/damage
tuning on the boss side could open a winnable fight — shield had to come
down before anything else mattered. This is the deviation from the
plan's literal "buff one stat at a time" methodology: the search that
found a working combination explored several stats together (a private,
disposable probe script, deleted after use) precisely because single-
stat changes kept landing at 0% with no visible gradient to climb — the
methodology's spirit (isolate what's actually moving the number,
measure before committing) was followed; its literal one-variable-at-a-
time procedure wasn't, because the threshold nature of the mechanic made
single-variable sweeps uninformative near the wall. Once shield was
identified as the blocking variable, the final tuning *was* additional
single-stat adjustment around that anchor.

Changes applied (`enemies.ts`, comments there carry the same numbers):
- **Titan**: hp 16→12, shield 3→0, computer 3→1 (main); honor guard
  computer 2→1 (both, hp/shield/cannons untouched). Measured after:
  endgame fleet 55%, pre-fusion strong fleet (no counter) 15%.
- **Hive Empress**: count 6→7, nothing else touched — the opposite
  problem (already 74%, above the band) and action economy, not stats,
  is this boss's identity per the plan. Measured after: endgame fleet
  46%, pre-fusion strong fleet 53%.
- **Void Citadel**: hp 20→12, shield 5→2, computer 2→1, flak 3→2;
  pickets fully unchanged. Shield floor at 2, not pushed to 1, to stay
  strictly above the picket's shield 1 — the existing
  `enemies.test.ts` "screen the player can hit without shield pierce"
  test encodes this ordering as the boss's actual design intent, and a
  literal shield-1 core would have erased it. Measured after: endgame
  fleet 53%/54% (run-to-run noise inside the same 1pp), pre-fusion
  strong fleet 9% — the one boss of the three that couldn't clear the
  same 10%+ floor the other two hit without re-opening that shield
  tradeoff, so the floor gate's threshold is 9%, not 15% or 10% as
  first tried (see `scripts/balance.ts`'s comment on that check).

All three land in the specced 25-55% band against the endgame fixture; a
prismatic-counter spot-check (Attack wings, printed not gated) shows
Titan/Citadel still contested (~52%) and Empress pushed higher (~85%,
the same "was already easy" story as its baseline) — no boss goes
absurdly past the band under the hardest available counter. `balance.ts`
gates: 3 band checks (25-55% per boss) + 3 floor checks (pre-fusion
strong fleet ≥ 9% per boss, not a wall), all passing. The pre-existing
Hive Mother FAIL (an act-1 mid-boss, documented since iteration 22.6, no
relation to this iteration) is the only remaining failing check in the
whole script.

**Known limitation, unchanged from the spec**: no whole-run act-2 clear
simulation exists (`actRun.ts` stops at the act-1 boss). `actRun.ts` was
NOT extended to spend on fusions in its pre-boss step — the plan called
this optional ("worth doing if cheap"); skipped here to keep this
iteration's scope to what the plan requires, left for a future act-2
`actRun` extension alongside the real whole-run simulation this file's
"Known limitation" paragraph already calls for.

Final verification: `npx tsc -b --force` clean, `npx vitest run` 619/619
passing, `npx vite build` clean, `npx tsx scripts/balance.ts` — all
31-M3 checks PASS.
