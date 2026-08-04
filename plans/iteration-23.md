# Iteration 23 — Support hulls (specced + implemented 2026-08-04)

**Goal:** five new purchasable frames covering roles the shop currently has
none of — a buffer, a passive aura ship, a repair ship, and two flavors of
enemy-debuffer — without inventing new UI. Every new ability rides the
existing active-part button (the same once-per-combat trigger `injector`/
`uplink2`/`dcbay`/etc. already use) or, for the aura, a pure pre-combat
passive with no button at all.

## Why these five, and what's actually new

Every active part before this iteration affects either the ship itself
(`dcbay`) or the player's *whole fleet* (`uplink2`, `modulator`, `injector`)
for one round. Nothing touches a single other ally, and nothing touches the
enemy. Three new capabilities cover all five ships:

1. **Target-one-other-ally.** `repairbay`'s active always resolves to
   whichever alive player ship has the lowest HP% — no click, no new UI,
   same "computed, not clicked" pattern taunt/priority-target already use.
2. **Affect the enemy side.** `ecm`/`disruptor` mirror `uplink2`/`modulator`
   exactly, but the round-modifier bonus applies to the *opposing* side's
   effective computer/shield instead of the player's.
3. **A passive fleet aura.** `shieldharmonic` has no active at all — while
   equipped anywhere in the fleet, it adds flat shield to every ship's
   *derived* stats, computed once before the fight (in `deriveFleetStats`/
   `deriveFleetForCombat`, the same place ace-pilot bonuses already fold
   in). Deliberate simplification: the aura is baked in at fleet-derive
   time for the whole fight, not dynamically removed if the carrier dies
   mid-combat — doing that properly would mean threading live fleet state
   through the dice-resolution hot path for a corner case nobody but a
   spreadsheet will notice. The tactical tension ("kill the fragile aura
   ship first") still exists at the fleet-composition/targeting level:
   enemy targeting is already lowest-HP-first, and this hull is
   deliberately the thinnest in the yard.

No new Part fields beyond `fleetShieldAura?: number` (the aura amount) and
two new `RoundModifiers` fields (`enemyComputerPenalty`, `enemyShieldPenalty`).
`tacrelay`'s active reuses the *existing* `computerBonus`/`initiativeBonus`
fields — no new state at all.

## The five hulls

| Frame id | Name | Slots | Init | HP | Cost | Max wpn | Starting part | Effect |
|---|---|---|---|---|---|---|---|---|
| `frigate` | Signal Frigate | 3 | 1 | 2 | 7 | 1 | `tacrelay` | +1 computer. Active: this round, all allies +1 computer, +1 initiative. |
| `aegis` | Aegis Relay | 2 | 0 | 2 | 9 | 1 | `shieldharmonic` | Passive: +1 shield to every ship in the fleet, all fight. |
| `tender` | Repair Tender | 3 | 0 | 3 | 8 | 1 | `repairbay` | +1 HP. Active: repair 3 damage on the fleet's most-damaged ship. |
| `ew-cutter` | EW Cutter | 3 | 1 | 2 | 8 | 1 | `ecm` | +1 computer. Active: this round, enemy computer -2. |
| `disruptor-cutter` | Disruptor Cutter | 3 | 1 | 2 | 8 | 1 | `disruptor` | +1 shield. Active: this round, enemy shield -2. |

All five are support-first: cheap-ish, thin-hulled, capped at 1 weapon —
none out-fights a Cruiser or Dreadnought, all buy a fleet-wide effect
instead. All five signature parts are ordinary shop-purchasable `PARTS`
entries too (same pattern as Bastion's `lure`) — the frame just arrives
pre-fitted with one.

## Touched files

- `types.ts` — `Part.fleetShieldAura?: number`.
- `parts.ts` — 5 new parts (`tacrelay`, `shieldharmonic`, `repairbay`,
  `ecm`, `disruptor`).
- `frames.ts` — `FrameId` +5, 5 new `FRAMES` entries,
  `PURCHASABLE_FRAME_IDS` +5.
- `ship.ts` — fleet-wide shield-aura pass in `deriveFleetStats` and
  `deriveFleetForCombat`.
- `combatEngine.ts` — `RoundModifiers.enemyComputerPenalty` /
  `.enemyShieldPenalty`; effective-computer and effective-shield math reads
  them for enemy-side attackers/defenders; `useActive` gains `tacrelay`,
  `repairbay`, `ecm`, `disruptor` cases.
- `reducer.ts` — `STARTING_FIT` +5.
- `shipNames.ts` — `HULL_CODE` +5 (`SIG`, `AEG`, `TDR`, `ECM`, `DIS`).
- `ShipSilhouette.tsx` — `FRAME_SHAPES` +5.
- Tests: `combatEngine.test.ts` (new active cases, enemy-debuff math),
  `ship.test.ts` (aura folds into derived stats), `reducer.test.ts`
  (BUY_SHIP for a new frame equips its starting part).

## Verification bar

`tsc -b`, `npm test`, `vite build` all clean; a live shop-screen pass
confirming the new hulls appear in the random offer draw and their
starting parts render correctly.
