## Iteration 9 — complete

### Status: I9-M3 (cruiser + polish) — done

Implemented 9.5: the purchasable Cruiser frame — internal `FrameId`
`'light-cruiser'` (the plain id `'cruiser'` was already taken by the
Flagship), display name "Cruiser", 10 cr, 4 slots, base HP 4, base init 1,
no weapon cap, no innate, pre-fitted with one ion cannon (its identity is
having no gimmick — the only escort that can carry a real multi-weapon
loadout). Wired into `BUY_SHIP`/`STARTING_FIT`/`ShopScreen`'s purchasable
frames row, ordered Interceptor → Cruiser → Bastion → Dreadnought (a clean
price ladder: 6/10/12/20 cr, 3/4/5/8 slots).

Deviations / notes:
- Per the user's standing instruction this session ("skip all browser
  passes"), M3's own browser-pass acceptance item (quit mid-combat and
  resume to the same rolls; flip stance against the Escorted sniper and
  watch the forecast diverge; a Cruiser bought and armed as a second
  gunship) was **not** performed. Verification bar met instead: `npm test`
  (264 tests), `tsc -b`, `vite build` all green.
- Tests added: `reducer.test.ts` gained a `BUY_SHIP` Cruiser case (cost,
  pre-fit, 4-slot cap with no weapon-type restriction).

**Iteration 9 definition of done, revisited:** closing the tab no longer
ends a campaign (autosave + landing screen + fail-soft), and reloading
never changes fate (run-level rng counters + a fixed-at-pick combat seed,
enforced by a dedicated no-stray-`Math.random` test); a screened formation
(Escorted sniper / Carrier group / Command wing) punishes the default
"weakest" doctrine and rewards a player who reads the enemy panel and
switches to "strongest," with the forecast now proving the two stances
diverge instead of asserting it; the shop's frame row reads as four
distinct answers to "what does my fleet lack?" (Interceptor's Jink,
Cruiser's plain multi-weapon flexibility, Bastion's tankiness, Dreadnought's
scale). All three milestones (M1/M2/M3) are implemented, tested, and
verified per the standing `npm test`/`tsc -b`/`vite build` bar — only the
optional browser passes were skipped, at the user's standing request.

---

### Status: I9-M2 (formations + doctrine) — done

Implemented 9.3: `EnemyDef` generalizes to `{ id, name, blurb, groups: EnemyGroup[], appliedEscalations?, veterancyBonus? }`, where `EnemyGroup = { label, count, stats }` — every one of the 25 pre-existing enemies (GAUNTLET, both bosses trios, the opener, both acts' rosters) migrated to a one-entry `groups` array via a `solo(label, count, stats)` helper, with no behavior change (the full 254-test suite, unchanged in its assertions on existing enemies, is the "resolves identically" pin). `combatEngine.ts`'s `initCombat` (and the legacy `resolver.ts` one-shot resolver, kept in step) now flatten `groups` into one `CombatShip` per ship with a single continuous per-side index — sub-groups activate at their own initiative via the existing activation machinery, no changes needed there. `eliteVariant`/`applyVeterancy`/`applyEscalations` now map their bonus over every group. Added 3 new formation enemies (Escorted sniper → act-1 hard pool, Carrier group → act-2 mid, Command wing → act-2 hard), pushed into the existing pool arrays. `EnemyPanel` renders one stat card per sub-group (shield-pierce readout now keys off the group with the highest shield); `CombatScreen`/`CombatFleetView` label ships by their own group (`"sniper"`, `"screen" #2`, etc.) instead of a single enemy-wide count.

Implemented 9.4: `CombatState.targetingStance` (`'weakest' | 'strongest'`, default `'weakest'`), set once at `initCombat` from a new `RunState.targetingStance` field (persists between fights, changed only via a new `SET_TARGETING_STANCE` action gated to the `'prep'` phase). `fireShip`'s target selection now computes `preferHighest` from the stance for player dice only (`weapon.targetHighest` — the siege cannon's per-die override — always wins regardless); enemy targeting is completely untouched. `forecast.ts`'s `forecastWinRate` gained a `stance` parameter (cache key extended to match) so `PrepScreen` can compute and show both stances' win rates side by side, highlighting the active one, with two buttons to switch.

Deviations / notes:
- `hardestInPool`'s "hardest" comparator changed from a single group's HP to **total HP across every group** (`count × hp`, summed) — the only way to meaningfully rank multi-group formations against single-group enemies for elite/bounty/ambush selection.
- Formation labels are lowercase nouns (`"sniper"`, `"screen"`, `"tender"`, `"drone"`, `"commander"`, `"lancer"`) rather than full names, matching how the enemy panel already renders per-group cards; single-group enemies never show a group-label heading (only formations do, since a redundant "scout" label under "Scout pack" would add noise, not clarity).
- Tests added: `enemies.test.ts` gained formation/veterancy-per-group coverage; `combatEngine.test.ts` gained per-group-initiative, flattening, greedy-targeting-hits-the-screen, and a full "targeting doctrine" describe block (weakest/strongest/siege-cannon-override/enemy-untouched/default); `forecast.test.ts` gained a stance-divergence test against the Escorted sniper; `reducer.test.ts` gained `SET_TARGETING_STANCE` coverage (phase-gated, persists into `ENGAGE`'s combat). `npm test` (263 tests), `tsc -b`, `vite build` all green.

---

### Status: I9-M1 (determinism + saves) — done

Implemented 9.1: every draw after NEW_RUN's one nondeterministic seed now
flows through `RunState.rngCounter` continuing the same `map.seed` stream
(`rng.ts`'s new `resumeRng`, shared with `combatEngine.ts`'s combat-level
resumption, which used to duplicate this logic locally as
`makeResumedRng`). A `runRng(state)` helper in `reducer.ts` hands back a
draw-counting `rng` plus a `nextCounter()` to persist; every action that
used to call `Math.random()`/`randomSeed()` directly (shop stock/reroll,
enemy-pool picks, elite/bounty/ambush selection, quest-offer generation,
event draws, card/upgrade draws, event resolution) now threads through it.
The combat seed moved from `ENGAGE` to wherever `currentEnemy` is actually
committed (`PICK_NODE`'s opener/combat/elite/boss branches, and
`EVENT_CONTINUE`'s ambush branch), stored as `RunState.currentCombatSeed`;
`ENGAGE` now just reads it. `Math.random`/`Date.now` are banned from
`src/game/` outside `rng.ts` itself, enforced by a grep-style test
(`noStrayRandomness.test.ts`) rather than lint config, since the project
has no oxlint custom-rule setup yet.

Implemented 9.2: `persistence.ts` (`saveRun`/`loadRun`/`clearRun`,
`SAVE_VERSION`, an injectable `StorageLike` so tests don't need a DOM
environment) plus `App.tsx` wiring — a lazy `useReducer` initializer that
resumes a save if one exists, a minimal `LandingScreen` (Continue run / New
run, the latter behind `window.confirm`), autosave via a `useEffect` on
every state change, save-clearing on victory/defeat, an "Abandon run"
button on the live map screen (also behind `window.confirm`), and a
fail-soft "saving unavailable" banner if the first autosave attempt fails.

Deviations / notes:
- The spec's "a test greps for it, or an oxlint rule if convenient" — went
  with the grep-style vitest test (`noStrayRandomness.test.ts`), reading
  sibling files via Vite's `import.meta.glob(..., {query:'?raw'})` rather
  than Node's `fs`, since this project's browser-oriented `tsconfig.app.json`
  has no Node types and adding them felt like a bigger footprint than the
  problem needed.
- `App.tsx`/`LandingScreen.tsx`/the autosave wiring have no dedicated tests
  — this project has never had component-level tests (no DOM test
  environment is configured), so persistence itself is tested at the
  `persistence.ts` module level (roundtrip, versioning, fail-soft,
  mid-combat continuation) rather than through simulated UI interaction.
  This matches the project's existing testing scope, not a new gap.
- Tests added: `determinism.test.ts` (same-seed-same-actions deep-equal at
  every step, reload-before-Engage can't reroll the fight, shop/reroll and
  event resolution identical after a simulated reload) and
  `persistence.test.ts` (save/load roundtrip, JSON-roundtrip in every
  phase incl. mid-combat/mid-event, version mismatch discards, corrupt
  JSON discards, fail-soft on null/throwing storage, mid-fight save
  continuing bit-identically to a never-saved run). `npm test` (248
  tests), `tsc -b`, `vite build` all green.

---

## Iteration 9 (planned — after iteration 8)

Three pieces: **persistence** (save/resume in localStorage — a two-act run
is long enough to need it), **mixed enemy formations + player targeting
doctrine** (shipped together, per the parking lot: formations give the
enemy screens that exploit greedy targeting; doctrine is the player's
counter-tool), and a **purchasable Cruiser frame** (the balanced escort the
frame roster is missing — the name is free again since iteration 5 renamed
the player's original ship to Flagship).

Deliberately NOT in this iteration: ascension difficulty tiers and
meta-unlocks (persistence makes both cheap later; neither is designed yet).
This iteration **formally lifts iteration 1's "no localStorage, no save
games" constraint**. Balance gate still suspended.

### 9.1 Full-run determinism (the save-scumming clause)

Persistence changes the incentive landscape: if any randomness is rolled at
action time, "quit → reload → retry" becomes the optimal way to play
(re-roll a bad combat, re-roll shop stock). The fix is structural, not
honor-system: **every random draw in a run must flow through seeds and
counters stored in `RunState`**, so that identical state always produces
identical futures. Reloading then replays fate exactly — scumming is
impossible by construction.

Concretely:

- Combat is already scum-proof (`CombatState.seed` + `rngCounter`, from
  iteration 3). One gap to close: the combat seed is currently rolled at
  `ENGAGE` — move it to `PICK_NODE` and store it (`currentCombatSeed`), so
  reload-before-engage cannot reroll the fight.
- Shop stock, rerolls, job-board offers, event draws, escalation/boss
  picks, commander draw: anything not already derived from `mapSeed` +
  node coordinates gets a run-level `rngCounter` in `RunState`, advanced on
  each draw.
- Ban `Math.random()`/`Date.now()` from `src/game/` outright (a test greps
  for it, or an oxlint rule if convenient). The only nondeterministic
  moment in a run is the initial seed at NEW_RUN.
- Test: two reducers fed the same action sequence from the same seed
  produce deep-equal states at every step.

### 9.2 Persistence (localStorage)

- **Autosave:** the full `RunState` is written to localStorage after every
  reducer action, as `{ version: SAVE_VERSION, state }` under one key
  (`eclipse.save.v1`). RunState must be (and remain) JSON-serializable —
  pin with a roundtrip deep-equal test. Mid-combat saves work for free
  because `CombatState` is a plain seeded object (this is iteration 3's
  resumable-combat design paying off).
- **Boot flow:** a minimal landing screen. If a valid save exists:
  **Continue run** (restores state exactly, including mid-combat) and
  **New run** (confirm dialog — explicitly says it abandons the saved
  run). No save → straight to commander pick/setup as today.
- **Versioning, no migrations:** `SAVE_VERSION` is a constant; bump it in
  any PR that changes RunState shape incompatibly. On mismatch, the save
  is discarded silently (offer only New run). Cheap and honest at this
  stage; migrations are a post-1.0 problem.
- **Clearing:** victory and defeat clear the save (end screens are
  terminal). An **Abandon run** action (map screen, confirmed) clears it
  and returns to the landing screen.
- **Fail soft:** localStorage unavailable or quota-full (private mode) →
  play proceeds save-less with a one-line banner ("saving unavailable");
  never throw.
- Resuming restores the exact screen: mid-combat resumes the stepped fight
  with log, hand, and used actives intact — assert bit-identical
  continuation in a test (save mid-fight, reload, `runToEnd` equals the
  never-saved run).

### 9.3 Mixed enemy formations

`EnemyDef` generalizes from one uniform group to a **composition of
sub-groups**, each with its own per-ship stats, count, and initiative:

    interface EnemyDef {
      id: string; name: string;
      groups: { label: string; count: number; stats: EnemyShipStats }[];
    }

Existing single-group enemies become one-entry compositions (mechanical
migration, no behavior change — pin with a test that the old defs resolve
identically). Sub-groups activate at their own initiative (existing
activation machinery); enemy targeting is unchanged. Elite (+2 HP) and
veterancy bonuses apply to **every member ship**. The enemy panel renders
one stat card per sub-group.

New formation enemies (eyeballed; gate suspended):

| Name | Pool | Composition | The puzzle |
|---|---|---|---|
| Escorted sniper | act-1 hard | 1× sniper (init 2, HP 2, comp 3, 1×plasma) + 2× screen (init 1, HP 1, 1×ion) | greedy targeting shoots the screens while the sniper shoots you — the fight doctrine was made for |
| Carrier group | act-2 mid | 1× tender (init 0, HP 6, comp 1, 2×missile) + 3× drone (init 3, HP 1, 1×ion(2dmg)) | kill the tender before its alpha, through a drone screen |
| Command wing | act-2 hard | 1× commander (init 3, HP 5, comp 2, shield 2, 2×plasma) + 2× lancer (init 2, HP 3, 1×lance) | the commander hides behind lancers that pierce your shields |

Elite variants of formations are legal (hardest entry of the column's pool,
as ever, +2 HP to all members).

### 9.4 Targeting doctrine

A fleet-wide stance, set on the prep screen, **persisting between fights
until changed**:

| Stance | Player dice assignment |
|---|---|
| **Focus weakest** (default) | current greedy lowest-remaining-HP — kills screens/swarms fastest |
| **Focus strongest** | highest-remaining-HP first — punches through screens to the threat |

- Applies to all player cannon and missile dice. The **siege cannon keeps
  its own override** (always strongest, regardless of stance). Enemy
  targeting is untouched.
- **The forecast shows both stances' win rates** on the prep screen
  (two-line readout, current stance highlighted). This is the legibility
  payoff: against the Escorted sniper the two numbers visibly diverge,
  and the player learns what doctrine is *for* without a tutorial. (2×
  1000 sims is still cheap; memo key gains the stance.)
- A "spread fire" third stance was considered and parked — no current
  fight wants it; add it only when one does.

### 9.5 Cruiser (new purchasable frame)

The escort roster has a gap: Interceptor (3 slots, cheap dice, Jink),
Bastion (5 slots, weapon-capped tank) — nothing in between that can simply
fight. The Cruiser is the balanced workhorse:

| Frame | Cost | Slots | Base HP | Base init | Weapon cap | Innate | Pre-fitted |
|---|---|---|---|---|---|---|---|
| Cruiser | 10 cr | 4 | 4 | 1 | none | none | 1× ion cannon |

Its identity is the *absence* of a gimmick: the only escort that can carry
a real multi-weapon loadout. Frame roster after this iteration:
Interceptor 6 / Cruiser 10 / Bastion 12 / Dreadnought 20, slots
3/4/5/8 — a clean price-and-role ladder. `BUY_SHIP` gains the frame;
fleet cap stays 4.

### 9.6 Tests

- Determinism: same seed + same action sequence → deep-equal states at
  every step; combat seed fixed at `PICK_NODE` (reload before Engage
  cannot change the fight); shop stock/reroll/job offers identical after
  reload; no `Math.random`/`Date.now` in `src/game/`.
- Persistence: JSON roundtrip deep-equals RunState in every phase (incl.
  mid-combat and mid-event); autosave fires on every action; version
  mismatch discards; victory/defeat/abandon clear; fail-soft when
  localStorage throws; saved-mid-fight continuation is bit-identical to
  an unsaved run.
- Formations: migrated single-group defs resolve identically to before;
  sub-groups activate at their own initiative; elite/veterancy bonuses
  hit every member; enemy panel data includes every sub-group.
- Doctrine: weakest vs. strongest produce the intended assignments against
  a screened formation; stance persists between fights; forecast returns
  distinct numbers per stance; siege cannon ignores stance.
- Cruiser: stats/cost/pre-fit; no weapon cap; purchasable alongside the
  other frames.

### 9.7 Milestones

- **I9-M1 — determinism + saves:** run-level RNG counters, combat seed at
  PICK_NODE, serializability, autosave/landing/continue/abandon,
  versioning, fail-soft. Tests green.
- **I9-M2 — formations + doctrine:** EnemyDef composition migration, the
  three formation enemies, stance state + assignment, per-stance forecast,
  enemy panel per-sub-group cards. Tests green.
- **I9-M3 — cruiser + polish:** the frame, shop integration, browser pass
  (quit mid-combat and resume to the same rolls; flip stance against the
  Escorted sniper and watch the forecast diverge; a Cruiser bought and
  armed as a second gunship).

**Definition of done:** closing the tab no longer ends a campaign, and
reloading never changes fate; a screened formation punishes the default
doctrine and rewards the player who reads the enemy panel and switches;
and the shop's frame row reads as four distinct answers to "what does my
fleet lack?"
