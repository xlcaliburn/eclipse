# Iteration 26 — Act-1 boss re-tune + a card-trade bug fix (specced + implemented 2026-08-05)

Two independent fixes, both from direct player feedback:

> "I had two cruisers with multiple weapons on each plus the starting
> Warlord ship, the first boss two shots me every run."

> "Why can I trade in a bulkhead and it gives me another bulkhead" — from
> one of the events.

## 26.1 Act-1 mid-boss re-tune (GCDS + Dreadnought)

### Root cause

`scripts/balance.ts`'s existing Monte-Carlo matchup table only ever
exercised its near-maximum "strong fleet" fixture (~67cr, effectively
perfect end-of-act-1 play) against the act-1 mid-bosses. Two of the three
possible bosses — GCDS and Dreadnought, each drawn with equal 1-in-3
probability at every run's column-10 boss fight — had a **flat 0% win
rate in 1000 sims** against every other existing reference fleet. This
was known and previously accepted: iteration 22.3's own comment on GCDS
states outright that its 3rd cannon die "made every below-'strong' fleet's
win rate 0% pre-nerf" and kept the die anyway, because the only sanity
check that existed was strong-fleet-shaped.

Added a new fixture, `'col10 solid fleet'` (~31cr: a Flagship with 2
weapons + computer + hull/shield, one Interceptor escort — solid,
reasonably-shopped play, not minmaxed), to `scripts/balance.ts`'s `FLEETS`
table, one step down from `'strong fleet'`. It confirmed the same 0%
against GCDS and Dreadnought — the entire middle of the difficulty curve
had a wall in it, not a slope, and the player feedback is exactly that gap
made visible.

### The fix

Both bosses were re-tuned via the same isolate-one-variable-at-a-time
method, checked after each change with `npx tsx scripts/balance.ts` (the
`raw + attackerComputer - defenderShield >= 6` hit threshold is discrete,
so a combined multi-stat change can't be attributed after the fact):

- **GCDS**: cannon dice 3→2 (cuts the solo-target burst that deleted a
  low-HP escort before the player got a real round back), shield 2→1 and
  computer 2→1 (col10-solid fleet's low average computer, ~0-2, could
  barely dent shield 2 at all, and GCDS's own computer was the dominant
  lever chewing through the escort's 0-shield HP). HP (tried at 7/10/14)
  barely moved strong fleet's win rate at all — it wins too fast for fight
  length to matter — while dragging col10-solid's down, so it stayed at
  its original 10.
  **Result: col10 solid fleet 0% → 52%, strong fleet 55% → 100%.**
- **Dreadnought**: shield 2→1, computer 3→1, cannons cut from 3 dice
  (2d2+1d4) to 2 (1d2+1d3) — same logic as GCDS, isolated the same way.
  **Result: col10 solid fleet 0% → 50%, strong fleet 29% → 100%.**

Strong fleet landing at ~100% for both is a deliberate acceptance, not a
miss: every lever that pulls it down (raising the boss's shield or
computer) pulls col10-solid's win rate down by a much larger amount — the
two fleet tiers aren't separable using this boss's stats alone, given the
size of the gap between them. The player's complaint was specifically
about a solid-but-not-maxed build losing every run, not about a
near-maxed build winning too easily, so col10-solid fleet is the fixture
these two bosses are now tuned against.

**Hive Mother** (the third boss) was checked against the same fixture and
found already healthy (col10 solid fleet 81%) — left untouched. Its
pre-existing, separately-flagged issue (100% for strong fleet, unresolved
since iteration 22.6 — a 3-ship fleet with 4+ cannon dice one-shots its
4x 1-2-HP ships regardless of shield/HP tuning) is out of scope here; it
was never the boss the "two-shots me" feedback was about.

`scripts/balance.ts`'s sanity-check gates were updated to match: GCDS and
Dreadnought now gate on `'col10 solid fleet' in 20-60%` (both pass) plus a
loosened `'strong fleet' >= 60%` floor (documented as intentionally
uncapped); Hive Mother gets an added `'col10 solid fleet' >= 60%` floor
check (passes, 81%) alongside its pre-existing, still-failing strong-fleet
band check (left as a documented KNOWN FAIL, unchanged from iteration
22.6).

## 26.2 Fix: trading in a card could hand back that exact card

`events.ts`'s `abandoned-arsenal` event's "Restock" option (trade in a
card, take a crate) redrew the new card via an unweighted, unfiltered pick
over the entire card pool. With only 2 cards total in `CARDS` (`bulkheads`,
`volley` — a deliberately small pool since iteration 7's card-system trim),
that redraw had a flat 50% chance of handing back the exact card just
traded away — reading as a broken reward rather than bad luck.

`randomCard()` now takes an optional `exclude: CardId` parameter,
filtering it out of the draw pool (falling back to the full pool if
excluding would leave it empty — doesn't happen today at 2 cards, but
keeps this correct if the pool ever grows to 1). `abandoned-arsenal`'s
Restock branch passes the traded card as the exclusion. The other
`chooseCard: true` event, `militia-requisition`, was checked and confirmed
unaffected — it only grants credits, never hands a card back.

## Files touched

- `src/game/enemies.ts` — GCDS and Dreadnought stat blocks + docstrings;
  Hive Mother docstring addendum (no stat change).
- `scripts/balance.ts` — new `'col10 solid fleet'` fixture; sanity-check
  gates re-pointed at it for GCDS/Dreadnought/Hive Mother.
- `src/game/events.ts` — `randomCard(rng, exclude?)`; `abandoned-arsenal`'s
  Restock branch passes `exclude`.
- `src/game/events.test.ts` — new regression test sweeping 20 rng values
  to confirm Restock never returns the traded-in card at any roll (the
  pre-existing test used one fixed sample that happened not to trigger the
  bug).

## Verification

`tsc -b --force` clean. `npx vitest run` — 497/497 (was 496; +1 new
regression test). `npx vite build` clean. `npx tsx scripts/balance.ts` —
all sanity checks pass except the pre-existing, unchanged, documented
Hive-Mother-vs-strong-fleet KNOWN FAIL.
