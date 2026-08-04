# Iteration 20 — The economy floor (specced 2026-08-03, not started)

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
