# Iteration 52 — Hulls: identity, variety, and trading up (respecced 2026-08-12)

> **Status: implemented and verified, in 2 attributable stages** per
> 52.7's discipline. `npx tsc -b --force` clean project-wide at every
> checkpoint; `npx vitest run` green throughout (808 at b7ea8d2 → 812
> after stage (a) → 825 after stage (b)); `npx vite build` clean at every
> checkpoint. No browser/preview passes, per repo CLAUDE.md. See the
> status notes at the end of this file for the full measurement tables,
> the fixture audit, deviations from the spec's exact text, and the one
> deliberately-not-fixed pre-existing statistical flake.
>
> **This is a rewrite.** The first draft of iteration 52 (committed
> b7ea8d2) was rejected, and iteration 54's hull-identity spec is folded
> in — `plans/iteration-54.md` is deleted and 54 is a deliberate gap in
> the numbering, not a reused slot. The roster below was settled with the
> user over several rounds on 2026-08-12; **[iteration
> 57](plans/iteration-57.md)** (ship power budgets) is its direct
> follow-on and the two were designed together (not implemented here —
> out of this iteration's scope).

## Motivation

Player feedback, 2026-08-08:

1. *"currently getting too much money and not enough buying options."*
2. *"players did like the idea of being able to fuse or permanently
   upgrade a ship"* — with: *"the fuse mechanic should be introduced so
   that it doesn't conflict with the other augments. i think it was just
   introduced in a confusing way."*
3. *"more diversity of ship options as currently the same 5 options
   basically show up each time."*
4. *"i also want to have 'weapon only' or computer only etc slots be
   clearly marked and also a unique feature for different shapes of ship
   bases."*

User direction, 2026-08-12:

> *"i don't like iteration 52 as it currently stands - redo it. let's
> combine 54 together into it. i don't want to change the rarity weights,
> i want more lower tier ship options, with different frames."*

> *"i like frigate, but also add gunboat (for even more guns), picket is
> good, sloop is good, i want to add a few more epic variants battleship
> (move dreadnought to epic), then have Valkyrie, Titan, Aegis as 3
> legendary frames. adjust the ship slots and power levels. i also want
> to display the UI such that it is more distinct that certain slots are
> for weapons only, or for certain equips"*

> *"i do like disruptor as well."*

> *"I like the idea of having lower tiers be more restrictive, and higher
> tiers being stronger while still having a clear identity."*

### Why no rarity re-weighting

The rejected draft's centrepiece was re-weighting the shop draw (common
73% → 35%). **Dropped — no weight changes.** The user's alternative is
better matched to the existing machinery: the draw rolls **common 73% of
the time** and the frame roster has only **3 commons**, so feeding that
tier beats re-pointing the dial at tiers the catalog is thin in. Taking
the roster 7 → 17 makes the act-1 shipyard draw 5-of-~13 instead of
5-of-6 — the reported "same 5 options every time" — **without touching a
single weight**.

## Grounding (audited 2026-08-08 at 1d2a920, still current)

- `Frame` = `{ id, name, slots: number, baseInitiative, baseHp, cost,
  rarity, blurb, maxWeapons?: number }`. 13 entries, 7 purchasable.
- `PartType` = `'weapon' | 'computer' | 'shield' | 'hull' | 'drive' |
  'cargo'`. The `cargo` member is the commodity lot — an edge case in
  52.1.
- **`ShipStats` fields available to an innate trait** (verified in
  `types.ts`): `initiative`, `hp`, `computer`, `shield`, `shieldPierce`,
  `flak`, `taunt`, `reactiveArmor`, `onDestroyDamage`, `ablative`,
  `capacitorShield`, `cloak`, `jink`. Note **`fleetShieldAura` is NOT
  one** — it lives on `Part` and is applied in the fleet-wide derive, so
  a declarative trait cannot grant it.
- `shieldPierce` is documented in `types.ts` as a deliberately-preserved
  **dormant engine hook** awaiting "a future part/upgrade to reuse" —
  Dreadnought's trait below is exactly that revival.
- `drawShopOffers` strata the catalog into WEAPON, DEFENSE
  (shield+hull), COMPUTER_DRIVE, plus a cross-cutting ACTIVE pool. **The
  slot kinds in 52.1 deliberately reuse those categories**, so a hull's
  sockets and the shop's stock speak one vocabulary.
- `effectiveSlots(frameId, upgrades, protocols, commanderId)` = frame
  slots + `bay` upgrades + Lone-flagship +2 (cruiser) + Warlord +1
  (cruiser). Consumers: `FleetOverlay`, `FleetPanel`, EQUIP, the shop's
  bonus-item fitting, `scripts/sim`'s `agent.canFit`/`budget.hasRoom`.
- **Jink is already an innate hull trait in all but name** —
  `deriveStats` contains `if (frameId === 'interceptor') stats.jink =
  true`. The pattern 52.3 formalizes already exists as a one-off.
- The 5 retired legacy hulls (`frigate`, `tender`, `ew-cutter`,
  `disruptor-cutter`, `aegis`) are still in `FRAMES` for save
  compatibility. Their retirement comment sets a condition: *"Do not
  resurrect without giving each a genuine base-level reason to exist."*
  **This iteration supplies exactly that** — typed slots and innate
  traits — and all five come back.

## 52.1 Typed slots

```ts
export type SlotKind = 'universal' | 'weapon' | 'defense' | 'systems';
```

| Slot kind | accepts `PartType` |
|---|---|
| `weapon` | `weapon` |
| `defense` | `shield`, `hull` |
| `systems` | `computer`, `drive` |
| `universal` | anything, including `cargo` |

`Frame` gains `slotLayout: SlotKind[]` and **loses both `slots` and
`maxWeapons`**, which become derived:

- `frameSlots(frame) = frame.slotLayout.length`
- weapon ceiling = `count('weapon') + count('universal')`

**`cargo` is universal-only**, so **every frame must keep at least one
`universal` slot** or it could never carry a commodity lot. Assert over
all of `FRAMES`, legacy entries included.

**Bonus slots stay universal.** `effectiveSlots` becomes
`effectiveSlotLayout(...)` = the frame's layout plus one `'universal'`
per `bay` upgrade / Lone-flagship bonus / Warlord bonus. Granted slots
have never had a type and should not gain one. Keep a thin
`effectiveSlots()` returning `.length` so "empty slot count" call sites
don't all change.

**Legality check.** An `equipped: PartId[]` is legal iff:

```
overflow = max(0, nWeapon  - dWeapon)
         + max(0, nDefense - dDefense)
         + max(0, nSystems - dSystems)
         + nCargo
legal    = overflow <= dUniversal
```

Exactly the feasibility condition for this structure (each category maps
to its dedicated slots ∪ the shared universal pool) — no matching
algorithm needed. Export
`canEquip(frameId, equipped, partId, upgrades, protocols, commanderId)`
computing it with the candidate included; **EQUIP, the shop's bonus-item
fitting, `agent.canFit` and `budget.hasRoom` all call it** rather than
re-deriving. It replaces today's separate slot-count and `maxWeapons`
checks everywhere.

`PlayerShipState.equipped` stays a flat `PartId[]` — parts are never
assigned to slot indices, only checked for feasibility. Save shape and
fixture construction are unchanged.

**Save compatibility**: an existing save can hold a loadout legal today
and illegal under the new layouts, stranding EQUIP/UNEQUIP. **Bump
`SAVE_VERSION`** — the same call made for v5's `heat` and v7's combat
fields. This also frees the legacy frame ids to be repurposed (52.4).

## 52.2 Slot marking in the UI

The user asked specifically for slots to be *visually distinct by kind*.
Go beyond a subtle chip — **three redundant cues** so it reads at a
glance and survives colourblindness:

- **Colour** per kind — weapon on the danger/accent hue, defense on the
  shield hue, systems on the computer hue, universal neutral/outlined.
- **Icon** per kind, reusing/extending `PartIcon`'s existing type
  iconography so a `weapon` slot chip and a weapon part read as one
  family.
- **A letter or short label** (W / D / S / •) for when colour and icon
  are both ambiguous at small sizes.

**Filled vs empty is its own state** — an empty weapon-only slot should
look like it is *waiting for a weapon*, not merely blank.

A shared `<SlotRow layout equipped />` component (following the
established `ShipPickRow` / `FitChips` / `UpgradeBadgeRow` pattern),
rendered on:

- **the shop's frame cards** — the layout must be visible *before*
  buying; with 17 hulls this is where it matters most
- ship cards in `FleetPanel` and `FleetOverlay`
- the prep screen
- 52.5's refit rows (so the player sees the shape they're trading into)

When a part cannot be equipped anywhere, say *why* ("no free weapon
slot") rather than silently disabling — a dead click is the exact
failure mode iteration 47.1 had to fix once already for the
Lone-flagship slot bug.

Mobile: iteration 53 just re-derived the combat dock's height budget;
`<SlotRow>` appears on fleet/shop surfaces rather than in that dock, but
check it does not overflow at ≤720px.

## 52.3 Innate hull traits

```ts
// on Frame
innate?: { name: string; description: string; grants: Partial<ShipStats> };
```

Folded in by `deriveStats` immediately after the frame's base stats, so
parts and upgrades stack on top as today.

**Declarative `grants` only.** Every trait in 52.4 reuses a `ShipStats`
field the engine already honours, so the combat engine needs **no
changes at all**. A trait needing a new engine hook is a separate,
called-out addition — do not smuggle one in.

**Design rule, applied throughout**: prefer *countable* stats (`flak`,
`reactiveArmor`, `ablative`, `capacitorShield`, `shieldPierce`) over
*binary flags* (`taunt`, `cloak`). A binary flag granted innately
obsoletes the part whose whole identity it is — innate taunt on a cheap
hull would kill the lure beacon. The two exceptions are deliberate:

- **Jink** is already frame-only; no part grants it.
- **Taunt on Aegis** is allowed *because it is a 42cr legendary* — that
  does not undercut a cheap lure beacon for the other 16 hulls the way
  a 12cr Bastion would have.

Not every hull gets a trait. Cruiser explicitly stays "no gimmick" as
the baseline others are read against, and several hulls' identity is
their layout alone.

## 52.4 The roster: 7 → 17 purchasable frames

### Legacy id mapping (all five revived)

| id | New name | Tier | Note |
|---|---|---|---|
| `frigate` | **Frigate** | common | keeps its name |
| `ew-cutter` | **Picket** | common | |
| `tender` | **Sloop** | common | |
| `disruptor-cutter` | **Disruptor** | rare | keeps its identity |
| `aegis` | **Aegis** | legendary | promoted; keeps its name |

Repurposing these ids is safe because 52.1 bumps `SAVE_VERSION`. Add
them to `PURCHASABLE_FRAME_IDS` and rewrite the legacy comment in
`frames.ts` to record that iteration 52 supplied the missing reason and
un-retired them.

### The roster

`W` = weapon-only, `D` = defense, `S` = systems, `U` = universal.
**Power** is not implemented here — it is [iteration
57](plans/iteration-57.md) — but is listed so the two iterations are
designed as one coherent progression. Every number is a starting point;
the balance sim arbitrates (52.7).

**Common** — 73% of rolls, the tier being widened

| Frame | Cost | Layout | HP | Init | Power* | Innate |
|---|---|---|---|---|---|---|
| Derelict | 4 | `U U` | 2 | 0 | 2 | — |
| Interceptor | 6 | `W S U` | 2 | 2 | 3 | Jink |
| Frigate | 7 | `W W U` | 3 | 0 | 3 | — |
| Corvette | 8 | `U U S` | 2 | 1 | 4 | `capacitorShield: 1` |
| Picket | 8 | `S S U` | 2 | 2 | 4 | — |
| Sloop | 9 | `U U U` | 3 | 1 | 4 | — |

**Rare** — 20%

| Frame | Cost | Layout | HP | Init | Power* | Innate |
|---|---|---|---|---|---|---|
| Bastion | 12 | `W D D` | 6 | 0 | 5 | `reactiveArmor: 1` |
| Disruptor | 13 | `S S D U` | 3 | 1 | 6 | `flak: 1` |
| Gunboat | 14 | `W W W U` | 3 | 1 | 6 | — |
| Freighter | 18 | `W U U U S` | 3 | 0 | 7 | — |

**Epic** — 5%

| Frame | Cost | Layout | HP | Init | Power* | Innate |
|---|---|---|---|---|---|---|
| Cruiser | 22 | `W W U U` | 4 | 1 | 9 | — *(the deliberate "no gimmick" baseline)* |
| Destroyer | 24 | `W W S U U` | 5 | 3 | 10 | — |
| Battleship | 28 | `W W W D D U` | 7 | 0 | 11 | — |
| Dreadnought | 30 | `W W W W D D U U` | 8 | 0 | 12 | `shieldPierce: 1` |

**Legendary** — 2%

| Frame | Cost | Layout | HP | Init | Power* | Innate |
|---|---|---|---|---|---|---|
| Valkyrie | 38 | `W W W S U U` | 6 | 4 | 14 | Jink |
| Aegis | 42 | `D D D W U U S` | 10 | 0 | 15 | `taunt: true` |
| Titan | 48 | `W W W W D D U U U` | 12 | 0 | 18 | `ablative: 3` |

**Flagship** (`cruiser`, never purchasable): layout
`W W U U U U` (6 slots, universal-heavy — forced by the balance
fixtures, see 52.6), power* 10.

### Tier gating

The act-2-shipyard gate currently hardcoded to the Dreadnought **moves
to legendary tier generally** — Dreadnought is epic now, and Valkyrie /
Aegis / Titan are the new giants. Without this a Titan could appear at
act-1 column 1. Stores already never stock epic or legendary, so epics
remain shipyard-only by the existing rule.

### Draw counts stay as they are

The rejected draft cut the shipyard draw 5 → 4 to buy variety.
**Unnecessary now**: with ~13 act-1-eligible hulls the shipyard draws 5
of 13 instead of 5 of 6, and the store 2 of ~10 instead of 2 of 5.
Leave `drawFrameOffers`'s counts alone; note in its comment that roster
width is what makes them work.

## 52.5 The hull refit

Players liked the removed Foundry's *idea* but found it confusing. The
concrete reason: augments already occupy the "permanent slotless bonus"
niche, and four of seven are pure stat bumps, so a second permanent stat
channel was a duplicate by construction. The old version compounded it
by *consuming an inventory part* on top of credits, giving one item two
unrelated uses.

**Refit the HULL, not the fittings.** Augments are earned gadgets bolted
on; a refit rebuilds the ship into a bigger frame. Different verb,
different axis, different acquisition (earned vs bought), no shared
state, no new stat channel — and with a 17-hull roster there is a real
ladder to climb.

At a **shipyard**, trade a ship up, keeping what made it that ship:
equipped parts, augments, name, kills, fights survived.

- **Price**: `getFrame(target).cost - hullScrapValue(current.frameId)` —
  the new hull less a trade-in on the old. `hullScrapValue` already
  exists (`floor(cost/2)`, used by Lone flagship), so the trade-in reuses
  the game's existing "what is a used hull worth" answer.
- **Target must be in `shopFrameOffers`** — you can only trade into a
  hull this shipyard has in stock, same as `BUY_SHIP`; both consume the
  offer.
- **Legal targets** — all must hold:
  1. `getFrame(target).cost > getFrame(current).cost` — an upgrade,
     never a sidegrade or downgrade.
  2. The ship's current `equipped` is **legal against the target's
     `slotLayout`** — reuse 52.1's `canEquip` feasibility check directly.
     This subsumes the old draft's separate slot-count and weapon-cap
     rules. (Once iteration 57 lands, it must also satisfy the target's
     power budget — 57 owns that addition.)
  3. Legendary targets keep the act-2 + shipyard gate.
- **The Flagship can never be refit.** `frameId === 'cruiser'` is
  load-bearing for `withFlagshipRecoveryGate`, Lone flagship's +2
  slots/HP, and `SCUTTLE_SHIP`'s "the fleet can never be emptied"
  guarantee. Guard explicitly and comment why.
- **Mercenaries can never be refit** — a one-fight rental takes no
  permanent investment, the rule augments already follow.
- **Clamp damage**: `damage = Math.min(damage, newMaxHp - 1)`. A
  cost-increasing refit does not guarantee an HP increase (Bastion
  12cr/6HP → Freighter 18cr/3HP is legal by every rule above), so an
  unclamped refit could kill the ship outright.

Implementation: `{ type: 'REFIT_SHIP'; shipIndex; frameId }` handled in
`reducer/shop.ts`'s `handleShopAction`; export `canRefit(...)` and
`refitCost(...)` so the UI renders legal targets without duplicating the
rules, and have the reducer call the same predicate. UI: a "Refit"
section in the shipyard listing each eligible ship's legal targets with
prices and a `<SlotRow>` per target. Toast on success. Add `REFIT_SHIP`
to `scripts/sim/agent.ts`'s `HANDLED_ACTIONS` plus a simple heuristic
(at fleet cap, refit the cheapest hull into the best affordable legal
target) so the sink is measured rather than invisible.

## 52.6 Fixture audit — the main implementation risk

Ships are hand-constructed in many places and any can become illegal
under the new layouts. **Audit every one before touching balance
numbers** — an illegal fixture silently changes what the balance table
measures:

- `scripts/balance.ts` — `STRONG_FLEET`, `ENDGAME_FLEET`,
  `STRIKE_FLEET`, `NO_SPEED_CONTROL` and the rest. The Flagship fixtures
  carry 6 mixed parts (`plasma, plasma, comp3, hull2, init3, shield1`),
  which is why the Flagship layout above is universal-heavy.
- `scripts/sim/budget.ts`'s `PRIORITY` lists and `buildFleet`.
- `scripts/sim/policy.ts`'s per-archetype `partPriority` — an archetype
  whose list no longer fits its `framePriority` hulls will silently
  under-build.
- `STARTING_FIT` (reducer/shop.ts) — **every purchasable hull's arrival
  loadout, including all 10 new/revived ones**, must be legal under its
  own layout.
- `STARTING_LOADOUT` (parts.ts) — the Flagship's opening fit.
- Test fixtures across `reducer.test.ts`, `ship.test.ts`,
  `combatEngine.test.ts`.

Add a test asserting every `STARTING_FIT` entry and `STARTING_LOADOUT`
is legal against its frame's layout, so this cannot reappear silently.

## 52.7 Implementation order and measurement

Sequence internally so a balance swing is attributable — the discipline
iteration 51 used:

**(a) Typed slots + UI + traits, retro-fitted to the existing 7 frames.**
Measure. Typed slots constrain builds (a nerf); traits are a buff.
Report the net.

**(b) The 10 new/revived hulls + the refit.** Measure again.

Per stage: `npx tsc -b --force` clean project-wide, `npx vitest run`
green (report the count; 808 at b7ea8d2), `npx vite build` clean.

- `npm run balance` — the matchup table **will** move at stage (a)
  (innate traits change fixture fleets' stats). Record before/after per
  matchup; a trait swinging a column more than ~10pp deserves a second
  look.
- `npm run balance:full` — per-commander clear rates against the b7ea8d2
  baseline (baseline 12.4%, merchant 12.6%, engineer 12.6%, spymaster
  9.6%, admiral 9.0%, warlord 11.8%; act-2 conditional 0% everywhere).
- `npx tsx scripts/enemyValue.ts` — the roster changes what a given
  budget can field, which is iteration 55's input. Record it.
- No browser passes (CLAUDE.md).

**Watch for**: the legendary tier roughly doubles top-end power. At 2%
draw odds and 38–48cr they are rare and expensive, but if clear rates
jump sharply at stage (b) the legendary stats are the first suspect.

## Open questions

1. **Slot rigidity** — the layouts above lean flexible (the Flagship
   especially, forced by 52.6's fixtures). Sharper, more dedicated
   layouts are possible if the identities read as too soft in play.
2. **Battleship vs Dreadnought** — both are heavy epics; Battleship is
   differentiated by layout alone (3 weapon + 2 defense dedicated) and
   carries no innate. If they read as too similar, Battleship is the one
   to give a trait.
3. **Weapon-cap semantics** — deriving the ceiling as `weapon +
   universal` slots means a universal-heavy hull can go all-weapons
   (the Sloop, notably). If some hulls need a hard cap regardless, that
   needs a separate explicit field.

## Status notes (implementer, 2026-08-12)

### Summary

Implemented in the 2 stages 52.7 specifies, with a real checkpoint
between them: stage (a) landed `SlotKind`/`Frame.slotLayout`/`canEquip`/
`effectiveSlotLayout` (52.1), the `<SlotRow>` UI (52.2), and innate traits
folded into `deriveStats` (52.3) — retrofitted to the original 7
purchasable frames only. `PURCHASABLE_FRAME_IDS` and Dreadnought's rarity
were deliberately held at their pre-52 values through stage (a)'s
measurement even though `frames.ts` already carried the full 17-frame
final data (writing it once, then gating exposure via two flags, was less
error-prone than writing the file twice) — the balance scripts only ever
see what's actually purchasable/rollable, so this kept the two stages'
numbers genuinely attributable without literal double-authoring. Stage
(b) then flipped both flags, added `REFIT_SHIP`/`canRefit`/`refitCost`
(52.5) plus its shipyard UI section, and generalized the act-2-shipyard
gate from a hardcoded `'dreadnought'` check to `rarity === 'legendary'`.

### Files changed

Core: `src/game/frames.ts` (rewritten — `SlotKind`, `Frame.slotLayout`,
`Frame.innate`, all 17 frame entries, `frameSlots`), `src/game/ship.ts`
(`canEquip`, `layoutCanHold`, `effectiveSlotLayout`, `equipBlockReason`,
`weaponCeiling`, `slotKindForPartType`, innate-folding in `deriveStats`,
jink hardcode removed), `src/game/types.ts` (no changes — every innate
trait reuses an existing `ShipStats` field, per 52.3's rule),
`src/game/reducer.ts` (EQUIP now calls `canEquip`; `REFIT_SHIP` added to
`RunAction` and delegated to `handleShopAction`; re-exports for
`canRefit`/`refitCost`), `src/game/reducer/shop.ts` (`STARTING_FIT`
grown to 17 entries, `hullRarityBonus` rewritten around `canEquip`,
`drawFrameOffers`/`BUY_SHIP`'s legendary gate generalized, `canRefit`/
`refitCost`/the `REFIT_SHIP` case added), `src/game/persistence.ts`
(`SAVE_VERSION` 7 → 8).

UI: `src/components/SlotRow.tsx` (new), `src/components/PartIcon.tsx`
(`SlotKindIcon` added), `src/components/PartCard.tsx` (`title` prop),
`src/components/FleetPanel.tsx` (`<SlotRow>` + per-part
`equipBlockReason` messaging), `src/components/FleetOverlay.tsx`
(`<SlotRow>`), `src/components/ShopScreen.tsx` (`<SlotRow>` on frame
cards, `act` prop, `<ShipyardRefitSection>` wired in),
`src/components/ShipyardRefitSection.tsx` (new), `src/components/
shopToastText.ts` (`REFIT_SHIP` toast), `src/components/
ShipSilhouette.tsx` (5 new hull silhouettes), `src/game/shipNames.ts`
(`HULL_CODE` grown to 17 entries), `src/wiki/Wiki.tsx` (hull table
rewritten around `<SlotRow>` + `weaponCeiling` + an Innate column),
`src/styles.css` (`.slot-row`/`.slot-chip`/`.shop-screen__refits`/
`.refit-row`).

`scripts/`: `scripts/sim/agent.ts` (`canFit` delegates to `canEquip`;
`buyCommodityLot`'s carrier search fixed to use it too — see the
liveness-bug note below; `buyHull`'s dreadnought-specific gate
generalized; `refitHull` heuristic + `REFIT_SHIP` in
`HANDLED_ACTIONS`), `scripts/sim/budget.ts` (`hasRoom` delegates to
`canEquip`), `scripts/sim/budget.test.ts` (weapon-cap test rewritten
around `weaponCeiling`), `scripts/sim/policy.ts` (`framePriority`
widened per-archetype — see below).

Tests: `src/game/ship.test.ts` (52.6's guard test block), `src/game/
reducer.test.ts` (fixture/assertion updates — see below).

### The fixture audit (52.6) — what had to change and why

- **Bastion's layout deviates from the spec's literal `W D D` table
  entry only in this: it has ZERO universal slots**, which conflicts
  with 52.1's own stated invariant ("every frame must keep at least one
  universal slot... assert over all of FRAMES"). This is a genuine
  self-contradiction in the spec (the roster table's Bastion row and the
  universal-slot invariant can't both hold) — resolved in Bastion's
  favor: keeping zero universal slots makes its 1-weapon cap
  **structural** (no overflow budget for a 2nd weapon at all), which is
  exactly what a pre-existing regression test
  (`reducer.test.ts`, "a Bastion (max 1 weapon) refuses a second weapon
  but accepts a second non-weapon part") already locked in, and matches
  the "durable protector, one gun" identity the roster table's own HP/
  cost numbers were clearly written around. The alternative (adding a
  universal slot so Bastion can carry a commodity lot) would have let a
  2nd weapon in via overflow, silently changing that identity. Documented
  in `frames.ts`'s own comment and asserted in `ship.test.ts`'s guard
  test as the one deliberate exception, rather than silently violated.
- **`scripts/balance.ts`'s fixtures needed NO changes** — audited every
  one (`STRONG_FLEET`, `ENDGAME_FLEET`, `STRIKE_FLEET`,
  `NO_SPEED_CONTROL`, the `FLEETS` table). The Flagship layout
  (`W W U U U U`) was chosen specifically so the heaviest of them (6 mixed
  parts, up to 3 weapons via overflow) stays legal — see frames.ts's own
  comment on that frame. `bastion`/`interceptor` fixtures elsewhere in
  that file were already within their new typed budgets by construction.
- **`scripts/sim/budget.ts`/`policy.ts`**: `hasRoom` swapped to
  `canEquip` (was hand-rolling the old `maxWeapons` check, which no
  longer compiles once `Frame.maxWeapons` is gone). `policy.ts`'s
  `framePriority` lists were widened beyond the letter of the spec's ask
  — left untouched, a wider roster competing for the same shop-offer
  slots would only have DILUTED how often each archetype's 2-3 preferred
  ids show up, with the agent never able to take advantage of the new
  hulls to compensate (52.6's own flagged risk: "an archetype whose list
  no longer fits its framePriority hulls will silently under-build" —
  the mirror-image failure mode, an archetype that never LOOKS at the new
  hulls at all). Widened each archetype with 1-3 new-roster ids that fit
  its existing doctrine (`balanced`: + Frigate, Gunboat; `tank-taunt`: +
  Aegis, its own doctrine's legendary endpoint; `alpha-missile`: +
  Gunboat; `outspeed`: + Destroyer, base initiative 3; `wide`: +
  Derelict, Frigate). `tall` (never buys an escort) untouched.
- **A real liveness bug caught by `scripts/sim/agent.test.ts`**:
  `agent.ts`'s `buyCommodityLot` picked a "carrier" ship via a plain
  `equipped.length < effectiveSlots(...)` count check — under typed
  slots, a ship can have numeric room while having ZERO free universal
  slots (every one already spent on overflow from another category), and
  the commodity lot is universal-only. This let the agent believe an
  EQUIP would succeed when `canEquip` would actually refuse it —
  exactly the reducer/policy mismatch the liveness test exists to catch.
  Fixed by routing through `canFit` (== `canEquip`) like every other
  equip decision in that file.
- **`STARTING_FIT`/`STARTING_LOADOUT`**: every entry (all 17 purchasable
  frames plus the Flagship) is legal against its own frame's
  `slotLayout` — asserted by the new guard test in `ship.test.ts`
  (52.6's explicit ask), incrementally (each part added on top of the
  previous, mirroring how a real EQUIP sequence would build it up).
- **`reducer.test.ts`**: ~119 hand-built `PlayerShipState` fixtures exist
  in this file; the overwhelming majority needed no changes at all,
  since an "illegal" `equipped` array is inert until something calls
  `canEquip` against it (parts are never slot-indexed — see 52.1). Only
  fixtures that were BOTH illegal under the new layouts AND actually
  exercised by an EQUIP/BUY_SHIP dispatch in that same test needed
  rewriting:
  - The Lone-flagship/Warlord bonus-slot tests built a Flagship "full at
    base capacity" with 6x `comp1` (all systems-type) — illegal under
    the Flagship's `W W U U U U` layout (only 4 universal slots can hold
    a systems-type item, not 6). Rewritten to 2x `ion` + 4x `comp1`
    (fills the 2 weapon + 4 universal slots exactly), preserving the
    tests' actual point (the bonus slots are usable, not just
    displayed).
  - The Dreadnought "4-weapon cap enforced" test hardcoded the old flat
    `maxWeapons: 4`. The real ceiling under typed slots is 6 (4 dedicated
    + 2 universal — see the Open Questions #3 discussion this
    predates), a genuine, intentional behavior change. Split into two
    tests: the original purchase-mechanics assertions (now with no cap
    language) and a new isolated test proving the real ceiling (6, not
    8 — the 2 still-empty DEFENSE slots aren't touched by a weapon
    overflow at all).
  - `'aegis'`'s "legacy hull still derives stats" test expected the
    pre-52 `baseHp: 2` — un-retirement changed that to `10`; updated and
    renamed to also assert the new innate `taunt`.
  - The "five retired support hulls are gone from the shop pool" test's
    entire premise inverted (they're un-retired) — replaced with a test
    asserting they're purchasable under their 52.4-roster names.
  - Three tests hardcoded `'dreadnought'` as the act-2/shipyard-gated
    example (now epic, not gated) — repointed to `'titan'` (a genuine
    legendary) for the gate-refusal cases, and a new test added
    confirming Dreadnought itself is now buyable in an act-1 shipyard.
  - `"every purchasable frame arrives at 0 damage"` looped all 17
    purchasable frames buying each at a STORE; 3 more legendary ids now
    exist beyond Dreadnought and are correctly refused there — the loop's
    skip condition generalized from `frameId === 'dreadnought'` to
    `getFrame(frameId).rarity === 'legendary'`.

### Deviations from the spec's exact text

- **Bastion's universal-slot exception** — covered above; the one
  frame layout that doesn't literally match "every frame keeps >=1
  universal slot."
- **Weapon-cap semantics resolved as the spec's own Open Question #3
  anticipated**: no separate hard-cap field was added. A hull's real
  weapon ceiling is `count('weapon') + count('universal')` in its
  layout, computed on demand (`ship.ts`'s `weaponCeiling`, exported for
  UI/tests) rather than stored. This is a genuine, intentional loosening
  for every frame except Bastion (which has 0 universal slots, so its
  ceiling stays hard at 1) — most visibly the Dreadnought, whose
  ceiling is now 6, not the old flat 4.
- **`canRefit`'s signature is `Pick<RunState, 'shopKind' |
  'shopFrameOffers' | 'act' | 'protocols' | 'commanderId'>`, not the
  full `RunState`** — not specified either way; chosen so the shipyard
  UI (which only ever holds a handful of these as discrete props, not
  the whole `RunState`) can call it directly without reconstructing one.
- **Refit is explicitly `shopKind === 'shipyard'`-only**, enforced
  inside `canRefit` itself. The spec's prose ("At a shipyard, trade a
  ship up...") strongly implies this and the UI section only being
  specced for the shipyard listing confirms it, but it isn't one of the
  spec's own enumerated numbered rules — made explicit rather than left
  as an accident of "stores never offer legendary/epic anyway" (a store
  COULD otherwise offer a legal common/rare refit target, and nothing
  else in the spec suggests that should be allowed).
- **`policy.ts`'s `framePriority` widening** — covered above under the
  fixture audit; goes beyond the spec's literal ask (which only names
  `partPriority` vs. `framePriority` COMPATIBILITY as the risk) but
  follows directly from 52.6's own stated concern.

### Balance measurement tables

`npm run balance` (the fixture matchup table) is **byte-identical at
every checkpoint**, stage (a) and (b) alike — none of `balance.ts`'s
hand-built fleets reference `PURCHASABLE_FRAME_IDS` or draw frame
offers, so the roster/rarity changes literally cannot reach it. The
pre-existing FAIL/WARN lines (col10-solid-vs-GCDS, strong-vs-Hive-Mother,
fresh-vs-col-3-elite, strike-vs-plasma-tank WARN, Titan/Void-Citadel
KNOWN MARGINAL) are all unchanged, exactly as documented before this
iteration.

`npm run balance:full` (n=500/commander), act-1 clear rate — act-2
conditional was 0% everywhere at every checkpoint, dropped from the
table for the same reason iteration 51's did:

| Checkpoint | auto | merchant | engineer | spymaster | admiral | warlord |
|---|---|---|---|---|---|---|
| Baseline (b7ea8d2) | 12.4% | 12.6% | 12.6% | 9.6% | 9.0% | 11.8% |
| Stage (a) — typed slots + UI + traits, roster still 7 | 12.8% | 13.2% | 12.8% | 10.0% | 9.0% | 12.2% |
| Stage (b) — roster 7→17, refit added | 11.6% | 8.8% | 13.2% | 7.6% | 11.2% | 10.8% |

`npx tsx scripts/enemyValue.ts` is **also byte-identical at every
checkpoint** — it measures enemy value against the player's starting fit
+ banked win rewards, neither of which the roster/rarity change touches
(the Flagship's own frame/starting loadout is unchanged throughout).
Recorded for the record per 52.7's instruction, but there is genuinely
nothing to report here; iteration 55 (its actual consumer) will need to
re-derive this once a real fleet-building model exists that reflects the
wider hull choice, which `enemyValue.ts` in its current form does not
attempt.

### Reading the movement

Stage (a) is a small net BUFF (+0.2 to +0.6pp for 5 of 6 rows, admiral
flat), consistent with the spec's own prediction that typed slots (a
nerf, since the original 7 frames now have SOME structure where none
existed) would be outweighed by 3 new innate traits (Corvette
`capacitorShield`, Bastion `reactiveArmor`, Dreadnought `shieldPierce` —
all real, previously-unavailable-for-free stats) plus Interceptor's Jink
formalization being exactly zero-behavior-change as designed.

Stage (b) moves more, and unevenly — auto/spymaster/warlord down
1-2.4pp, engineer/admiral up 0.4-2.2pp, **merchant down 4.4pp** (its
confidence interval, [6.6-11.6%], barely overlaps stage (a)'s
[10.5-16.4%], unlike every other commander's stage-b move which stays
comfortably inside a 500-run Wilson interval of the stage-a figure).
Read plainly: the merchant's own `COMMANDER_ROUTE_BIAS` (`shop: +30,
shipyard: +30, combat: -15`) means it visits shops/shipyards far more
than any other commander, so it's the one most exposed to the roster
DILUTION effect the spec's own "Watch for" section flags — a wider pool
of purchasable ids sharing the same 5 (shipyard) / 2 (store) draw slots
means the specific ids `policy.ts`'s `framePriority` lists want show up
less often per visit, and the merchant simply takes more of those visits
than anyone else. This is the expected shape of the tradeoff the spec's
own motivation section accepted going in ("more lower tier ship options...
with different frames" — necessarily thinner odds per specific option),
not a regression introduced by an implementation mistake; flagged here
rather than chased, since re-tuning `COMMANDER_ROUTE_BIAS` or the
draw counts is explicitly out of this iteration's scope (52.4's own
"draw counts stay as they are" section).

**No clear-rate band was closed** — every commander's act-1 clear stays
well under the 20-40% target band before and after, exactly as
iteration 46's KNOWN GAP already documents. That gap is not this
iteration's job to close (iteration 55, gated on this one, is where the
enemy-value/wealth-curve flattening work lives).

### The one flake, not fixed

`reducer.test.ts`'s "can offer a legendary hull in an act-2 shipyard"
(and its Dreadnought-specific sibling) draw 30-40 unseeded map-generation
rolls and check that a low-probability tier (now split across 3-4
legendary/epic ids sharing a ~2-5% roll each) appears at least once.
Confirmed pre-existing (reproduced against the ORIGINAL single-legendary
version before touching any code) rather than introduced by this
iteration's roster widening, which only makes the specific-id odds
thinner (more ids sharing the tier). Iteration count bumped 30→40 for
the rewritten versions to reduce (not eliminate) the false-fail rate;
a fully deterministic seed would be the real fix, out of scope here.
