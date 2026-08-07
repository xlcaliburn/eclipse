# Iteration 33 — General store / shipyard split (specced 2026-08-07)

> **Status: implemented 2026-08-07.** This iteration also **supersedes
> iteration 31's Foundry placement decision** — the Foundry will render in
> shipyard nodes only, not every trade station, whenever 31 lands (noted
> in 31's status blockquote). Recommended next: iteration 32 (act-2
> expansion), whose quota table can now be written shipyard-aware.

User direction: "for act 1 also, to give more reason to path towards
shops and non-combat events, i think the regular shop could have less
options for ships (maybe only 2, maybe 'second-hand or rusted' versions
of ships), and acting more like a general store but can also buy repair.
then the other shop is more of a shipyard where you have more options of
ships to buy, and can also upgrade."

Today every trade station is the same store, so two shops on the chart
are interchangeable — routing toward a *specific* one is never a plan.
Splitting the node type in two gives shops identity: the **general
store** is the everywhere-errand (parts, war assets, repairs, a couple of
worn hulls at a discount), the **shipyard** is the destination (the full
hull catalog, pristine, plus paid upgrades — and, once iteration 31
lands, the Foundry). A player who wants a real fleet expansion now has a
reason to path three columns out of their way, which is the point.

## 33.1 The new node type

- `NodeType` gains `'shipyard'`. Both node types resolve to the existing
  `'shop'` **phase** — one screen, one reducer surface, branched by a new
  `RunState.shopKind?: 'store' | 'shipyard'` set in `PICK_NODE` (absent
  on old saves ⇒ treated as `'store'`, which matches what those saves'
  shops actually were).
- Fog: shipyards follow the shop rule (hidden until scouted/near), NOT
  the repair always-visible rule — a destination worth scouting toward is
  the design, and the info-broker/recon events get more valuable for
  free.
- Quota edits (act 1; act 2's are iteration 32's to place, per its
  quota table — if 32 somehow lands first the same swap applies to act
  2's current 3-row layout at cols 4 and 9):
  - col 3: **store** (stays `shop`, stays pinned row 1 — the guaranteed
    early errand run; a new player's first station should be the simple
    one).
  - col 5: `shop` → **`shipyard`** (mid-act: the "save up for a real
    hull" target, right where the mid pool starts biting).
  - col 8: **store** (stays `shop`).
  - col 9: `shop` → **`shipyard`** (the pre-boss splurge — arrive rich,
    leave armed).
  - Swapping non-combat types consumes no cargo draws, so **the rng
    stream and existing seeds are preserved** — unlike most quota edits,
    this one is stream-neutral (worth a comment in map.ts saying so).

## 33.2 The general store (the trimmed `shop`)

Everything it has today, minus hull breadth, plus a used-hull rack:

- Parts for sale (6 offers + reroll), war assets, repairs (2cr/HP, from
  this session), fleet management — all unchanged.
- **Hull offers drop 3 → 2, and both are second-hand**: priced at
  `floor(cost × 0.75)` and arriving with `ceil(maxHp / 3)` damage already
  on the hull ("rusted"). Same `STARTING_FIT`, same everything else — a
  discount you pay for in HP, which the store's own 2cr/HP repair bench
  will happily fix for part of the discount back (deliberate loop: a
  second-hand hull + full repair still nets cheaper than pristine, but
  not by much — the real second-hand play is flying it dented).
- Implementation: `BUY_SHIP` reads `state.shopKind`; `'store'` applies
  the discount + arrival damage. The Dreadnought stays act-2-only and
  additionally becomes **shipyard-only** (a 30cr capital ship on a
  used-hull rack reads wrong, and it concentrates the shipyard's draw) —
  `drawFrameOffers` gains a `kind` param filtering the pool.
- UI: frame cards in a store show a "SECOND-HAND" chip, the discounted
  price, and "arrives with N damage" appended to the blurb line.

## 33.3 The shipyard

- **Hull offers: 4, pristine, full price**, drawn from the full
  purchasable pool (Dreadnought eligible here in act 2 — nowhere else).
- **The upgrade bay**: one slotless upgrade (the `upgrades.ts` kind —
  reward-screen/overhaul kind, cap rules identical), drawn seeded on
  arrival (`RunState.shopUpgradeOffer?: UpgradeId`), purchasable once per
  visit for **12cr** with the established pick-a-ship interaction
  (RewardScreen's flow, reused). New action
  `BUY_UPGRADE { shipIndex }` — shop phase + `shopKind === 'shipyard'` +
  affordable + the ship passes the existing upgrade-cap check, clears
  `shopUpgradeOffer` on success. This is the third acquisition path for
  upgrades (rewards, overhauls, now purchase) — priced above both since
  it's the only one that costs no fight and no forgone repair.
- Repairs (2cr/HP) and fleet management (equip/unequip/sell/scuttle)
  stay — it's a yard.
- **No parts-for-sale section, no war assets, no reroll** — the shipyard
  sells hulls and permanence, not consumables. This asymmetry is the
  routing decision: need parts, path to a store; need hulls/upgrades,
  path to a yard.
- Foundry (iteration 31): when implemented, its section renders here and
  only here. 31's pricing/mechanics are otherwise unchanged.

## 33.4 Plumbing + UI

- `ShopScreen.tsx` branches on a new `kind` prop: title ("Trade station"
  / "Shipyard"), section visibility per the tables above, second-hand
  chips. One component, not two — the shared 80% (fleet panel, repairs,
  footer) stays in one place.
- `MapScreen.tsx` / `NodeGlyph.tsx`: `shipyard` label + glyph (distinct
  from the store's — the chart must telegraph which is which at a
  glance, that's the entire feature).
- `scripts/actRun.ts`: `chooseNode` scores `shipyard` like `shop`, and
  the sim's shop step treats it as a shop visit with the hull/upgrade
  purchase substituted for part-shopping where the wishlist calls for
  hulls. Honest-limitation note: the sim's shopping policy is
  wishlist-driven and won't capture "route 3 columns for the yard" —
  record the clear-rate delta anyway.
- Persistence: `shopKind`/`shopUpgradeOffer` optional-additive, no
  SAVE_VERSION bump; `isValidRunState`'s `'shop'` case keeps requiring
  `shopOffers` (a shipyard sets `shopOffers: []` — present, empty, valid).

## Verification

- Reducer tests: store buys apply discount + arrival damage (and the
  repair-cost loop prices as designed); shipyard BUY_UPGRADE respects
  cost/cap/once-per-visit; Dreadnought never offered outside an act-2
  shipyard (sweep draws, both kinds, both acts); rng-stream neutrality —
  a fixed seed's map is IDENTICAL before/after the quota type swaps
  except the swapped node types themselves.
- Standard bar + browser pass: store shows 2 second-hand hulls with
  chips/damage; buying one arrives dented and discounted; shipyard shows
  4 pristine + upgrade bay; upgrade purchase pins to a ship and
  disappears; chart glyphs distinguish the two; old save (no `shopKind`)
  loads as a store.

## Files touched (anticipated)

- `src/game/map.ts` — NodeType union + act-1 quota swaps.
- `src/game/types.ts` — `shopKind`, `shopUpgradeOffer`.
- `src/game/reducer.ts` — PICK_NODE branch, BUY_SHIP second-hand path,
  `drawFrameOffers(kind)`, `BUY_UPGRADE`.
- `src/game/fog.ts` — nothing (shipyard defaults to the hidden rule).
- `src/components/ShopScreen.tsx`, `MapScreen.tsx`, `NodeGlyph.tsx`,
  `src/styles.css`.
- `src/game/reducer.test.ts`, map tests, `scripts/actRun.ts`.

## Milestones

- **33-M1** — node type + quotas + shopKind plumbing + store second-hand
  mechanics, tests.
- **33-M2** — shipyard: offer table, upgrade bay, BUY_UPGRADE, UI split,
  glyphs.
- **33-M3** — actRun update + clear-rate note, browser pass, status
  notes here, in iteration-31 (placement supersession), and in PLAN.md.

## Implementation notes (2026-08-07)

Landed as specced, with the design decisions below made during
implementation (none deviate from the plan's intent, all fill in a detail
the spec left to the implementer).

- **Dreadnought exclusivity is layered, not just relocated.** It's
  simultaneously act-2-only (a same-day earlier change, not part of this
  plan) AND shipyard-only — `drawFrameOffers(rng, act, kind)` ANDs both
  gates in its pool filter, and `BUY_SHIP` carries the matching
  belt-and-suspenders check (`action.frameId === 'dreadnought' &&
  (state.act === 1 || state.shopKind !== 'shipyard')`), mirroring the
  act-only guard's own defense-in-depth precedent.
- **`frameCost` and `secondHandDamage` are the shared source of truth**
  for both the reducer and `ShopScreen`'s display — a store's frame card
  shows the exact price and exact arrival-damage number `BUY_SHIP` will
  actually apply, computed the same call both places. The second-hand
  multiplier (0.75) applies *last*, after any commander/protocol
  discount already in `frameCost` — confirmed via a dedicated test that
  the Admiral's 25% off stacks with the store's own 25% off
  (6cr → 4cr → 3cr), not overridden by it.
- **`BUY_UPGRADE` reuses `withUpgrade` unmodified** — a ship already at
  its upgrade cap has its oldest upgrade replaced, not refused, exactly
  matching `PICK_UPGRADE`'s existing behavior. Mercenaries are excluded
  (a guard the spec's prose implied but didn't spell out as its own
  bullet), matching the commodity lot's EQUIP-time guard and iteration
  31's fusion-exclusion rule for the same reason: a one-fight rental
  taking a permanent investment with it when it leaves is a footgun, not
  a choice.
- **rng-stream neutrality held exactly as predicted**: `shuffle`'s rng
  consumption is array-length-driven, not value-driven, so relabeling
  two quota entries from `'shop'` to `'shipyard'` (same array length, same
  position) doesn't change map generation's rng draws at all — verified
  both by the reasoning in the plan and by the fact no *other* seeded
  test in the suite needed its expected values touched, only the two
  tests that literally assert on the node-type strings themselves.
- **Deviation, cosmetic only:** the plain `'shop'` node's on-map label
  changed from "Shop" to "**Store**" (not spec'd explicitly, but implied
  by "general store" throughout) — the header title inside the screen
  itself already said "Trade station" either way, so this only affects
  the starchart node label, disambiguating it from "Shipyard" at a
  glance the same way the new border color and hexagon glyph do.
- **actRun.ts, measured**: `chooseNode` and the shop-visit switch both
  treat `'shipyard'` identically to `'shop'` (unmodeled split, as the
  plan accepted). Re-ran the 500-run/commander sim post-implementation:
  baseline/Engineer/Spymaster/Admiral/Warlord numbers were unchanged from
  the pre-33 run (8.4% / 23.6% / 8.4% / 4.6% / 10.4%), confirming the
  relabeling is genuinely inert for the sim's routing and purchasing
  logic. The Merchant ticked from 9.6% to 11.2% (avg spent 38→33cr,
  unspent 6→5cr) — a small, real shift with no code path that should
  cause it from this iteration's changes alone; not chased further since
  (a) this sim already fails the 40%+ gate for every commander, a
  pre-existing documented condition unrelated to this work, and (b) it
  is explicitly informational, not a merge gate. Flagged here rather
  than silently ignored, per house convention.
- **Verification**: `tsc -b --force` clean, `npx vitest run` 582/582
  (added ~15 new tests: store/shipyard BUY_SHIP pricing+damage, discount
  stacking, BUY_UPGRADE cost/cap/mercenary/offer-clearing, store-vs-
  shipyard offer counts, Dreadnought act+kind gating, upgrade-offer/
  parts-offer presence per kind), `npx vite build` clean. Live browser
  pass via hand-edited saves: a shipyard visit showed 4 pristine hulls +
  the upgrade bay, purchasing the offered upgrade attached it to the
  named ship and charged 12cr, the offer then read "Already fitted this
  visit"; a store visit showed exactly 2 SECOND-HAND-badged hulls with
  correct discounted prices and "Arrives with N damage" text, and buying
  one produced a ship with exactly that damage value in the save; the
  starchart rendered "Store" and "Shipyard" as visually distinct nodes
  (different border color, different glyph) at columns 5 and 9.
