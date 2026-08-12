# Iteration 52 — The shop economy: draw weights, and the hull refit (specced 2026-08-08)

> **Status: specced, not implemented.** Implementer: record deviations and
> verification results here, per the established style.

## Motivation (player feedback via the user, 2026-08-08)

Three of four reported items, all landing on the shop:

1. *"currently getting too much money and not enough buying options."*
2. *"players did like the idea of being able to fuse or permanently
   upgrade a ship"* — with the follow-up constraint: *"the fuse mechanic
   should be introduced so that it doesn't conflict with the other
   augments. i think it was just introduced in a confusing way."*
3. *"more diversity of ship options as currently the same 5 options
   basically show up each time. we need more rare tier options across
   the board."*

(The fourth item, mobile responsiveness, is
[iteration 53](plans/iteration-53.md) — separate spec per the user's
scoping decision.)

## Grounding — the audit that drove this (measured 2026-08-08, at 1d2a920)

### The catalog is inverted relative to the draw weights

`RARITY_WEIGHTS` (reducer/shop.ts) rolls **common 73% / rare 20% / epic
5% / legendary 2%**. The actual part catalog is the opposite shape:

| Rarity | Parts in catalog | Cost range (avg) | Draw weight |
|---|---|---|---|
| common | **9** | 2–4cr (3.1) | **0.73** |
| rare | 17 | 5–6cr (5.3) | 0.20 |
| epic | **21** | 7–9cr (8.0) | 0.05 |
| legendary | 3 | 12–13cr (12.3) | 0.02 |

`drawShopOffers` is also stratified by TYPE, which compounds it — per
slot, the common tier it rolls into 73% of the time contains:

| Stratified pool | slots/shop | common | rare | epic | legendary |
|---|---|---|---|---|---|
| WEAPON | 3 | **2** | 6 | 8 | 2 |
| DEFENSE | 3 | 5 | 8 | 7 | 1 |
| COMPUTER_DRIVE | 1 | **2** | 3 | 6 | 0 |
| ACTIVE | 1 | **0** | 2 | 9 | 0 |

So ~3/4 of every shop's 8 slots are drawn from pools of 2–5 items (the
ACTIVE pool has no commons at all — every common roll there already
falls back to rare via `drawRarityWeighted`'s tier walk), while the 21
epics — the largest group in the catalog — share a 5% roll.

**This one mis-tuning explains complaints 1 AND 3 simultaneously.**
Variety is low because 73% of offers come from the catalog's smallest
tier; money piles up because that tier is also its *cheapest*. Expected
cost to buy out an entire 8-slot shop today is **~32cr** (Σ weight ×
avg cost × 8), against 11–16cr income per act-1 fight from column 4 on —
two fights clears a whole shop.

### It also points the same direction as the balance gap

Iteration 51 measured act-1 clear at 7.2–12.6% against a 20–40% target
band. "Too much money, nothing to buy" and "clear rate too low" are the
same failure seen from two ends: the shop cannot convert credits into
power fast enough. Re-weighting toward the fat part of the catalog
raises both prices AND fleet strength, so it should push clear rates
UP toward the band rather than away from it. That is a prediction this
iteration must actually check (52.4), not an assumption.

### Enemy power does NOT scale with player wealth — it inverts

Asked directly by the user: *"do we currently have it scaling roughly
alongside the $ value of the equipment/ship value?"*

`scripts/enemyValue.ts` exists to answer exactly this — it prices an
enemy composition in credits using the player's own shop as the
yardstick, against an optimistic "won every fight, spent nothing"
budget. It had drifted badly (the three staleness bugs
plans/iteration-47.md's 47.7.3 catalogued: a hardcoded `winReward =
4 + col`, 4 live act-2 escalations, and act 2 frozen at 10 columns).
**Those three are now fixed** (2026-08-08, this session) so the numbers
below are real; see the file's own comments.

| Act 1 | c1 | c5 | c9 |
|---|---|---|---|
| Player budget (ceiling) | ~21cr | ~45cr | ~98cr |
| Worst combat node value | 45cr | 52cr | 51cr |
| **Enemy as % of budget** | **217%** | **115%** | **52%** |

| Act 2 | c0 | c5 | c11 |
|---|---|---|---|
| **Enemy as % of budget** | **54%** | **30%** | **29%** |

**Enemy value is nearly flat within an act while player budget grows
~5×.** Act 1 enemies go 45 → 52cr (+16%) across nine columns; the
budget goes 21 → 98cr (+367%). `veterancyBonus` is the only
column-linked scaling and it is +1 HP at c5–7, +2 at c8–9 — a rounding
error against a 5× wealth curve. The enemy pools change by band, which
is a step function, not a curve.

**Caveat, stated honestly**: this model prices dice and HP linearly, so
multi-ship formations (Missile swarm's 3 hulls) look expensive while
folding fast in a real fight — the balance table has a fresh fleet
beating that same c1 Missile swarm 88% of the time. So the *absolute*
early ratios overstate difficulty. **The robust signal is the trend, not
the level**: whatever the true starting point, the ratio falls
monotonically across every act.

That single fact ties together three separate things this project has
been chasing:

- **"Too much money" late** — by c8–9 the player can afford roughly
  twice what the enemy is worth, which is exactly when the complaint
  lands.
- **The death clusters** — iteration 51's data put ~half of act-1 deaths
  at c5–c7 and ~40–50% of act-2 entrants dying at global c11 (act-2
  column 0). Both are the *early* part of an act, precisely where this
  ratio is at its worst.
- **The act-2 entry wall** — act-1 c9's worst node is 51cr; act-2 c0's
  is 73cr, a 43% jump in one step (88cr for its elite), on top of the
  counter-protocol and a fresh escalation pair.

Fixing this is **[iteration 55](plans/iteration-55.md)**, deliberately
sequenced AFTER this iteration: enemy scaling cannot be tuned against an
economy that is about to change underneath it.

### Ships: the draw is nearly the whole roster

7 purchasable frames — common 3 (Interceptor 6cr, Derelict 4cr, Corvette
8cr), rare 2 (Bastion 12cr, Freighter 18cr), epic 1 (Cruiser 22cr),
legendary 1 (Dreadnought 30cr). `drawFrameOffers` gives a store **2**
(common+rare only → 5 candidates) and a shipyard **5**. The Dreadnought
is act-2-shipyard-only, so an act-1 shipyard draws **5 of 6** — you see
almost the entire roster every single visit. That is exactly the
reported "the same 5 options basically show up each time"; the number in
the complaint is literally the draw count.

With only 7 frames, within-visit choice and between-visit variety are in
direct tension — no draw count fixes both. This iteration takes the
cheap half (a modest count reduction plus rarity weighting, which alone
changes *which* hulls appear); the real fix is more hulls, deferred to
the content pass per the user's "re-weight first, then add content"
decision (see "Deferred" at the end).

## 52.1 Re-weight the rarity draw

`RARITY_WEIGHTS` (reducer/shop.ts) becomes:

```ts
const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 0.35,
  rare: 0.4,
  epic: 0.2,
  legendary: 0.05,
};
```

Expected effects, computed against the current catalog:

- **Shop clear cost ~32cr → ~43cr** (+36%): Σ(weight × tier avg cost) ×
  8 slots = 5.42cr/slot vs 3.97 today. Directly answers complaint 1.
- **Variety**: 60% of rolls now draw from the 17-rare and 21-epic pools
  instead of 73% from 9 commons. Answers complaint 3's part half.
- **Fleet strength up**, which per the section above is the intended
  direction given the 7–12% clear rate.

Notes for the implementer:

- The weights must still sum to 1.0 — `rollRarity` walks a cumulative
  sum with a floating-point guard returning 'legendary'; keep that.
- `rollRarity` has a direct tier-boundary unit test (exported for
  exactly this reason). It will need updating to the new cumulative
  boundaries — that is expected, not a regression.
- Legendary 0.02 → 0.05 means ~0.4 legendary offers per 8-slot shop
  (one every ~2.5 shops, vs ~1 in 6 today). With only 3 legendary parts
  in the catalog that may read as too frequent; it is the most likely
  knob to want a second look after measurement. Flag it in the status
  notes either way.
- `drawFrameOffers` shares `drawRarityWeighted`, so frame draws
  re-weight too: epic/legendary hulls (Cruiser, Dreadnought) will appear
  materially more often. Combined with `hullRarityBonus` — a shipyard
  purchase's free bonus items scale with the hull's rarity tier — this
  compounds into more free items as well as better hulls. Watch it in
  52.4; it is the most plausible source of an over-correction.

## 52.2 Frame draw count

`drawFrameOffers`: shipyard count **5 → 4**. Store stays at 2.

Rationale: 4-of-6 gives 15 distinct act-1 combinations vs the current
6, at the cost of one fewer choice per visit. This is deliberately a
modest move, not a fix — with a 7-frame roster the tension is
structural. Leave a comment saying the count should be revisited (likely
back up) once the content pass widens the roster.

## 52.3 The hull refit — a buyable permanent ship upgrade

**The design problem this solves.** Players liked the removed Foundry's
*idea* (permanently improving a ship you own) but found it confusing.
The concrete reason it was confusing: augments already occupy the
"permanent slotless bonus" niche, and four of the seven are pure stat
bumps (`spine` +2 HP, `reactor` +1 computer, `lattice` +1 piloting,
`drives` +2 initiative) — so a second permanent stat channel was a
duplicate system by construction. The old version compounded that by
*consuming an inventory part* on top of a credit cost, so one item had
two unrelated uses ("equip it, or feed it to the Foundry?").

**The fix: refit the HULL, not the fittings.** Augments are earned
gadgets bolted onto a ship; a refit rebuilds the ship itself into a
bigger frame. Different verb, different axis, different acquisition
(earned vs bought), zero shared state — and it needs no new stat
channel, no new item type, and no new content, because the frame ladder
already exists.

### The rule

At a **shipyard**, trade a ship up into a bigger hull. It keeps
everything that made it *that ship*: equipped parts, augments, name,
kills, fights survived.

- **Price**: `getFrame(target).cost - hullScrapValue(current.frameId)` —
  the new hull, less a trade-in for the old one. `hullScrapValue`
  already exists (`floor(cost/2)`, used by the Lone flagship protocol),
  so the trade-in reuses the game's existing "what's a used hull worth"
  answer rather than inventing a second one. Example: Interceptor (6cr)
  → Cruiser (22cr) costs 22 − 3 = **19cr**.
- **Target must be in `shopFrameOffers`** — you can only trade into a
  hull this shipyard actually has in stock, same as `BUY_SHIP`. Buying
  consumes the offer; so does a refit.
- **Legal targets only.** All four must hold:
  1. `getFrame(target).cost > getFrame(current).cost` — a refit is an
     upgrade, never a sidegrade or a downgrade.
  2. `getFrame(target).slots >= ship.equipped.length` — never orphan a
     fitted part.
  3. `target.maxWeapons === undefined || target.maxWeapons >=
     equippedWeaponCount(ship.equipped)` — never orphan a weapon (an
     Interceptor with 3 weapons cannot become a Bastion, cap 1).
  4. The Dreadnought keeps its existing act-2 + shipyard gate, same
     check `BUY_SHIP` already makes.
- **The Flagship can never be refit.** `frameId === 'cruiser'` is load-
  bearing across the codebase — `withFlagshipRecoveryGate`, the Lone
  flagship protocol's +2 slots/+2 HP, `SCUTTLE_SHIP`'s "the fleet can
  never be emptied" guarantee all key off it. Refitting it away would
  break all three. Guard explicitly and comment why.
- **Mercenaries can never be refit** — a one-fight rental takes no
  permanent investment, the same rule augments already follow.
- **Damage must be clamped**: `damage = Math.min(damage, newMaxHp - 1)`.
  A cost-increasing refit does NOT guarantee an HP increase (Bastion
  12cr/6HP → Freighter 18cr/3HP is legal by every rule above), so an
  unclamped refit could kill the ship outright. Derive `newMaxHp` via
  `deriveStats` on the new frame with the same parts/upgrades/protocols.

### Why this is the sink the economy needs

`MAX_FLEET_SIZE` is 4. A wealthy player at fleet cap currently has
nothing left to buy but parts they already have — precisely the reported
complaint. The refit is the only way to grow *after* the cap, so it
absorbs exactly the late-run surplus that has nowhere to go today, and
it scales: the ladder tops out at a 30cr Dreadnought, so a full
Interceptor → Dreadnought path is a genuine multi-shop project.

### Implementation

- New action `{ type: 'REFIT_SHIP'; shipIndex: number; frameId:
  Exclude<FrameId, 'cruiser'> }` on `RunAction`, handled in
  `reducer/shop.ts`'s `handleShopAction` (it is a shop action in every
  sense — phase, gating, offer consumption).
- Export a `canRefit(ship, targetFrameId, state)` predicate from
  `reducer/shop.ts` so `ShipyardSections`/`ShopScreen` can render legal
  targets without duplicating the four rules. The reducer case must call
  the same predicate — one source of truth, the discipline
  `MERCENARY_FIT`/`partSellPrice` were exported for.
- Export `refitCost(currentFrameId, targetFrameId)` likewise.
- UI: a "Refit" section in the shipyard (alongside the hull rack), one
  row per non-Flagship, non-mercenary ship, showing its legal targets
  and prices. Reuse `ShipPickRow` if it fits; otherwise follow its
  shape. A toast on success, matching every other shop purchase
  (`shopToastText.ts`).
- `scripts/sim/agent.ts`: add `REFIT_SHIP` to `HANDLED_ACTIONS` (the
  compile error when the variant lands is the guard working), and give
  the agent a simple heuristic so the sink is actually MEASURED rather
  than invisible: at fleet cap, in a shipyard, refit the cheapest-hull
  non-Flagship ship into the most expensive legal target it can afford.
  Without this the refit is invisible to `balance:full` (the fleet-
  orders precedent) and 52.4 cannot evaluate it.
- Wiki: the frames table is data-driven; add a line on refit to whatever
  section covers shops.

## 52.4 Further credit sinks

User direction: *"i think it's good for the player to buy stuff"* — so
these are all things to BUY, not taxes. Ordered by
value-per-implementation-cost. **Implement 1 and 2; treat 3 and 4 as
optional if the measurement in 52.5 says the surplus is still there.**

### 1. Part tier-up — trade a fitted part up its own ladder

The catalog already contains explicit stat ladders (`hull1/2/3`,
`shield1/2/3`, `comp1/2/3`, `init2/3`) and weapon tiers (ion → plasma →
antimatter). Let a shipyard trade a **fitted** part up one tier for the
price difference plus a premium, keeping the slot filled.

Why it is the best of these: it needs no new content, it is the same
"trade in toward better" verb as 52.3's hull refit (one concept, two
scales — a player who understands one understands the other), it soaks
credits continuously rather than in one lump, and it directly answers
"nothing to buy" for a player whose slots are all full — currently the
single most common late-run state with nothing to spend on.

Needs a declared ladder table (`PART_TIER_UP: Partial<Record<PartId,
PartId>>`) in `parts.ts`, next to the ladder it describes. Price it the
same way the refit is priced — `getPart(next).cost -
partSellPrice(current)` — so both trade-ins use one rule.

### 2. Fleet-capacity expansion — buy the 5th berth

`MAX_FLEET_SIZE` is 4 (the Admiral gets 5). A one-time, expensive
shipyard purchase (+1 permanent fleet slot, hard-capped at one) is a
large, clean, late-run sink that unlocks *more purchases* rather than
being an end in itself — money spent to enable spending, which is the
compounding shape this economy wants.

Interacts with `fleetCap(commanderId, protocols)`: it must ADD to
whatever that returns rather than overriding, so it composes with the
Admiral's 5 and with Armada mandate's +2, and Lone flagship's hard-set
1 must still win (that protocol's whole premise). Store as an optional
`RunState.purchasedFleetBerths?: number`.

### 3. Choose-your-augment at the shipyard (optional)

The removed `BUY_UPGRADE` sold one *random* upgrade for 12cr. Bring it
back letting the player **pick** from the full list, priced well above
the old 12cr. Zero new mechanics — it is the existing augment system —
but note it is capped hard by `upgradeCapFor` (1 per ship, 3 for the
Warlord's Flagship), so it soaks far less than 1 or 2 unless that cap
also rises. Flag rather than silently raising the cap: that cap is what
makes elite drops feel earned.

### 4. Heat laundering (optional)

Pay credits at a shop to drop pursuit heat by 1. Ties the economy to a
system it currently never touches, and gives a wealthy player a way to
buy out of the interception the heat track threatens. Cheap to build
(`addHeat(state.heat, -1)` behind a price). Keep the price high enough
that it never becomes the default answer to routing.

### Explicitly rejected

- **Shop reroll**: removed outright on 2026-08-08 (see PLAN.md's
  fourteen-item polish batch). It was removed deliberately; re-adding it
  as a sink would relitigate that decision without new evidence, which
  the project's own planning rules forbid.
- **Column-scaled part prices (inflation)**: it would flatten the
  surplus curve directly, but it is a tax, not something to buy — it
  makes the player poorer without giving them anything, which is the
  opposite of the user's stated intent.

## 52.5 Measurement

Run before and after the whole iteration, and record both in the status
notes:

- `npm run balance:full` — per-commander act-1 clear / act-2 conditional
  / full-run, plus the c5–c7 and c11 death spikes. **Prediction to
  test**: act-1 clear rises toward the 20–40% band (the shop converts
  credits into power faster now). If it rises past 40%, the re-weight
  over-corrected — say so and propose the trim rather than shipping it
  silently. Baseline at 1d2a920: baseline 12.4%, merchant 12.6%,
  engineer 12.6%, spymaster 9.6%, admiral 9.0%, warlord 11.8%; act-2
  conditional 0% everywhere.
- `npm run balance` — the matchup table simulates HAND-BUILT fixture
  fleets, so it must be **unchanged**; any movement means something
  leaked into `deriveStats`/frames and should be investigated, not
  accepted.
- Report the measured shop-clear cost change (a few lines of arithmetic
  over the new weights is enough — no new tooling).

Standard bar per milestone: `npx tsc -b --force` clean project-wide,
`npx vitest run` green (report the count; 808 at 1d2a920), `npx vite
build` clean. No browser passes (CLAUDE.md).

## Tests

- `rollRarity` boundary test updated to the new cumulative bands.
- `drawShopOffers`: existing uniqueness invariants still hold across
  many seeds (unchanged behavior, new weights).
- `drawFrameOffers`: shipyard returns 4; store still 2; store still
  never yields epic/legendary.
- `refitCost` arithmetic, including the trade-in.
- `canRefit`: each of the four legality rules gets a case, plus the
  Flagship guard and the mercenary guard.
- `REFIT_SHIP` reducer: happy path preserves parts/augments/name/kills/
  fightsSurvived and consumes the frame offer + credits; damage clamps
  on an HP-reducing refit (Bastion → Freighter is the concrete case);
  rejected outside a shipyard, at insufficient credits, on the Flagship,
  on a mercenary, and for a target not in `shopFrameOffers`.

## Deferred (the content pass — user's explicit sequencing)

The user chose "re-weight first, then add content" so the two effects
stay attributable. That content pass is now specced as
**[iteration 54](plans/iteration-54.md)** — and it grew: rather than
simply adding more hulls, the user redirected it toward *hull identity*
(typed weapon-only/systems-only slots, clearly marked, plus a named
innate trait per frame), with new rare-tier hulls layered on top of that
foundation. Gaps this audit found, carried into 54 as its seed data:

- **Frames**: 7 total is too few for any draw count to feel varied;
  rare tier has only 2 entries (Bastion, Freighter). The single biggest
  content gap.
- **ACTIVE parts**: 0 common, 2 rare, 9 epic — the thinnest and most
  top-heavy pool in the game.
- **COMPUTER_DRIVE**: 11 parts total, 0 legendary — and no frame
  currently favours computer/drive builds.
- Once the roster is wider, revisit 52.2's shipyard count (likely back
  up from 4).
