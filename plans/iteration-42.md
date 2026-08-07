# Iteration 42 — Eight new weapons (specced 2026-08-07)

> **Status: implemented (2026-08-07).** 42.1-42.3 shipped: 8 new parts
> (`twinauto`, `clustermissile`, `protoovercharge`, `railgun`,
> `gravitonbeam`, `executioner`, `flechette`, `homing`), 4 new
> `Part['weapon']`/`WeaponStats` fields (`chipOnMiss`, `executeAtHp`,
> `cleaveDamage`, `bypassTaunt`) threaded through `combatEngine.ts`'s
> per-die resolution loop, `pickTarget` gained an `ignoreTaunt` param for
> Homing missile. 14 new tests (4 data-layer in ship.test.ts, 10
> behavioral in combatEngine.test.ts). 681/681 vitest, `tsc -b --force`
> clean, `vite build` clean, price/rarity monotonicity re-verified,
> `balance.ts` sanity pass unchanged from baseline (same 2 known fails).
> **42.4 (Ion disruptor cannon, Boarding torpedo) parked** — user chose to
> ship the other eight now and hold these two for later; see
> `plans/parking-lot.md`. Spec stays below for reference.
>
> **Finding surfaced during implementation, resolved 2026-08-07:** the
> launch numbers (1 dmg, `executeAtHp: 1`) made the execute clause
> numerically inert — a target at exactly 1 remaining HP already dies to
> the *normal* 1 damage, so the override never actually changed an
> outcome. Fixed by raising the threshold to `executeAtHp: 2` — the part
> now genuinely finishes a 2-HP target in one die where a plain 1-dmg
> cannon would need two. Description updated to match ("at 2 HP or
> less"); ship.test.ts's assertion updated 1 -> 2.
>
> **Naming fix, 2026-08-07:** `twinauto`'s and `battery`'s display NAMES
> were swapped so "Twin" (id `battery`, 2 dice, rare, 6cr) and "Ion
> battery" (id `twinauto`, 3 dice, epic, 9cr) actually match their dice
> counts — ids/stats/rarity/cost untouched (id ≠ display name, same
> pattern the Flagship/`cruiser` id already sets). This file's own table
> above still calls the 3-dice/epic/9cr entry "Twin autocannon" — read
> that as the id `twinauto`, now displayed as "Ion battery".

User direction: "i like all of the new weapon suggestions" (the 10 ideas
proposed while implementing iteration 41's weapon repricing) — "show me a
proposed rarity + cost," then "scope out the 10 weapon ideas." The pricing
below was already shown to and accepted in principle; this file is the
technical scope for actually building them.

## Pricing recap (unchanged from the earlier proposal)

Same formula as the existing roster: Ion cannon (1 die/1dmg/3cr) is the
anchor, cannons price at ~3cr per point of damage-per-activation, missiles
discount off that, drawbacks discount further, extra utility adds a
premium. Verified against the current price/rarity bands (common 2-4 /
rare 5-6 / epic 7-9 / legendary 12) via the disposable
`scripts/_rarity_check_temp.mjs` audit pattern — all ten slot in clean,
Railgun becomes the new legendary ceiling (13, above Antimatter's 12).

| # | Weapon | Rarity | Cost | Engine work |
|---|---|---|---|---|
| 1 | Twin autocannon | Epic | 9cr | none |
| 2 | Railgun | Legendary | 13cr | none (negative `shield` already sums correctly) |
| 3 | Flechette cannon | Rare | 5cr | new: cleave to a second target |
| 4 | Homing missile | Epic | 7cr | new: taunt/priority-bypassing target selection |
| 5 | ~~Ion disruptor cannon~~ | ~~Rare~~ | ~~6cr~~ | **parked, see below** |
| 6 | Cluster missile | Epic | 8cr | none |
| 7 | ~~Boarding torpedo~~ | ~~Epic~~ | ~~8cr~~ | **parked, see below** |
| 8 | Graviton beam | Epic | 7cr | new: chip damage on a miss |
| 9 | Prototype overcharge cannon | Epic | 8cr | none (reuses iteration 40's `overcharge` field) |
| 10 | Executioner cannon | Rare | 5cr | new: execute at low HP |

Three ship free (data-only, no `combatEngine.ts` change); the other five
in scope need one new `Part['weapon']` field each, all threaded through
the same per-die resolution loop in `combatEngine.ts` (~line 288-450) that
already hosts `selfDamageOnNatOne`, `shieldPierce`, `targetHighest`, and
`overcharge` — same shape of change each of those was, not a new category
of engine work.

## 42.1 — The free three (no engine changes)

Pure `PARTS` entries, same shape as any existing weapon:

- **Twin autocannon** (`twinauto`) — cannon, 3 dice, 1 dmg each. Epic, 9cr.
  "Volume over punch": 3 independent rolls land more often against a
  high-piloting target than one 3-dmg die would, at the same total damage
  ceiling as the existing Siege cannon.
- **Cluster missile** (`clustermissile`) — missile, 3 dice, 1 dmg each.
  Epic, 8cr. Missile Rack's big sibling — more opening-volley volume,
  missile-discounted off Twin autocannon.
- **Prototype overcharge cannon** (`protoovercharge`) — cannon, 1 die,
  2 dmg, `weapon.overcharge: true` baked in permanently. Epic, 8cr. The
  first STATIC user of the `overcharge` field (iteration 40 added it to
  the engine but only the Overcharged rounds protocol has ever set it) —
  a single-weapon taste of the protocol's effect without committing the
  whole fleet.

No test surface beyond the existing "every part has a rarity, price bands
stay monotonic" checks and a shop-draw smoke test.

## 42.2 — Small additions (self-contained, no new state)

- **Railgun** (`railgun`) — cannon, 1 die, 5 dmg, `shield: -2` (permanent
  self-debuff while equipped, same mechanism `shield1`/`shield2` use
  going the other way — `deriveStats` already just sums `part.shield`,
  and `effectiveShield`'s existing `Math.max(0, ...)` clamp means a
  negative total never goes further negative than "always hit," it just
  floors there). Legendary, 13cr. The hardest single hit in the game,
  paid for in survivability.
- **Graviton beam** (`gravitonbeam`) — cannon, 1 die, 2 dmg. New
  `weapon.chipOnMiss?: number` field: on a miss (not a hit), deal this
  much direct damage anyway instead of the normal 0. One new branch in
  the resolution loop, right next to the existing hit/miss log entry —
  no new state, no new targeting. Epic, 7cr.
- **Executioner cannon** (`executioner`) — cannon, 1 die, 1 dmg normally.
  New `weapon.executeAtHp?: number` field: if the hit lands and the
  target's HP **before** this hit is at or below `executeAtHp` (set to
  **2** — see the status note above; launched at 1, raised after testing
  showed 1 made the clause inert against its own 1-dmg base), this die
  deals the target's full remaining HP instead of `weapon.damage`. Purely
  a damage-amount branch inside the existing hit-resolved path — no new
  targeting, no persistent state. Rare, 5cr.

## 42.3 — Targeting changes (still self-contained, touch `pickTarget`)

- **Flechette cannon** (`flechette`) — cannon, 1 die, 1 dmg to the primary
  target. New `weapon.cleaveDamage?: number` field: **on a hit**, also
  deals this much direct damage to a second target — `pickTarget` run
  again against the same defender pool with the primary excluded (reuses
  the existing lowest-HP/taunt-priority logic, just a second call, no new
  targeting rule). Decision point below. Rare, 5cr.
- **Homing missile** (`homing`) — missile, 1 die, 2 dmg. New
  `weapon.bypassTaunt?: boolean` field: target selection ignores taunt
  and any player priority-click/targeting-stance, always resolving to the
  plain lowest-remaining-HP alive-and-not-cloaked defender (cloak's
  all-cloaked exception still applies). One new branch at the top of the
  existing target-selection block (`combatEngine.ts:308-319`), same
  pattern `targetHighest` already uses to override the default. Epic, 7cr.

## 42.4 — Persistent-state additions: PARKED (2026-08-07)

> Out of scope for this pass — see `plans/parking-lot.md`. Kept here,
> unchanged, as the spec to pick back up from when un-parked.

- **Ion disruptor cannon** (`iondisruptor`) — cannon, 1 die, 1 dmg. New
  `weapon.shieldDrainOnHit?: number` field: on a hit, permanently
  decrement the target's `stats.shield` by this amount (1) for the rest
  of the fight — no new data structure needed, `CombatShip.stats` is
  already a live mutable object carried by that ship for the whole fight
  (the same object `useActive`'s dcbay/injector cases already mutate
  directly). Stacks naturally since it's a plain decrement; no floor
  needed (the existing `effectiveShield` clamp handles negative totals).
  Rare, 6cr.
- **Boarding torpedo** (`boardingtorpedo`) — missile, 1 die, **0 dmg**.
  New `weapon.disableWeaponOnHit?: boolean` field: on a hit, permanently
  removes the target's single highest-damage-per-die weapon group (first
  check `stats.cannons`, then `stats.missiles`; ties broken by array
  order) by splicing it out of the relevant array — same "mutate the live
  stats object" mechanism as the disruptor above, just removing an array
  entry instead of decrementing a number. If the target has no weapons
  left to disable, the hit is a no-op beyond the 0 damage (logged as
  "finds nothing to disable," matching the repair-drone-bay pattern for a
  no-op activation). Epic, 8cr — priced as pure utility (a permanently
  disabled weapon is close to killing a slot outright), not off the 0
  direct damage.

## Decision points (defaults chosen, flag if wrong)

1. **Flechette's splash only triggers on a hit**, not unconditionally —
   matches "you land the pellets when you land the shot." Alternative:
   splash always lands regardless of the primary die's roll (strictly
   stronger, would need a rarity/cost bump to compensate).
2. **Boarding torpedo disables the single most-damaging weapon group**,
   not a random one — legible ("it takes out their best gun") and
   deterministic (no extra rng draw needed mid-resolution). Alternative:
   random group, which reads less predictable but avoids always gutting
   the same enemy archetype's signature weapon.
3. **Superseded (2026-08-07): Executioner's `executeAtHp` threshold is 2,
   not 1.** Originally scoped at 1 (matching the user's example literally)
   — implementation caught that a threshold equal to the weapon's own
   damage makes the clause numerically inert (a 1-HP target already dies
   to plain 1 dmg), so it was raised to 2 to give the mechanic a real
   effect. Cost/rarity held at 5cr/rare — still a situational finisher,
   not a routine multiplier, just now one that actually changes an
   outcome.
4. **Superseded (2026-08-07): the eight in 42.1-42.3 land in one pass,
   42.4's pair parked.** Originally scoped as "all ten in one pass, since
   several are meant to read against each other" — the user chose to
   split it instead. Cluster missile vs. Homing missile and Railgun vs.
   Antimatter still read fine without the parked pair; nothing in 42.1-
   42.3 depends on Ion disruptor cannon or Boarding torpedo existing.

## Milestones

- **42.1** The free three: Twin autocannon, Cluster missile, Prototype
  overcharge cannon. Pure data, existing tests extended for the new part
  count.
- **42.2** Railgun, Graviton beam, Executioner cannon: `chipOnMiss` and
  `executeAtHp` fields threaded through `combatEngine.ts`'s per-die loop;
  unit tests for each new branch (miss-still-chips, execute-at-threshold,
  self-debuff clamps at 0 shield not negative-negative).
- **42.3** Flechette cannon, Homing missile: `cleaveDamage` (second
  `pickTarget` call, excluding primary) and `bypassTaunt` (skip the
  taunt-forcing branch entirely); tests cover taunt/cloak interaction for
  homing, and cleave-target-selection-with-only-one-enemy-alive (no
  second target — cleave is a no-op, not a crash).
- ~~**42.4** Ion disruptor cannon, Boarding torpedo~~ — **parked
  (2026-08-07)**, see `plans/parking-lot.md`.
- **42.5** Wiki (new weapons appear via the existing data-generated
  tables, no manual work), `scripts/balance.ts`/`actRun.ts` sanity pass
  (new parts entering the shop pool shift draw odds slightly — re-run,
  not expected to move any gate), full verification bar (`tsc -b
  --force`, `vitest run`, `vite build`). No browser pass, per the
  standing policy in CLAUDE.md.
