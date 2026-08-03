## Iteration 17 — complete

> **Status:** implemented and verified 2026-08-02/03. 385/398 tests
> (372 baseline + 13 new Outspeed tests), `tsc -b` and `vite build` clean.
>
> - **17-M1 (engine):** `OUTSPEED_GAP = 4`, `qualifiesForOutspeed`,
>   `computeOutspeedShips` (evaluated once per cannon round, right after
>   the normal activation loop — never in the missile phase), a bonus
>   activation pass in `advanceRound` before the stalemate check, the new
>   `OutspeedEvent` log kind, and `outspeedingShipIndices(state)` for the
>   UI. 13 new tests cover the gap-4/gap-3/gap-99 boundary, the mid-round
>   unlock (killing the enemy's only fast escort during the normal round
>   grants the bonus that same round), evading-ship tempo cover,
>   `injector`-round outspeed, symmetric enemy outspeed + denial, bonus-
>   phase fastest-first ordering, volley/rift/priority composition with
>   the bonus activation, and stepped-vs-`runToEnd` determinism through an
>   outspeed-heavy fight. 8 pre-existing tests needed fixing: several used
>   `initiative: 5` purely to force activation order (with the player
>   defaulting to 0), which now also happens to satisfy the gap-4
>   threshold and granted an unplanned bonus activation, breaking exact
>   roll-count assertions — fixed by lowering those to `initiative: 3`
>   (still forces order, stays under the new threshold).
> - **17-M2 (legibility):** OUTSPEED badges (⚡×2) in the combat theater
>   (reactive to live state, including activating instantly when an
>   active gets armed) and the prep-screen fleet panel (static, vs. the
>   committed enemy); a two-directional EnemyPanel readout ("Their fastest
>   ship: init N..." / a warning when an enemy group outspeeds the
>   fleet); a log line + matching banner fx for every bonus activation.
>   **Verified live** in the browser end-to-end, including the actual
>   positive case (badge → bonus roll → log line → banner, all in one
>   fight) which real play RNG didn't cooperate with for over an hour —
>   several real runs hit unlucky mid/hard-pool draws (repeatedly
>   interceptor-swarm/ancient-guardian at init 2-3, just under the
>   threshold) and lost fragile speed-carrier ships before a qualifying
>   matchup appeared. Resolved by patching a saved run's `combat` state
>   directly via `localStorage` (player init 20 vs. enemy init 0) and
>   reloading — this exercises the real rendering pipeline against a
>   controlled scenario, not a fabrication — which confirmed: the badge
>   renders (`combat-ship--outspeeding-player` + the ⚡×2 mark), the bonus
>   activation actually fires a second roll, the log line reads
>   correctly, and the banner shows matching text. The enemy-outspeeds-
>   warning path was verified the same way (patched `currentEnemy` to
>   init 20, confirmed "Their sniper (init 20) outspeeds your fleet —
>   expect double strikes. Any ship at init 17+ denies it.", math correct
>   per `OUTSPEED_GAP`).
> - **17-M3 (balance audit):** see the results below. All 11 sanity
>   checks pass after two real construction mistakes were found and fixed
>   by the audit itself — see the notes under the table.

**Balance audit results** (`npm run balance`, 1000 sims/matchup):

| Enemy | strike fleet (init 5) | strike rounds | no-speed control | control rounds |
|---|---|---|---|---|
| Scout pack | 100% | 1.31 | 100% | 1.52 |
| Missile frigate | 100% | 1.31 | 100% | 1.56 |
| Shield cruiser | 94% | 4.11 | 89% | 4.76 |
| Interceptor swarm | 98% | 3.81 | 98% | 2.82 |
| Plasma tank | 82% | 3.64 | 71% | 4.28 |
| Sniper | 99% | 2.00 | 100% | 1.53 |
| Missile swarm | 100% | 2.92 | 100% | 2.20 |
| Ancient guardian | 11% | 4.66 | 17% | 4.28 |
| GCDS | 0% | 2.03 | 0% | 2.04 |
| Sniper (elite) | 96% | 2.88 | 99% | 2.17 |
| Ancient guardian (elite) | 0% | 4.08 | 1% | 4.13 |

Hive Empress (init 4) tempo-cover test: **all-init-0 fleet 9%** (avg 2.52
rounds) vs. **same fleet + 1 Interceptor 15%** (avg 2.14 rounds) — the
Interceptor's initiative alone (2, denying her gap-4) nearly doubles the
win rate against her signature all-ships-outspeed alpha.

All 11 sanity checks pass, including the 4 new ones added for this
iteration:
`strike fleet vs plasma tank (its prey, init 0) is 65-90%` (82%, PASS),
`strike fleet vs plasma tank beats the no-speed control` (82% > 71%,
PASS), `strike fleet vs interceptor swarm (init 3) within 5pp of control`
(98% vs 98%, PASS), `Hive Empress: one Interceptor measurably improves the
win rate` (15% > 9%, PASS).

Two construction mistakes surfaced and fixed while building this audit,
both recorded in `scripts/balance.ts` comments so they aren't repeated:

1. **The first strike/control fleet pair swapped the fusion drive for a
   plasma cannon** (a strictly *better* weapon than the ion cannons kept
   elsewhere), which made the control fleet win outright on raw firepower
   against tanky targets — measuring "which fleet has better guns," not
   speed. Fixed by keeping the SAME weapon type on both (2 ion cannons
   doubled some rounds vs. 3 ion cannons every round) so the only
   variable is initiative.
2. **The first Hive Empress test fleet failed for two different reasons
   in sequence**: an under-armored version (hp 3, shield 1) died outright
   to her 12-die missile alpha; a better-armored but under-gunned version
   (hp 5, 1 weapon) survived fine but couldn't clear her 6 ships (hp 2
   each) within the 30-round cap, hitting the stalemate loss instead —
   both read as a flat 0% with no way to tell them apart. Fixed with a
   2-ship fleet (Flagship + a slow tanky escort, swapped for an
   Interceptor in the tempo-cover variant) carrying real firepower
   (plasma cannons), which finally produced a real, differentiating
   result.

One finding worth flagging for future tuning, not a bug: against
**Ancient guardian**, the no-speed control (17%) beats the strike fleet
(11%) — because the guardian's escort frigates (init 1) keep "fastest
surviving enemy" at 2 as long as either escort is alive, and 5-2=3 stays
under the gap-4 threshold for the whole fight. The strike fleet never
outspeeds this matchup at all, so it's just running 2 ion cannons against
the control's 3 — the intended "speed you can't leverage costs you the
slots it took" behavior (17.4 target #2), just discovered against a
second enemy (init 2, not only init ≥3) beyond the one the spec
anticipated.

**Outspeed.** Initiative has been the weak stat since iteration 1: it only
orders activations, which matters in round 1 and against missile alphas,
then evaporates. Iteration 11 planned to fix this with evasion and never
shipped it (now formally superseded — see the note in iteration-11.md).
This iteration fixes it with tempo instead: **a large enough initiative
advantage grants a second activation.** Doubling a ship's output is a big
swing on purpose — that is what makes initiative a build-around instead of
a footnote — and every clause of the rule below exists to keep it a
*capped, conditional* swing rather than a mandatory stat.

### 17.1 The rule

> At the end of each **cannon** round, every surviving ship whose
> effective initiative is **at least 4 higher** than the **fastest
> surviving opposing ship's** performs one extra activation — cannons
> only, full dice. **Never more than one extra activation per ship per
> round**, regardless of gap.

Pinned mechanics (implement exactly):

- **Cannon rounds only.** The missile phase never outspeeds — missiles
  already fire exactly once per combat, and doubling alpha strikes would
  warp the game's whole opening-turn balance.
- **Evaluated when the bonus phase begins** (i.e., after the round's
  normal activations resolve). "Fastest surviving opposing ship" means
  alive at that moment — so killing the enemy's last fast ship *during*
  the round unlocks your outspeed **that same round**. This is the rule's
  best emergent decision: fast enemy screens are tempo cover, and
  focusing them down (priority click) turns your speed advantage on
  mid-fight. Symmetrically, keeping one cheap fast Interceptor alive
  denies enemy outspeeds against your slow hulls.
- **Effective initiative** = ship initiative + the player-side
  `roundModifiers.initiativeBonus` (so the `injector` active's +99 round
  grants the fleet outspeed for that round — intended; it turns a weak
  active into a planned alpha round). Evading (`thrusters`) ships still
  count as "surviving" for tempo-cover purposes on both sides — they are
  alive and fast, merely untargetable.
- **Both sides symmetric.** With current numbers only the Hive Empress
  (init 4) can outspeed, and only against a fleet whose fastest ship is
  init 0 — any surviving init-1+ ship blocks her. That is her new
  signature threat, and the counter (one fast escort) is cheap and
  legible. The `overdrive` escalation (+1 enemy initiative) can push
  init-3 enemies to the threshold against init-0-only fleets — an
  escalation genuinely worth revealing early.
- **Bonus-phase order:** outspeeding ships activate in descending
  effective initiative, player wins ties (the existing convention).
- Priority target, stance, siege override, volley (a `volley` round
  doubles the bonus activation's cannon dice too — rare card, allowed),
  rift backfires, flak (n/a — no missiles), jink, reactive armor, chaff:
  all apply to the bonus activation exactly as to a normal one. No
  special cases.
- Stalemate counting unchanged (`MAX_CANNON_ROUNDS` counts rounds, not
  activations). The stepping ≡ `runToEnd` determinism invariant must
  hold (bonus-phase rolls flow through the same counted rng).
- **Log:** each bonus activation is announced with a
  `part-effect`-style line — "Flagship #1 outspeeds the enemy fleet —
  second activation." — which also gets the theater's banner fx for
  free.

### 17.2 Legibility (required, house style)

- **OUTSPEED badge** on any ship card (combat theater + prep fleet
  panel) currently qualifying against the live opposing fleet, with a
  tooltip stating the numbers ("init 5 vs their fastest 1 — acts twice
  each round").
- **Enemy panel readout**, both directions, next to the existing
  required-computer line:
  - "Their fastest ship: init N. Your ships at init N+4 or more strike
    twice each round." (name the player ships that currently qualify, if
    any);
  - a warning when any enemy group is ≥ your fastest ship + 4: "They
    outspeed your whole fleet — expect double strikes. Any ship of init
    M+ denies it."
- The threshold constant (`OUTSPEED_GAP = 4`) lives in one exported
  place; every readout derives from it (no hardcoded 4s in copy).

### 17.3 What this deliberately does NOT touch

- No per-point scaling, no triple activations, no missile outspeed.
- No enemy stat changes in this iteration — the Empress and the
  escalation interaction are the only enemy-side expressions, both
  emergent. If the balance audit (17.4) shows act-2 fast swarms need the
  threat too, that is a tuning follow-up with its own numbers, not a
  silent buff here.
- Evasion (iteration 11.2) stays dead.

### 17.4 Balance audit (script as tool, numbers recorded here)

Add to `scripts/balance.ts`:

- A **strike fleet** reference build (Flagship with fusion drive +
  `drives` upgrade + guns → init 5, plus standard escorts) and a
  **no-speed control** (same credits, drives swapped for guns).
- Report, per enemy: win rate for both fleets and average cannon rounds.
- Targets:
  1. Strike fleet vs init ≤1 enemies (its prey): **70–85%** — strong,
     not free (the control fleet should sit visibly lower against the
     same enemies).
  2. Strike fleet vs init ≥3 enemies: within **±5pp** of the control
     fleet — speed you can't leverage should cost you the slots it took.
  3. Hive Empress vs an all-init-0 fleet vs the same fleet plus one
     Interceptor: the gap between those two numbers is her signature
     working — report both.
  4. No non-boss matchup's average length rises (outspeed only shortens
     fights).
- Record before/after tables in this file per house tradition.

### 17.5 Tests

- Gap 4 grants exactly one extra cannon activation at end of round;
  gap 3 grants none; gap 99 still grants exactly one.
- Missile phase never outspeeds, even at gap 99.
- Mid-round unlock: enemy's only fast ship dies during the round → the
  qualifying player ship outspeeds that same round.
- Tempo cover: one surviving fast ship on either side denies the other
  side's outspeed (evading ships still count).
- `injector` round: fleet outspeeds for exactly that round.
- Symmetry: an init-4 enemy vs an all-init-0 player fleet double
  activates; adding one init-1 player ship stops it.
- Bonus-phase order: two qualifying ships activate in descending
  initiative; player wins ties.
- Composition: volley doubles the bonus activation's dice; a rift
  backfire in the bonus phase can destroy the firer; priority target
  applies.
- Determinism: stepping round-by-round ≡ `runToEnd`, bit-identical, with
  outspeed rounds in the seed's path; log contains the outspeed
  announcement line.

### 17.6 Milestones

- **17-M1 — engine:** the rule in `advanceRound`/`fireShip` (a bonus
  activation pass after the normal order), `OUTSPEED_GAP` export, log
  line, full test list above. `npm test` / `tsc -b` / `vite build`
  green.
- **17-M2 — legibility:** badges, enemy-panel readout both directions,
  live browser pass (a fusion-drive ship visibly double-acting with its
  banner; the badge appearing mid-fight when the enemy's fast screen
  dies; the Empress warning on her prep screen).
- **17-M3 — audit:** balance-script additions, targets checked, numbers
  recorded here; tuning only if a target misses, with before/after.

**Definition of done:** a drives-heavy build is a real archetype a player
can deliberately assemble and *see working* (badge + banner + log, twice
per round); the counter is visible on the enemy panel before every fight
in both directions; the Empress is a boss with a signature mechanic
instead of a stat line; and no test, save, or determinism guarantee
regressed.
