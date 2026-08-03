## Iteration 19 (DONE 2026-08-03 — implemented directly by the planning thread)

**Telegraphs.** Revived from the parked combat-interaction bundle at the
user's request — the enabler piece only, not the bundle. Enemy targeting
is deterministic given board state (greedy lowest-HP, filtered by
taunt/cloak/evasion), so **next round's opening fire is computable before
the round is played**. Showing it turns every timing tool the player
already owns (chaff, modulator, thrusters, bulkheads, withdraw, even
which enemy to priority-focus) from a guess into a read.

### 19.1 Engine: `incomingFirePreview(state)` (pure, read-only)

For each alive enemy ship with weapons in the NEXT phase (round 0 →
missiles, otherwise cannons):

- **Opening target** = the exact same call `fireShip` makes for its first
  die: `pickTarget(legalDefenders(playerShips, state.roundModifiers))` —
  built from the real engine functions so it can never drift (the same
  guarantee `openingTargetIndex` gives the player's side on the prep
  screen). Honest limitation, stated in the UI copy: dice retarget
  mid-activation after kills, so this is the *opening* picture, not a
  contract.
- **Dice + max damage** from that ship's phase weapons; cannon previews
  double the dice of any enemy currently in
  `outspeedingShipIndices(state).enemy` (flagged `outspeed: true` — the
  real bonus phase re-evaluates at end of round, so this is "expect a
  second activation", not a promise).
- Returns `{ entries, flakCancels }` — `flakCancels` = the fleet's total
  flak for a missile-phase preview (shown as "your flak downs the first
  N"), 0 otherwise.
- Consumes no rng, mutates nothing — determinism untouched by
  construction.

The preview reads the LIVE `roundModifiers`, which is the whole point:
arming `thrusters` (evade) removes that ship from `legalDefenders` and
the telegraphed fire visibly shifts to whoever is exposed next, before
the player commits the round.

### 19.2 Combat UI

- **Incoming-fire chip** on each targeted player card, between rounds
  only (hidden while replaying and once the fight ends): "⚠ N dice · up
  to M dmg", amber-tinted, with "×2?" when any contributing shooter is
  outspeed-flagged, and a tooltip naming the shooters. Missile-phase
  previews append the flak note.
- **Threat lines**: static dashed red lines from each firing enemy card
  to its opening target, drawn on the existing measured-position overlay
  (the iteration-12 fx layer's `centerOf` machinery, reused for a
  persistent layer beneath the transient fx). Same visibility rules as
  the chips; re-measured on state change and window resize;
  reduced-motion safe by nature (no animation — a slow dash-drift only
  when motion is on).

### 19.3 Prep screen

The enemy panel gains the mirror of its existing "where your fire opens"
line: **"Their opening volley"** — computed by building the real
`initCombat` state from the current fleet and running the same preview:
an alpha-strike line when the enemy has missiles (dice, max damage,
opening target, flak note) and a per-round cannon line otherwise/also.
Re-derives on every fleet edit, so re-equipping a lure beacon visibly
drags the telegraphed fire onto the taunter before engaging.

### 19.4 Tests

- Preview target ≡ the actual first enemy die's logged target across:
  plain greedy, taunt redirect, cloak exclusion (and the all-cloaked
  fallback), and an armed-evade exclusion.
- Phase selection: round 0 previews missiles (missile-less enemies
  contribute nothing); round ≥1 previews cannons.
- Outspeed flag doubles previewed cannon dice exactly for enemies the
  live `outspeedingShipIndices` reports, and never for missile previews.
- `flakCancels` totals the fleet's flak only for missile previews.
- The preview consumes no rng and leaves the state deep-equal.

### Status notes (2026-08-03)

- All four sections shipped as specced. 5 new engine tests in
  `combatEngine.test.ts`; suite at 424 passing, tsc + build clean.
- Verified live: prep-screen volley lines ("Their alpha strike: 2 missile
  dice, up to 2 dmg — opening on ISV Cinder"), the incoming chip, threat
  lines rendering/positioning, lines + chips hiding during replay and
  reappearing between rounds, clean unmount on Victory. Chips/lines
  correctly show *nothing* when the enemy has no weapons in the next
  phase (e.g. missile-only Picket drones after round 0) — absence of a
  telegraph is itself the "you're safe next round" read.
- One real bug found in verification: the threat-line measurement
  originally ran inside `requestAnimationFrame`, which never fires in a
  hidden/background tab — lines stayed blank until a resize. Fixed by
  measuring synchronously in the effect (refs + layout are committed by
  then); RAF added nothing.
- Taunt/evade retarget shift is covered by the engine tests (preview ≡
  first actual die under taunt and armed thrusters); not re-verified
  live — the opener fight has a single player ship, so there is nothing
  to shift onto.
