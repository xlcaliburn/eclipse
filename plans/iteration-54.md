# Iteration 54 — Hull identity: typed slots and innate traits (specced 2026-08-08)

> **Status: specced, not implemented.** Implementer: record deviations and
> verification results here, per the established style.
>
> **Depends on [iteration 52](plans/iteration-52.md)** landing first — 52
> re-weights the shop draw and adds the hull refit; this is the content
> pass 52 explicitly defers to, and its measurement baseline is 52's
> post-change numbers, not today's.

## Motivation (user direction, 2026-08-08)

Following the shop audit in iteration 52, the user redirected the
deferred content pass:

> *"i also want to have 'weapon only' or computer only etc slots be
> clearly marked and also a unique feature for different shapes of ship
> bases. this can allow for more interesting speed-based or heavy
> firepower or defensive type"*

This is a better answer to *"the same 5 options basically show up each
time"* than 52's deferred plan of simply adding more hulls. Today all 7
purchasable frames are the same object with different numbers — a slot
count, an HP value, an optional weapon cap. Nothing makes an Interceptor
*play* differently from a Corvette beyond arithmetic. Typed slots plus a
named innate trait give each hull a shape and a reason to exist, which
makes both the existing roster and any future additions feel distinct.

Note this **reverses a documented parking-lot decision**: `frames.ts`'s
legacy-hull comment says the retired support hulls should not return
"without giving each a genuine base-level reason to exist (see
plans/parking-lot.md's *per-hull innate quirks*)." That parked idea is
exactly what the user is now asking for. Update the parking-lot entry to
point here rather than leaving it reading as still-parked.

## Grounding (read at spec time, 2026-08-08)

- `Frame` (frames.ts) = `{ id, name, slots: number, baseInitiative,
  baseHp, cost, rarity, blurb, maxWeapons?: number }`. 13 frames, 7
  purchasable.
- `PartType` (types.ts) = `'weapon' | 'computer' | 'shield' | 'hull' |
  'drive' | 'cargo'`. The `'cargo'` member is the commodity lot — an
  important edge case below.
- `drawShopOffers` already strata the catalog into exactly three
  categories — WEAPON, DEFENSE (shield+hull), COMPUTER_DRIVE — plus a
  cross-cutting ACTIVE pool. **The slot kinds below deliberately reuse
  those same three categories**, so the shop's stock and a hull's
  sockets speak one vocabulary.
- `effectiveSlots(frameId, upgrades, protocols, commanderId)` = frame
  slots + `bay` upgrade count + Lone-flagship +2 (cruiser) + Warlord +1
  (cruiser). Consumers: `FleetOverlay`, `FleetPanel`, reducer's EQUIP,
  `reducer/shop.ts`'s bonus-item fitting, `scripts/sim`'s `agent.canFit`
  and `budget.hasRoom`.
- `maxWeapons` consumers: the same set.
- **Jink is already an innate hull trait in all but name** —
  `deriveStats` has a literal `if (frameId === 'interceptor')
  stats.jink = true`. The pattern this iteration formalizes already
  exists as a one-off special case.

## 54.1 Typed slots

### The model

```ts
export type SlotKind = 'universal' | 'weapon' | 'defense' | 'systems';
```

Acceptance, matching the shop's own strata:

| Slot kind | accepts `PartType` |
|---|---|
| `weapon` | `weapon` |
| `defense` | `shield`, `hull` |
| `systems` | `computer`, `drive` |
| `universal` | anything, including `cargo` |

`Frame` gains `slotLayout: SlotKind[]` and **loses both `slots` and
`maxWeapons`**, which become derived:

- `frameSlots(frame) = frame.slotLayout.length`
- the weapon ceiling = `count('weapon') + count('universal')`

Deriving the weapon cap this way reproduces today's numbers where the
layout is chosen to match (Bastion `['weapon','defense','defense']` → cap
1, as now), which is the migration check to apply per frame.

**`cargo` is universal-only** — no dedicated kind accepts it. Therefore
**every frame must keep at least one `universal` slot** or it could never
carry a commodity lot. Assert this in a test over all of `FRAMES`, not
just the purchasable ones.

### Bonus slots stay universal

`effectiveSlots` becomes `effectiveSlotLayout(frameId, upgrades,
protocols, commanderId): SlotKind[]` — the frame's own layout plus one
`'universal'` per `bay` upgrade, per Lone-flagship bonus, and per Warlord
bonus. Earned/granted slots have never had a type and should not gain
one. Keep a thin `effectiveSlots()` returning `.length` so the many
"empty slot count" call sites don't all have to change.

### Legality check

An `equipped: PartId[]` is legal against a layout iff, counting parts by
category and slots by kind:

```
overflow = max(0, nWeapon  - dWeapon)
         + max(0, nDefense - dDefense)
         + max(0, nSystems - dSystems)
         + nCargo
legal    = overflow <= dUniversal
```

That is exactly the feasibility condition for this structure (each
category maps to its own dedicated slots plus the shared universal pool)
— no bipartite-matching machinery needed. Export
`canEquip(frameId, equipped, partId, upgrades, protocols, commanderId)`
computing it with the candidate part included, and have **EQUIP, the
shop's bonus-item fitting, `agent.canFit` and `budget.hasRoom` all call
it** rather than re-deriving. That single predicate replaces today's
separate slot-count and `maxWeapons` checks everywhere.

`PlayerShipState.equipped` stays a flat `PartId[]` — parts are not
assigned to specific slot indices, only checked for feasibility. This
keeps the save shape and every existing fixture's construction unchanged.

### Save compatibility

An existing save can hold a loadout that is legal today and illegal under
the new layouts. That would leave EQUIP/UNEQUIP in a confusing state
(cannot re-equip what was just removed). **Bump `SAVE_VERSION`** — the
same call the project has made for smaller shape changes (v5's `heat`,
v7's combat fields), and cheaper than writing a migration for an
early-development project with no compatibility guarantee.

## 54.2 Marking slots in the UI ("clearly marked")

A shared `<SlotRow layout equipped />` component (following the
established `ShipPickRow` / `FitChips` / `UpgradeBadgeRow` pattern):
one chip per slot, showing its kind and whether it is filled.

Render it everywhere a ship's capacity is shown: `FleetPanel`,
`FleetOverlay`, the shop's frame cards (so the layout is visible
*before* buying — this is the main "more interesting ship options"
payoff), the prep screen, and iteration 52's refit rows (where legality
depends on the target's layout).

Also: when a part cannot be equipped anywhere, the UI should say *why*
("no free weapon slot") rather than silently disabling — the current
EQUIP failure mode is a dead click, which iteration 47.1 already had to
fix once for the Lone-flagship slot bug.

Icons: reuse/extend `PartIcon`'s existing type iconography so a
`weapon` slot chip and a weapon part read as the same family.

## 54.3 Innate hull traits

```ts
// on Frame
innate?: { name: string; description: string; grants: Partial<ShipStats> };
```

Folded in by `deriveStats` immediately after the frame's base stats, so
parts and upgrades stack on top as they do today.

**Declarative `grants` only, this pass.** Every trait below reuses an
existing `ShipStats` field the combat engine already honours, so the
engine needs no changes at all. If a trait genuinely needs a new engine
hook (e.g. "+1 damage per cannon die"), that is a separate, called-out
addition — do not smuggle one in.

Starting table (the balance sim arbitrates; these are proposals):

| Frame | Identity | `grants` | Note |
|---|---|---|---|
| Interceptor | speed | `{ jink: true }` | **Delete the hardcoded `if (frameId === 'interceptor')` in `deriveStats`** — zero behavior change, and it proves the pattern |
| Bastion | defensive | `{ reactiveArmor: 1 }` | Negates the first hit. Deliberately NOT innate taunt — taunt is the lure beacon's identity and giving it away free would obsolete a part |
| Dreadnought | heavy firepower | `{ shieldPierce: 1 }` | Guns big enough to punch through, on an existing engine field |
| Cruiser | flexible | *(none)* | Its blurb literally says "No gimmick" — keep exactly one hull that is pure stats, as the baseline others are read against |
| Freighter | utility | *(none — its layout IS its identity)* | 5 slots, weapon-capped, universal-heavy |
| Corvette | cheap utility | `{ capacitorShield: 1 }` | Bonus piloting for the opening exchange only — a thin hull that survives the alpha strike |
| Derelict | the floor | *(none)* | It is the cheap nothing-hull by design |

Surface the trait name + description on the frame card, the ship card
and the wiki (all three read `FRAMES` already).

## 54.4 New rare-tier hulls

The original ask (*"more rare tier options across the board"*) — now
much easier, because 54.1/54.3 give a new hull a distinct shape without
needing new stat ranges. The rare tier has only 2 entries today
(Bastion, Freighter) against 3 commons.

Add **2–3 rare hulls**, each defined primarily by layout + trait rather
than by raw numbers, and each filling a role the roster lacks. Candidate
directions (implementer/user to settle):

- A **weapon-dedicated** brawler: mostly `weapon` slots, low HP — the
  "heavy firepower" shape the user named, at rare tier rather than the
  legendary Dreadnought.
- A **systems** hull: multiple `systems` slots — currently no frame
  favours computer/drive builds, and COMPUTER_DRIVE is the thinnest
  stratified pool (11 parts).
- A **speed** hull: high `baseInitiative`, thin, few slots — Outspeed
  (iteration 17) is a real build-around with no dedicated hull.

After adding, revisit **iteration 52.2's shipyard draw count** (dropped
to 4 as an interim); a wider roster likely supports raising it again.

## 54.5 Fixture audit — the main implementation risk

Ships are hand-constructed in many places, and any of them can become
illegal under the new layouts. **Audit every one before touching
balance numbers**, because an illegal fixture silently changes what the
balance table measures:

- `scripts/balance.ts` — `STRONG_FLEET`, `ENDGAME_FLEET`,
  `STRIKE_FLEET`, `NO_SPEED_CONTROL` and the rest of its fixture table.
  The Flagship fixtures carry 6 mixed parts (e.g. `plasma, plasma,
  comp3, hull2, init3, shield1`) — the `cruiser` layout must accommodate
  that, which argues for a universal-heavy Flagship (it is the roomy
  workhorse; a suggested layout is
  `['weapon','weapon','universal','universal','universal','universal']`).
- `scripts/sim/budget.ts`'s `PRIORITY` lists and `buildFleet`.
- `scripts/sim/policy.ts`'s `partPriority` per archetype — an archetype
  whose list no longer fits its `framePriority` hulls will silently
  under-build.
- `STARTING_FIT` (reducer/shop.ts) — every purchasable hull's arrival
  loadout must be legal under its own new layout.
- `STARTING_LOADOUT` (parts.ts) — the Flagship's opening fit.
- Test fixtures across `reducer.test.ts`, `ship.test.ts`,
  `combatEngine.test.ts`.

Add a test asserting **every** `STARTING_FIT` entry and `STARTING_LOADOUT`
is legal against its frame's layout, so this class of bug cannot
reappear silently.

## 54.6 Verification and measurement

- `npx tsc -b --force` clean project-wide, `npx vitest run` green
  (report the count), `npx vite build` clean.
- `npm run balance` — the matchup table **will** move here (unlike
  iteration 52), because innate traits change fixture fleets' real
  stats. Record before/after per matchup and explain each material
  shift; a trait that swings a column more than ~10pp deserves a second
  look.
- `npm run balance:full` — per-commander clear rates against iteration
  52's post-change baseline (NOT today's). Typed slots constrain builds,
  which is a nerf; innate traits are a buff. Report the net honestly and
  say which dominated.
- No browser passes (CLAUDE.md).

## Open questions for the user

1. **Weapon-cap semantics.** Deriving the cap as `weapon + universal`
   slots means a universal-heavy hull can go all-weapons. If some hulls
   should have a hard ceiling regardless of universal slots, that needs
   a separate explicit field — say so and it will be added.
2. **How constrained should hulls be?** A layout that is mostly
   dedicated slots makes a hull characterful but rigid; mostly universal
   keeps flexibility but dilutes the identity this iteration is for.
   The starting table above leans flexible (the Flagship especially);
   the user may want it sharper.
3. **The five retired legacy hulls** (`frigate`, `aegis`, `tender`,
   `ew-cutter`, `disruptor-cutter`) were retired for having no
   base-level reason to exist. Typed slots + traits would give them one.
   Revive any of them, or leave them retired and add fresh hulls in
   54.4?
