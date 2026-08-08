# Iteration 44 — Re-tune the act-1 economy (specced 2026-08-07)

> **Status: 44.1-44.2 done (2026-08-07), 44.3-44.4 not started.**
> `winReward`/`eliteReward` un-halved for act 1 (now identical to the act-2
> formula — `act` stays a parameter, unused for now, for whenever these
> two eras' economies need to diverge again). Re-measured with
> `actRun.ts`: **4.2%-16.4%**, matching sweep A's isolation result exactly
> and landing back in iteration 22's historical best-case territory
> (3.8%-20.8%) — see the correction below for why that's the right target,
> not a literal 40% nothing has ever hit. 682/682 vitest (4 stale
> hardcoded-credit expectations updated), `tsc -b --force` clean, `vite
> build` clean, `balance.ts` unchanged from baseline (same 2 known fails).
> 44.3 (re-check Ancient guardian) and 44.4 (gate re-calibration) still
> open.

## Where this came from

A playtester ran the game for ~90 minutes after this session's iteration
38-43 changes landed and reported: "player credit gain, and the cost of
ships may need to get looked at. Before the changes I had waaaaaay too
many credits, now I feel homeless" — plus a related complaint that the
"Ancient guardian" encounter (the act-1 hard-band elite) is now "quite
strong ... right before the boss." Both are the same root cause.

## Confirmed, with numbers

`actRun.ts` (500 runs/commander, current `main`) against the standing
40-85% clear-rate gate:

| Commander | Clear rate | Gate (40-85%) |
|---|---|---|
| No commander | 1.0% | informational |
| Merchant | 4.2% | FAIL |
| Engineer | 1.0% | FAIL |
| Spymaster | 1.0% | FAIL |
| Admiral | 4.6% | FAIL |
| Warlord | 0.6% | FAIL |

Every commander fails the floor by 8-70x. Deaths cluster overwhelmingly
at columns 5-10 — the mid/hard pool bands and the boss (`poolBand`:
easy ≤4, mid ≤7, hard 8+) — meaning players are surviving the early
columns fine and then running out of both credits and ship power exactly
where the hard-band elite (Ancient guardian) and the boss live. That's
also the entire explanation for the Ancient guardian complaint: it isn't
that the enemy got stronger, it's that players now arrive at it
underfunded.

**Three separate changes this session compound into this, none re-verified
against the gate after landing:**

1. **Act-1 credit halving** (iteration 39, segment B) — `winReward`/
   `eliteReward` in reducer.ts: `Math.floor((7 + col) / 2)` and
   `Math.floor((11 + col) / 2)` for act 1, vs. the un-halved `7 + col` /
   `11 + col` act 2 uses. A flat -50% on every single combat payout,
   9-10 fights a run.
2. **Weapon repricing** (iteration 40) — same stats, meaningfully higher
   prices, across nearly the whole roster: Plasma cannon 5→6cr, Rift
   cannon 5→6cr, Gauss lance 6→7cr, Heavy torpedo 5→7cr, Siege cannon
   7→9cr, Ion battery 5→6cr, **Antimatter cannon 7→12cr** (+71%, the
   single biggest jump, same 4 damage).
3. **Ship frame repricing** (iteration 41) — Bastion 9→12cr, Freighter
   15→18cr, Corvette 6→8cr, Derelict 3→4cr, to bundle in a starting
   weapon each. Reasoned as "the frame's price absorbs the weapon's own
   shop price" at the time, but never checked against the gate.

None of these three was wrong in isolation (the weapon reprice fixed a
real "why is Antimatter cheaper than Siege for more damage" problem; the
ship reprice fixed "an unarmed hull in the shop reads wrong"; the credit
halving was a deliberate, acknowledged call). The problem is they all
tightened the same knob (buying power) at once, and the balance gate —
which is informational, not a merge gate, per `PLAN.md`'s standing note —
never got re-run until this playtest surfaced it.

## 44.1 results (done, 2026-08-07)

Three independent `actRun.ts` sweeps, each rolling back exactly ONE of
the three changes above, measured, then cleanly reverted (git diff empty
on `parts.ts`/`frames.ts` afterward — nothing here changed the shipped
economy, this milestone is pure measurement):

| Sweep | What changed | Clear rate range | vs. baseline (0.6-4.6%) |
|---|---|---|---|
| Baseline | nothing (current `main`) | 0.6%-4.6% | — |
| A | credit halving only, reverted | 4.2%-16.4% | **~3-4x better** |
| B | weapon prices only, reverted | 0.8%-4.4% | statistically the same |
| C | ship frame prices only, reverted | 0.6%-4.6% | statistically identical |

**Credit halving is the dominant lever by a wide margin; weapon and ship
repricing are noise.** Sweeps B and C are worth explicitly *not* touching
— they fix real problems (Antimatter's price vs. Siege; unarmed hulls in
the shop) and rolling them back buys essentially nothing.

**But sweep A's 4.2-16.4%, even with credits fully un-halved, still
misses the 40% floor.** That surprised me enough to check the project's
own history before concluding anything further, and it changes this
plan's framing:

## Correction: the 40% floor has never once been met

`plans/iteration-22.md` — the last time anyone chased this exact gate —
documents its own best-ever result as **20.8%** (the Engineer), explicitly
logged as "still not met," and floats "revisit whether 40% is the right
number" as an open question, never resolved. `PLAN.md`'s standing note
confirms the balance gate has been informational-only, not a merge gate,
since iteration 5. So this was never a solved, then-broken target — it's
a target this project has never hit, that this session's credit halving
pushed much further out of reach than it already was.

That reframes the goal. **Sweep A's 4.2-16.4% band is not a failure to
fix — it's roughly a return to iteration 22's own historical best-case
territory** (3.8%-20.8%), which is the healthiest this economy has ever
measured. Chasing a literal 40% from here would mean re-opening a
standing, never-resolved balance question (is 40% even the right number
for how conservative `actRun.ts`'s buying policy is — it's a fixed
wishlist heuristic, not a real player, and likely under-represents what a
skilled human achieves) — a separate, bigger initiative from "undo the
damage this session did."

### 44.2 — Un-halve the credit cut (done, 2026-08-07)

Went with a full un-halve, not a partial soften — `winReward`/
`eliteReward` now return `7 + col` / `11 + col` for both acts, identical
to the pre-halving, pre-this-session formula. Re-measured: **4.2%-16.4%**,
matching sweep A's isolation result exactly (as it should — this change
*is* sweep A, made permanent) and landing in iteration 22's historical
3.8%-20.8% best-case band. Four tests had hardcoded halved-credit
expectations (the act-1 boss interlude payout, an ambush-win payout, the
act-1 opener's payout, and one more ambush-bonus case) — updated to the
un-halved numbers, not deleted; the halving is still worth remembering as
"tried, made things worse, reverted," which the comments in `reducer.ts`
now say explicitly.

### 44.3 — Re-check Ancient guardian specifically

Once the economy's back in the gate's band, re-run `balance.ts`'s
existing "strong fleet beats ancient guardian" fixture AND add a new one
for a realistic mid-progress fleet (not "strong") reaching the hard band
under the re-tuned economy — the gap 44.1 found (no fixture tests this
today) is itself worth closing regardless of what the number turns out
to be. If Ancient guardian is still a wall after the economy fix, it
needs its own targeted look; if the economy fix alone resolves it (likely,
per the "it's not the enemy, it's the wallet" read above), no enemy-side
change is needed at all.

### 44.4 — Full verification bar

`tsc -b --force`, `vitest run`, `vite build`, plus `actRun.ts` landing at
or above iteration 22's historical best-case band (roughly the low-to-
mid teens for the weakest commander) — not literal 40%, per the
correction above. If a future session wants to actually chase 40% for
real, that's iteration 22's still-open "revisit whether 40% is right"
question, and deserves its own scoped pass, not a rider on undoing this
session's regression.

## Decision points (recommend, don't yet commit)

1. **Which lever(s) to pull — resolved by measurement (44.1): credit
   halving, not weapon or ship prices.** Confirms the value of measuring
   over guessing — my hypothesis going in (credit halving dominant) was
   right, but weapon/ship reprices turned out to be pure noise, which
   wasn't obvious beforehand and would've wasted effort reverting them.
2. **Whether to re-arm `actRun.ts`'s gate as a real merge gate** —
   `PLAN.md`'s standing note already flags this as parked ("re-arm the
   balance gate once the feature pace slows"). Still recommend yes, but
   at a re-calibrated threshold, not the never-once-met 40% — something
   like "no commander regresses more than ~30% relative to the last
   measured baseline" would catch exactly this session's failure mode
   (three individually-reasonable changes silently compounding) without
   re-litigating whether 40% itself is achievable.
3. **Ancient guardian's own stats** — hold off touching them until 44.3
   shows whether they're actually still a problem post-retune, per the
   reasoning above.

## Milestones

- **44.1 — done.** Three isolated `actRun.ts` sweeps (credit-halving-only,
  weapon-price-only, ship-price-only rollbacks) against the 0.6-4.6%
  baseline. Result: credit halving alone -> 4.2-16.4% (dominant lever);
  weapon prices alone -> 0.8-4.4% (noise); ship prices alone -> 0.6-4.6%
  (noise). Surfaced that the 40% floor has never been met historically
  (iteration 22's best-ever was 20.8%) — reframed 44.2-44.4 accordingly.
- **44.2 — done.** Fully un-halved `winReward`/`eliteReward` for act 1
  (now identical to act 2). Re-measured: 4.2%-16.4%, matching sweep A and
  landing in iteration 22's historical 3.8%-20.8% band. 4 stale test
  expectations updated; full verification bar clean.
- **44.3** Re-check Ancient guardian under the re-tuned economy; add the
  missing "realistic mid-progress fleet vs. hard-band elite" fixture to
  `balance.ts`; only touch the enemy's own stats if it's still failing
  after the economy fix.
- **44.4** Decide on re-arming the clear-rate gate at a re-calibrated
  threshold (see decision point 2, not literal 40%); full verification
  bar.
