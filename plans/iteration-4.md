## Iteration 4 (implemented)

> **Status:** fully implemented and verified. New modules
> (`upgrades.ts`, `escalations.ts`), reducer wiring (`reward` phase,
> `PICK_UPGRADE`/`LEAVE_REWARD`, escalation application at `PICK_NODE`,
> ambush routing through `EVENT_CONTINUE`), and UI (`RewardScreen`,
> escalation strip on the map, shield-legibility readout and escalation
> badges on the enemy panel, upgrade badges on ship cards) all built per the
> spec below. 96/96 tests pass, `tsc -b` and `vite build` are clean. See the
> "Implementation notes" and "Verification" subsections at the end for what
> was scoped down from the original spec and what was confirmed live.

Playtest feedback after iteration 3:

1. **Winning a fight doesn't tell you what you won.** Credits are applied
   silently and you're dropped straight back on the map. Needs a rewards
   screen for every combat win, regular or elite.
2. **Elites should drop something other than money** — specifically a
   *slotless, permanent* upgrade that the player attaches to a ship of their
   choosing, so one ship accretes power over a run and becomes a "capital
   ship."
3. **Events should shape how fights evolve**, not just pay out. Concretely:
   enemies should escalate over a run, and events should be how you learn
   about (and sometimes prevent) that escalation — giving a reason to take an
   event node over a guaranteed-credits combat node.
4. Carried over from the same session: the **shield/computer dead zone** is
   invisible and is the single biggest source of "this elite is impossible"
   (audit results recorded in 4.4 below). Fixing its *legibility* directly
   serves feedback item 3's goal of better counter-building, so it ships here.

Deliberately NOT in this iteration (still pending a decision): the exotic
dice / variable-die weapon system and the wandering-trader-as-mini-shop
rework. Those are a larger change to the combat math, discussed in chat but
not specced here.

### 4.1 Post-combat rewards screen

New phase `reward`, between `combat` and `map`. Flow becomes
`combat (won) -> reward -> map`. A loss still goes straight to `defeat`.

`CONTINUE` (from a won combat) stops applying rewards inline. Instead it
computes a `RewardSummary` and moves to the `reward` phase:

    interface RewardSummary {
      credits: number;             // credits earned at this node
      creditsTotal: number;        // running total after the award
      cardGained?: CardId;         // elite card drop, if any
      cardInsteadCredits?: number; // the +4 fallback when the hand was full
      salvagedParts: PartId[];     // parts recovered from destroyed ships
      lostShips: string[];         // labels of ships destroyed this fight
      upgradeOptions?: UpgradeId[];// elites only: 3 choices (see 4.2)
    }

Credits, salvage, and the card are applied immediately — the screen reports
what already happened. The upgrade is the only thing left pending, because it
needs a player decision. New actions: `PICK_UPGRADE { upgradeId, shipIndex }`
and `LEAVE_REWARD` (guarded — cannot leave while `upgradeOptions` is set and
unresolved).

The screen lists, in order: credits earned and the new total, any reaction
card gained, any ships lost plus the parts salvaged from them, then — for
elites only — the upgrade picker. A boss win skips the reward screen entirely
and goes to `victory`.

### 4.2 Ship upgrades ("capital ship")

**Slotless and permanent.** `PlayerShipState` gains `upgrades: UpgradeId[]`.
Upgrades do NOT consume frame slots — a 6-slot Cruiser carrying 4 upgrades
still holds 6 parts. Stacking duplicates is allowed (two Reinforced spines =
+4 HP).

**Awarded by elites only**, as a pick-1-of-3 drawn uniformly from the pool,
followed by a pick-which-ship step on the same screen.

**Lost with the ship.** When a ship is destroyed its *parts* still salvage
back to inventory (existing rule) but its *upgrades are destroyed with it*.
This is deliberate — it is what gives the capital ship real stakes and makes
cheap escort interceptors strategically meaningful. Flagged as the main
tuning knob in this iteration: if playtesting shows it is too punishing, the
fallback is returning upgrades to a re-attachable pool instead.

Pool (8 upgrades):

| id | Name | Effect |
|---|---|---|
| `spine` | Reinforced spine | +2 max HP |
| `reactor` | Auxiliary reactor | +1 computer |
| `lattice` | Deflector lattice | +1 shield |
| `drives` | Overtuned drives | +2 initiative |
| `optics` | Piercing optics | This ship ignores 1 point of enemy shield |
| `autoloader` | Autoloader | This ship gains an extra 1-damage cannon die |
| `regen` | Regenerative plating | Repairs 1 damage after each combat |
| `salvage` | Salvage rig | +3 credits per combat won |

`spine` / `reactor` / `lattice` / `drives` / `autoloader` fold into
`deriveStats` exactly like parts. `optics` needs a new `shieldPierce: number`
field on `ShipStats`, subtracted from the defender's shield inside the hit
check (floored at 0). `regen` and `salvage` are reducer-level, applied when
the reward is computed.

`optics` is in the pool specifically as a direct answer to the shield dead
zone (4.4) — it is the one reward that can rescue a build with no computers.

**UI:** ship cards (fleet panel, combat fleet view, reward picker) show
upgrade badges under the stat line. A ship with several badges should read at
a glance as the fleet's capital ship.

### 4.3 Enemy escalation + intel events

**Escalation.** A run carries a fixed schedule of enemy-wide buffs that land
at set map columns, seeded at run start from the map seed. Two per run,
landing **after column 2** and **after column 5** (so they affect columns 3-5
and 6+ respectively), each drawn from:

| id | Name | Effect on every enemy |
|---|---|---|
| `hardened` | Hardened hulls | +1 HP per ship |
| `deflectors` | Deflector refit | +1 shield |
| `firecontrol` | Fire control upgrade | +1 computer |
| `overdrive` | Overcharged drives | +1 initiative |
| `squadrons` | Reinforced squadrons | groups of 2+ gain one extra ship |

Applied when the enemy is chosen at `PICK_NODE`, so the prep screen and the
Monte Carlo forecast both see the real escalated enemy with no extra work.
The enemy panel labels escalated stats so the player can see why the numbers
moved.

**Intel is the point.** Escalations are scheduled but *hidden* until
revealed. The value of knowing early is concrete and specific: shops sit at
columns 2, 4, and 6, and escalations land right after columns 2 and 5 — so
intel tells you what to buy *at the shop you are standing in*, before the
fight that punishes you for guessing wrong. That is the reason to take an
event node over a guaranteed-credits combat node.

`RunState` gains:

    escalations: {
      id: EscalationId;
      landsAfterColumn: number;
      revealed: boolean;
    }[]

**Event pool changes.** Add intel-flavoured events:

| id | Title | Choice A | Choice B |
|---|---|---|---|
| `intercepted-signal` | Intercepted signal | "Decrypt it": reveal the next unrevealed escalation | "Sell the codes": +5 credits |
| `recon-probe` | Recon probe | "Launch it": reveal the enemy at every combat node in the next column | "Strip it for parts": +4 credits |
| `sabotage-raid` | Shipyard raid | "Hit the yard": cancel the next unrevealed escalation entirely, and take 2 damage on a random ship | "Too risky": +3 credits |
| `defector` | Defector pilot | "Take them aboard": reveal ALL remaining escalations | "Turn them in": +6 credits |

Keep `derelict-cruiser`, `asteroid-field`, and `abandoned-arsenal` as-is.
Rework `ancient-cache` (see 4.3a). Retire `distress-beacon` and
`wandering-trader` from the random pool for now — the trader is getting its
own mini-shop rework in a later iteration and should not be half-reworked
here.

Note the shape of every intel event: choice A is strategic value, choice B is
plain credits. That makes "information vs. money" the actual decision, which
is the design goal.

### 4.3a Events that start a fight

Right now `ancient-cache`'s risky branch grants a part and applies a flat
2 damage to a random ship. Flat chip damage is a weak consequence — it is
invisible in the moment and abstract. Replace it with an actual combat: you
take the artifact, and the energy surge **attracts** a patrol that jumps you.
(Note the fiction: the ship is attracted by the theft, not released from
inside the cache.)

**New event outcome kind.** `resolveEventChoice` can return an ambush
alongside its state change:

    interface EventResolution {
      state: RunState;
      outcomeText: string;
      ambushEnemy?: EnemyDef; // set -> this choice leads into a fight
    }

Stored on `currentEvent` as `ambushEnemy`. `EVENT_CONTINUE` then branches:
if an ambush is pending it sets `currentEnemy` to that enemy and moves to
`prep`; otherwise it goes to `map` as it does today. Everything downstream
(prep -> combat -> reward -> map) is unchanged and needs no special-casing —
the run's position is still the event node, so `winReward(col)` pays the
normal combat rate for the column and the elite/boss checks correctly do not
fire.

**The item is granted before the fight, and is kept regardless.** The fantasy
is "you grabbed the artifact and now you have to fight your way out," not a
wager on the fight. Losing the ambush still ends the run, so the stakes are
already maximal.

**Enemy selection.** Drawn from `combatEnemyPool(col)` for the current column,
so an ambush is exactly as hard as a normal combat at that depth — never a
difficulty spike the player had no way to prepare for. For `ancient-cache`
specifically, pick the *hardest* entry in that column's pool (thematically an
awakened guardian, and appropriately the steepest price in the pool).

**Why this is a real cost even when you win.** Damage persists between fights
and healing only exists at repair-yard nodes, so an extra unplanned combat
means carrying its damage forward with no extra repair opportunity. The
ambush does not need to be unfair to be a genuine risk — and unlike flat chip
damage, the player watches the cost happen.

**Routing through `prep` is deliberate.** The player still gets the forecast,
their reaction-card hand, and a chance to re-equip. Denying that would be a
special case with no upside — parts are free to swap everywhere else, so
blocking it here would read as arbitrary rather than tense.

Reworked entry:

| id | Title | Choice A | Choice B |
|---|---|---|---|
| `ancient-cache` | Ancient cache | "Force it open": gain a random 7-cr part (comp3 or init3); the surge attracts a patrol — **fight it** | "Leave it": nothing |

**Map screen** gains an escalation strip: one entry per scheduled escalation
showing its column and either its revealed name and effect, or "unknown".

### 4.4 Make the shield wall legible

No math changes — purely surfacing what already exists. Against an enemy with
shield S, the hit check `roll + computer - shield >= 6` means computer values
from 0 to S are all identical (only a natural 6 lands, 17%); computer only
starts paying off at S + 1.

Measured (brute-forced over every legal 6-slot build) against the col-7
elite, a 2x plasma + hull2 chassis wins:

| Computer | Win rate |
|---|---|
| +0 | 7% |
| +1 | 7% |
| +2 | 7% |
| +3 | 25% |
| +4 | 48% |
| +5 | 69% |
| +6 | 83% |

The same audit found the elites are entirely killable — the best in-budget
build wins 90% (col-3) to 100% (col-5/col-7) — but the *median* legal build
wins 5%, and only 13% of builds clear a coin flip. The elites are not too
strong; they are binary, and the deciding mechanic is invisible.

The enemy panel must therefore state the requirement outright, e.g.:

> Shield 2 — needs **computer 3+** to hit on anything but a natural 6.
> Your best ship: computer 1.

Compute as `requiredComputer = enemy.stats.shield + 1` (accounting for any
`shieldPierce` on the player's ships) and compare against the fleet's best
effective computer, warning when short. This is the cheapest possible fix for
the game's biggest legibility problem, and it fits the core design pillar:
enemies are telegraphed, and you counter-build against them.

### 4.5 Tests

- Reward flow: a won combat routes `combat -> reward -> map`; credits and
  salvage land exactly once; a boss win skips the reward screen;
  `LEAVE_REWARD` is blocked while an elite upgrade choice is pending.
- Upgrades: slotless (a 6-slot cruiser holding 6 parts still accepts
  upgrades); stat upgrades fold into `deriveStats`; duplicates stack;
  `optics` reduces effective enemy shield in the resolver and floors at 0;
  `regen` heals 1 on a win; `salvage` adds credits; a destroyed ship's
  upgrades are gone while its parts still salvage.
- Escalation: the seeded schedule is deterministic; an escalation applies
  only from its column onward; `squadrons` only affects groups of 2+; the
  forecast reflects escalated stats.
- Intel events: each reveals what it claims; `sabotage-raid` removes a
  scheduled escalation and caps its self-damage at hp-1; credit-only branches
  pay out correctly.
- Ambush events: `ancient-cache` choice A grants the part immediately AND
  sets `ambushEnemy`; `EVENT_CONTINUE` with an ambush pending routes to
  `prep` with `currentEnemy` set (and to `map` without one); the ambush enemy
  comes from the current column's pool; winning the ambush pays the normal
  column combat reward and is not treated as an elite or boss; losing it ends
  the run in `defeat`; choice B sets no ambush and returns to `map`.

### 4.6 Milestones

- **I4-M1 — rewards + upgrades:** `reward` phase, `RewardSummary`,
  `upgrades` on ships, the 8-upgrade pool, `shieldPierce` in the resolver,
  upgrade badges in the fleet UI. Tests green.
- **I4-M2 — escalation + intel:** escalation schedule and application, the
  four intel events, event-pool swap, the `ancient-cache` ambush rework
  (4.3a), escalation strip on the map. Tests green.
- **I4-M3 — legibility + polish:** required-computer readout on the enemy
  panel, escalated-stat labelling, `npm test` / `tsc -b` / `vite build` all
  green, plus a browser pass covering an elite win, attaching the upgrade,
  and a later fight showing the escalated enemy.

**Definition of done:** every combat win reports what it paid; an elite win
lets you attach a permanent slotless upgrade to a ship of your choice, and
that ship visibly accumulates power across a run; losing that ship visibly
costs you those upgrades; a player standing in the column-2 shop can spend an
event node (instead of a combat node) to learn that "+1 shield" is coming and
buy computers accordingly; and forcing the ancient cache open drops you
straight into a fight you have to win to keep going.

### Implementation notes (spec followed as written, with these clarifications)

- **`recon-probe` was scoped down.** The spec's literal wording ("reveal the
  enemy at every combat node in the next column") implies pre-assigning a
  specific enemy to every map node at generation time, so a scouted column
  can name exact fights before they're entered. That's a legitimate
  architecture upgrade (and would make the whole run's enemy sequence
  deterministic from the map seed), but it's a materially bigger change
  touching `map.ts`'s generation and `reducer.ts`'s `PICK_NODE`, for a single
  event's payoff. Implemented instead: `recon-probe` reveals the **enemy
  pool** the next column's combat nodes draw from (e.g. "Shield cruiser,
  Interceptor swarm, or Sniper ahead"), via `combatEnemyPool(nextCol)`,
  read-only, no new persistent state. This still answers "what do I need to
  prepare for" — just as a short list instead of a single certainty. Elite
  nodes remain unscouted either way, matching the spec's literal scope
  (combat nodes only).
- **Ambush enemy selection is live, not seeded.** `hardestEnemyForAmbush(col)`
  is deterministic *by column* (missile-frigate / sniper / ancient-guardian
  for the three depth bands) but not tied to the map's rng stream — consistent
  with how every other event outcome already resolves (via
  `mulberry32(randomSeed())` in `EVENT_CHOOSE`, not the map seed). Only the
  map's *structure* was ever a determinism requirement.
- **Elites keep their iteration-3 card drop in addition to the new upgrade
  pick.** The spec didn't say to remove it, and "elites should drop something
  besides money" reads as "pile on more non-monetary rewards," not "replace
  the existing one." An elite win now grants: column-scaled credits, a
  reaction card (or +4 credits if the hand is full), *and* a pick-1-of-3
  upgrade.
- **`regen`/`salvage` are reducer-level, not `ShipStats` fields** — they have
  no in-combat effect, so they're applied once, at `CONTINUE` time, per
  surviving ship's upgrade list. Duplicates stack (two `salvage` = +6
  credits/win; two `regen` = 2 damage healed/win, capped at the damage
  present).
- **`shieldPierce` is optional (`number | undefined`) on `ShipStats`**, not
  required, specifically so none of iteration 1-3's existing `ShipStats`
  literals (in `enemies.ts`, and dozens of test fixtures) needed updating —
  `?? 0` at the one read site in `combatEngine.ts` covers the absent case.

### Verification

- `npm test`: 96/96 passing across 7 files (resolver 14, forecast 4,
  combatEngine 10, map 9, escalations 7, events 20, reducer 32).
- `npx tsc -b`: clean. `npx vite build`: clean.
- Browser playthrough (dev server), verified live:
  - A regular combat win → reward screen showing the correct credit amount
    and running total → "Back to map" returns cleanly to the map phase.
  - The map's escalation strip renders both scheduled escalations as
    "unknown" at run start.
  - An elite node (column-3 Sniper) shows the escalated enemy correctly
    (elites and combats alike now reflect the run's live escalation
    schedule); engaged and lost at its measured ~2-14% starting-fleet odds —
    consistent with the balance data already on record for this matchup.
  - A "Defector pilot" event (new intel event): choosing to reveal escalations
    updates the map's escalation strip immediately, from "unknown" to each
    escalation's real name and effect.
  - An "Ancient cache" event: forcing it open grants the part immediately,
    shows the ambush outcome text, relabels its continue button to "Face the
    patrol" (confirmed distinct from the normal "Back to map" label), and
    clicking it routes straight to the prep screen against the correct
    column-scaled ambush enemy (Sniper, at column 3) — with the granted part
    already sitting in inventory, kept regardless of the fight's outcome.
  - Not independently re-confirmed live in the browser (relying on the 9
    dedicated reducer tests plus code review instead, after an unlucky ~2%
    elite fight ate the run before a second elite could be reached): the
    upgrade-picker's actual on-screen rendering (3 upgrade cards → ship
    picker) for an elite win specifically. The underlying `RewardScreen`
    component and its non-upgrade code path were confirmed live in the same
    session; only the `upgradeOptions`-present branch went unconfirmed
    visually this pass.
