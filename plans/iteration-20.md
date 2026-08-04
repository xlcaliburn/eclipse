# Iteration 20 — The economy floor (specced 2026-08-03; implemented 2026-08-04 — mechanics shipped, clear-rate gate NOT met, see status notes)

**Goal: a player who actually engages with the economy has a high chance of
clearing act 1.** Measured, not vibes: `scripts/actRun.ts` simulates 500
full act-1 runs on real generated maps with a deliberately-mediocre
purchasing policy (buys a sensible wishlist, repairs when hurt, plays no
cards). Today that policy clears act 1 **~0%** of the time.

Why, per the sim + `scripts/balance.ts` + `scripts/enemyValue.ts`:

1. **Income can't reach the required fleet.** A full act-1 route is ~6
   fights earning ~50–60cr; the fleet that reliably beats the act costs
   ~66cr in parts/ships — before any repair spending.
2. **Damage carryover is the dominant killer.** A stock fleet beats a
   Missile frigate 90% fresh but 48% carrying 2 damage. Runs are a spiral,
   not independent fights.
3. **Late wealth has no mouth.** Credits held at the boss column buy
   nothing (act-2 final boss especially).

The fix direction (user's call, 2026-08-03): **more non-combat income and
patch-up, not weaker fights.** Combat tuning already landed separately
(GCDS nerf, act-1 elites scale with column, squadrons centerpiece
exemption) and is NOT part of this iteration.

Everything here builds on the iteration-14 event framework
(`EventDef`/`EventOption`/`resolveEventChoice` in `events.ts`) and existing
machinery — pointers inline. All numbers are opening proposals; the sim
gate (20.6), not the numbers, is the spec.

## 20.1 Salvage claims — heat-priced income

New pool event `salvage-claim` ("Unclaimed wreck field" — a debris field
worth real money, if you loiter):

- Option A: *Leave it* — nothing.
- Option B: *Strip the field* — **+8cr, +1 heat**.
- Option C: *Thorough sweep* — **+12cr, +2 heat**.

This makes the heat track's design literal: safe income exists, priced in
pursuit. Self-limiting by construction — at heat 4 the next non-combat
node is intercepted (reducer PICK_NODE), so farming wrecks at Hunted means
buying the next ambush. State the current heat tier in the option labels
so the price is legible.

Plumbing: `resolveEventChoice`'s result type gains an optional
`heatDelta`; the reducer applies it via `addHeat` (heat.ts) exactly where
it applies credit deltas. No other event framework changes.

## 20.2 Fleet triage — blunting the spiral

Extend the existing `repair-tender` event (events.ts — currently: 4cr
repairs 3 on ONE chosen ship, or free via Damage control bay):

- New option: *Full-fleet overhaul* — **8cr, every ship repairs 2**
  (requirement `creditsAtLeast 8`). Fleet-wide triage between the
  single-ship patch and a full repair yard.

Deliberately small: the Engineer's over-repair doctrine (iteration 21)
builds on repair effects generally, so this iteration only needs the
baseline sources to exist and appear often enough (20.4).

## 20.3 Commodity runs — buy low, sell high

Shops offer a **commodity lot**:

- Every shop stocks one lot at **4cr** while the fleet carries none
  (fleet-wide cap: 1 lot; the Merchant raises this in iteration 21).
- Buying it works exactly like the delivery quest's pod
  (`CARGO_POD_PART_ID` precedent in parts.ts/reducer.ts): a new
  `COMMODITY_LOT_PART_ID` part occupying one hardpoint on a chosen ship,
  zero stats, not sellable as a part, movable with the existing
  MOVE_CARGO_POD-style action or its own equivalent.
- Any **later** shop shows *Sell lot — 9cr* (+5 profit). Same-shop
  flipping is impossible by construction (shops are forward-only nodes),
  but guard on the recorded purchase column anyway
  (`lotBoughtAtGlobalColumn` on RunState) so a future revisit mechanic
  can't break it.
- The risk is the point: the lot ties up a slot for columns, and dies
  with the ship carrying it.

Persistence note: additive optional RunState fields only — mirror them in
`persistence.ts`'s `isValidRunState` per the project's save-shape rule.

## 20.4 Node mix — the floor has to be reachable

Two quota edits in map.ts (ACT1_QUOTAS / ACT2_QUOTAS):

- **Pre-boss shop guarantee:** the last lane column of each act includes a
  shop. Proposal: act 1 col 9 `['repair','elite','combat']` →
  `['repair','shop','elite']`; act 2 col 9 `['elite','combat','event']` →
  `['shop','elite','combat']`. Arriving rich becomes a plan, not a hope.
- **One more event node in act 1:** col 1 `['combat','combat','combat']` →
  `['combat','combat','event']`. With 20.1 in the pool, event nodes are
  now income nodes; this also trims one damage-intake node from the act.

## 20.5 War assets — giving late money a mouth

- **Shops sell one reaction card** each (from CARDS, cards.ts), priced
  5–7cr, buyable when the hand is below MAX_HAND_SIZE. A rich player
  converts credits into a full hand before the boss — wealth becomes
  exactly one fight's worth of power.
- **Mercenary escort (stretch — drop first if the iteration runs long):**
  a shop offer, **12cr**, adds a temporary stock Interceptor for the
  *next combat only* (RunState `mercenary?` consumed when the prep-screen
  fleet is derived; gone after the fight regardless of outcome, no
  salvage, doesn't count against MAX_FLEET_SIZE). The Merchant discount
  hook lands in iteration 21.

## 20.6 Verification — the sim is the gate

- Update `scripts/actRun.ts`'s policy to use the new economy: take
  salvage options when heat allows, buy/sell lots when routing passes two
  shops, buy the fleet-wide tender repair when damaged, buy a card before
  the boss.
- **Gate: baseline-policy act-1 clear rate ≥ 40%** (band 40–60%; the
  policy plays no cards in combat, never withdraws, and routes greedily,
  so real players sit well above it). Record the number in this file's
  status notes.
- Per-fight sanity via `scripts/balance.ts` unchanged (that table gates
  combat tuning, which this iteration must not touch).
- Unit tests: salvage heatDelta application + Hunted interplay; lot
  buy/sell lifecycle incl. carrier destruction and the cap; quota edits
  (shop present in final lane columns); card purchase respects
  MAX_HAND_SIZE; mercenary joins exactly one fight (if built).
- Standing bar: `npm test` green, `tsc -b` clean, `vite build` clean.

## Sequencing note

Iteration 21 (commander doctrines) layers per-commander amplifiers on
these mechanics. It must NOT land first or together: the clear-rate gate
above has to hold for **every** commander with no doctrine help, or the
act is only clearable by the right pick — which is the bug, relocated.

## Status notes (2026-08-04)

**All of 20.1–20.5 shipped, with two deviations from the spec text below.
20.6's gate (≥40%) was NOT met — see the finding at the end, which is the
part of this write-up that actually matters for what happens next.**

### What shipped, and where it differs from the spec above

- **20.1 (salvage claims):** shipped as specced. No `heatDelta` plumbing
  was needed — `resolveEventChoice` already returns the whole next
  `RunState`, so the resolver just sets `heat: addHeat(state.heat, 1|2)`
  directly, the same way every other event sets `credits`. Labels state
  the flat heat cost in text ("+1 heat" / "+2 heat") rather than the
  current heat *tier* — the player already has the HUD's heat pips and
  hover tooltip for that; making `EventOption.label` state-dependent
  would have been new architecture for a small legibility gain.
- **20.2 (fleet triage):** shipped as specced — `repair-tender` option 3,
  8cr for -2 damage on every ship.
- **20.3 (commodity runs):** shipped as specced, with one simplification:
  **no move-between-ships action.** The carrier is chosen once, at
  purchase; there's no `MOVE_COMMODITY_LOT` mirroring `MOVE_CARGO_POD`.
  Adding one felt like real surface (a new action, a new FleetPanel
  affordance) for a convenience the core buy-low/sell-high loop doesn't
  need — noted here rather than silently dropped in case it's missed
  later. `carrierIndex` is found each time by scanning
  `fleet[i].equipped` for `COMMODITY_LOT_PART_ID` rather than stored, so
  there's nothing to re-index on scuttle (unlike the delivery quest's
  `carrierShipIndex`, which the existing SCUTTLE_SHIP code does have to
  re-index).
- **20.4 (node mix):** shipped, plus a fix made *during* 20.6's sim work.
  The first cut of the pre-boss-shop edit for act 1 dropped 'combat' to
  make room for 'shop' (`['repair','elite','combat']` →
  `['repair','shop','elite']`), unlike act 2's edit, which dropped
  'repair' instead. That left column 9 — right before the boss — with no
  plain-combat option at all, only repair/shop/elite. Reverted to match
  act 2 exactly: `['shop','elite','combat']`, dropping repair, keeping
  both elite and combat. Both `map.ts` and its test-file mirror
  (`map.test.ts`) reflect the corrected version.
- **20.5 (war assets):** **card sales were dropped, not shipped** — see
  below. The mercenary escort shipped, promoted from "stretch, drop
  first" to the primary (only) mechanic here, since it turned out simpler
  than expected: it's just a normal `PlayerShipState` with a `mercenary:
  true` flag, added to the real fleet like `BUY_SHIP` does, then stripped
  out (no salvage, not counted in `shipsLost`) in both the CONTINUE-win
  and WITHDRAW cleanup loops once its one fight is over. `BUY_COMMODITY_LOT`
  also refuses to load a lot onto a mercenary ship — otherwise the lot
  would silently vanish with it after the fight, a footgun rather than a
  rule.

  **Why cards were dropped:** `cards.ts` states outright — "iteration 7:
  cards are found, never bought — the shop no longer sells them." The
  20.5 spec text above ("shops sell one reaction card") was written
  without knowing that law existed, and reverses it. That's a real
  conflict between an explicit prior design decision and this iteration's
  own spec, not a style choice — flagging it here rather than either
  silently overriding iteration 7 or silently dropping the feature
  without saying so. The mercenary escort covers the same "give late
  wealth a mouth" goal without the conflict.

### Also shipped: reducer/persistence plumbing

Two new `RunAction` cases (`BUY_COMMODITY_LOT`, `SELL_COMMODITY_LOT`,
`BUY_MERCENARY`), a shared `isSalvageablePart` helper (both pseudo-parts
excluded from salvage at all three destruction sites plus `SCUTTLE_SHIP`,
replacing three separate ad hoc `!== CARGO_POD_PART_ID` filters that would
otherwise have needed a matching addition each), a "War assets" section in
`ShopScreen.tsx`. `RunState.commodityLotBoughtAtGlobalColumn` and
`PlayerShipState.mercenary` are both optional with read-site fallbacks —
no `SAVE_VERSION` bump, same reasoning `persistence.ts` already documents
for iteration 18's additions. 25 new unit tests across `events.test.ts`
and `reducer.test.ts` (heat application incl. the MAX_HEAT clamp, the
fleet-wide overhaul's per-ship math, the lot's full buy/sell/salvage/
scuttle/unequip-refusal lifecycle including the mercenary-carrier refusal,
and the mercenary's removal after every combat outcome — win-survived,
win-destroyed, and withdrawal).

### The clear-rate finding

`scripts/actRun.ts` was rewritten to actually spend on the new economy
(salvage claims when heat ≤ 2, the fleet-wide overhaul when hurt and
affordable, immediate lot-flipping through any second shop visit, a
mercenary with genuine leftover credits right before the boss) and to run
on the real map generator with the corrected quotas above.

Along the way, two **routing-policy bugs** (not balance, not economy —
bugs in the simulated player's decision-making) turned out to be doing
more damage than anything else measured:

- The original scoring preferred an **elite over plain combat whenever
  healthy** (60 vs 50), regardless of how little the fleet had spent yet.
  `c4:elite` alone — one enemy, one column — caused **30% of every run's
  deaths**, more than `c4:combat`. A policy that deliberately walks into
  the harder of two available fights that early isn't "not optimal," it's
  self-defeating. Fixed: elites now always score below combat (35/5 vs
  50); routing noise still occasionally takes one anyway.
- With no shop or repair node reachable at all before column 3, a fleet
  hurt by column 1's fight had no way to avoid stacking a second fight's
  damage onto the first — except the event node, which the original
  scoring ranked *below* combat even while hurt. Fixed: event now
  outscores combat once the fleet is carrying real damage (a hurt player
  gambling on one of 13 events over a certain second fight, not a
  guaranteed heal).

Fixing both — plus reordering the purchasing wishlist to front-load two
cheap tier-1 defensive parts instead of four offense/accuracy buys before
any survivability — measurably changed the shape of every run: average
credits spent before dying roughly tripled (5–6cr → 15–17cr), deaths
pushed later and spread across more columns instead of clustering at one,
and average fights survived rose. **None of it moved the headline number.**
Every configuration tried landed at 0–0.2% (0–1 of 500 runs).

**The decisive diagnostic:** the sim has a `POST_WIN_REPAIR` env knob
(pre-existing, from the session that first found the ~0% baseline) that
fully heals the fleet after every single win — eliminating damage
carryover entirely, not just blunting it. Run with it maxed out, clear
rate was still **~0% (1/500)**, with `c4:combat` alone still killing
**277 of 500 runs**, unchanged in scale even with the "damage spiral" this
whole iteration was pointed at completely switched off:

```
POST_WIN_REPAIR=99 npx tsx scripts/actRun.ts
  ACT-1 CLEAR RATE: 0%   (1/500)
  deaths by col+type: c4:combat=277  c6:combat=70  c7:combat=55 ...
```

That rules out damage carryover as the binding constraint at this point —
it's a real effect (worth having fixed; see the routing-policy fixes
above), but it is no longer *the* wall. The wall is that **the base
per-fight win rate at columns 4 and 6 (the first two mid-pool columns) is
too low for the amount a fleet can have bought by then, full stop** —
independent of whether that fleet enters the fight damaged or pristine.
`scripts/balance.ts`'s own reference table already showed this: a
"col3-typical fleet" (~12cr spent, matching what this sim's policy has by
column 4) wins 44% against Shield cruiser, 80% against Sniper, 87% against
Interceptor swarm. Clearing a ~40%-clear-rate act needs roughly an 8-fight
gauntlet (opener + ~6 lane fights + boss) to each average **~90%** —
0.9⁸ ≈ 43% — not 44–87%. That gap is arithmetic, not a tuning nudge.

**This is a scope boundary, not an implementation gap, and it's the
user's call, not mine to make unilaterally:**

1. Income arrives on a fixed schedule (shop visits at fixed columns; event
   nodes pay modest, largely flat amounts) — no non-combat mechanic can
   make a column-4 fleet meaningfully richer than ~1–2 shop visits' worth,
   because *visit frequency*, not per-visit generosity, is what's
   binding that early. Every economy lever in this iteration was pushed
   as far as it reasonably goes without becoming absurd (e.g. multiple
   free lot flips per shop, salvage claims paying more than a whole
   combat win) and it wasn't enough, because the shortfall isn't "not
   enough money," it's "not enough fights won per credit spent."
2. Closing the arithmetic gap for real needs the per-fight side: either
   the mid pool's difficulty at columns 4–6 comes down, or `poolBand`
   pushes the easy→mid transition later, or both — i.e. **combat tuning**,
   which this iteration's own spec explicitly ruled out of scope
   ("Combat tuning already landed separately ... and is NOT part of this
   iteration"). Extending into it now would blur which iteration made the
   act clearable — the thing that spec line was written to prevent — and
   is exactly the kind of change the standing instructions say to stop
   and check on rather than decide alone.
3. Alternative: treat 20's mechanics as complete and valuable in their own
   right (they are — better early-game texture, a functioning trade loop,
   damage-spiral mitigation, a use for late wealth) and revisit whether
   ≥40% was ever an achievable target through economy alone, independent
   of whether combat gets touched.

Recommendation, not a decision: reopen `poolBand` (enemies.ts) — pushing
easy→mid from column 3 to column 4, mid→hard from column 6 to column
7 — as a small, targeted follow-up, and re-run `scripts/actRun.ts` against
this same policy before deciding whether anything else needs to move.
That one number, checked against the diagnostic above, will say directly
whether the pool bands were the whole gap or just part of it.

Not committed. `npm test` (446 tests, all passing), `tsc -b`, and
`vite build` are all clean regardless of the open gate question above —
the economy mechanics themselves are correct and shippable independent of
how the clear-rate question resolves.
