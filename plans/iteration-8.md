## Iteration 8 — complete

### Status: I8-M3 (endgame economy + polish) — done

Implemented: the Dreadnought frame (8 slots, max 4 weapons, base HP 8/init
0, 20 cr, no starting-fit part — a blank slate); scuttling (`SCUTTLE_SHIP`,
shop-only: decommissions a non-Flagship ship, parts return to inventory,
upgrades are destroyed, no refund, re-indexes or fails an in-flight
delivery quest's carrier as needed); addendum A.2 job-board stakes
(`QUEST_STAKE` deducted at `ACCEPT_QUEST`, refused when unaffordable,
forfeit on any failure path since nothing refunds it; rewards raised to
bounty +18cr, delivery +15cr/+4cr fallback, recon +3 intel on top of its
existing vision/escalation bundle); the 8.6 readout fix for high-shield
walls like the Void Citadel (`EnemyPanel` now says "needs computer 6+ — or
shield pierce" whenever the fleet's best *raw* computer alone doesn't clear
the bar, distinguishing that from the pierce-adjusted number it already
showed).

Deviations / notes:
- Per the user's standing instruction this session ("skip all browser
  passes"), M3's own browser-pass acceptance item (full two-act run, the
  opener scratching but never sinking a fresh Flagship, a veteran label, an
  interlude Refit, a Citadel loss the readout explained in advance) was
  **not** performed. Verification bar met instead: `npm test` (232 tests),
  `tsc -b`, `vite build` all green.
- Scuttling reuses the same "equipped parts salvage, upgrades vanish"
  rule already established for combat losses and Withdraw — no new
  mechanic, just a new trigger for it.
- Tests added: `reducer.test.ts` gained `BUY_SHIP` (Dreadnought purchase +
  weapon-cap enforcement) and a new `SCUTTLE_SHIP` describe block (parts
  returned, Flagship refused, carrier re-indexed/failed); the stake/reward
  changes updated every existing quest-economy test that hardcoded the old
  numbers.

**Iteration 8 definition of done, revisited:** the opener is a provably
safe on-ramp (pinned invariant test); a full run is two distinct campaigns
with an interlude breath between them; veterancy makes difficulty climb
continuously instead of in three pool-band steps, labeled on the enemy
panel; act 2 uses the player's own tech against them (enemy flak/lance/
rift); the final boss is a rumor bought twice in intel (per-act dossier);
and a rich late-game fleet can restructure via the Dreadnought and
scuttling. All three milestones (M1/M2/M3) are implemented, tested, and
verified per the standing `npm test`/`tsc -b`/`vite build` bar — only the
optional browser pass was skipped, at the user's standing request.

---

### Status: I8-M2 (the enemy) — done

Implemented: veterancy (`veterancyBonus`/`applyVeterancy` in `enemies.ts`,
wired at `PICK_NODE` for combat/elite nodes only — never opener/boss —
labeled on the enemy panel like escalations); the full act-2 roster (9 new
`EnemyDef`s across `EASY_POOL_ACT2`/`MID_POOL_ACT2`/`HARD_POOL_ACT2`,
including the first enemy-side flak, lance shield-pierce, and rift
self-damage); `combatEnemyPool`/`eliteEnemyForColumn`/`bountyEnemyForColumn`/
`hardestEnemyForAmbush` are now all `(act, col)`-aware, re-banded to
easy 0-3/mid 4-6/hard 7-9 for the longer acts; the escalation schedule now
draws 4 (2 per act, still after local cols 3 and 6) and **stacks across the
act boundary** — act-1's escalations, once landed, stay permanently active
through act 2 (implemented by comparing on `globalColumn`, not act-local
columns, so no special-casing was needed at the application site);
`combatEngine.ts`'s flak is now symmetric (enemy flak cancels player
missile/torpedo dice); addendum A.1 (Jink, innate to the Interceptor frame,
consumed before reactive armor), A.3 (Chaff launcher active part, natural
6s resolve as normal rolls for one round), and A.4 (upgrade cap — at most 1
permanent upgrade per ship; a second pick replaces and destroys the first,
enforced at both the elite-reward `PICK_UPGRADE` and the interlude's Field
promotion; the old hard 8-slot effective-slot cap is removed) all landed
here per the addendum's own placement note.

Deviations / notes:
- `nextUnrevealedIndex` (the info broker's escalation-intercept, the recon
  quest reveal, and the intercepted-signal event) picks "soonest by global
  column" across all 4 escalations rather than being act-scoped — since
  escalations are cross-act-permanent, an unrevealed act-1 escalation can
  still be the soonest-and-unrevealed one deep into act 2, and this is a
  faithful reveal of what's already secretly in effect.
- The map's escalation badge display stays act-scoped (only the current
  act's 2 are shown) even though act-1's are still mechanically active in
  act 2 — the per-fight enemy panel's `appliedEscalations` badge is the
  authoritative "what's affecting this enemy right now" readout, so the map
  badge doesn't need to carry that cross-act reminder too.
- Act-2's elite/bounty/ambush picks have no hand-tuned exceptions (unlike
  act 1's fixed per-column assignments) — they're simply "hardest entry of
  the column's pool, elite-strength," per the spec's literal wording for
  8.5's elite variants.
- Tests added: `enemies.test.ts` (new — pool/veterancy/elite/bounty/ambush
  unit coverage); `escalations.test.ts` updated for the 4-entry, cols-3/6
  schedule; `combatEngine.test.ts` gained blocks for enemy flak/lance/rift,
  Jink, and Chaff; `reducer.test.ts` gained blocks for cross-act escalation
  stacking and the upgrade-replace cap. `npm test` (227 tests), `tsc -b`,
  `vite build` all green.

---

### Status: I8-M1 (act machinery) — done

Implemented: two-act `GameMap` (`act1Columns`/`act2Columns`/`act1BossId`/
`act2BossId`), the 11-column quota tables for both acts, `actColumns`/
`actBossId` helpers, `reachableNodes`/`getNode` re-scoped to a single act's
columns, the act-1 opener (`OPENER` in `enemies.ts`, wired at `PICK_NODE`),
the final-boss trio (`FinalBossId`/`FINAL_BOSSES`/`getFinalBoss`), the
`interlude` phase + `INTERLUDE_CHOOSE` action (Refit/War chest/Field
promotion), the global-column economy (`globalColumn` in `reducer.ts`), and
per-act fog/quest/dossier scoping (reset at the act-1→2 transition).
`quests.ts`'s `generateQuestOffer` now takes a single act's columns directly
(was the whole `GameMap`) — quest targets can't cross the act boundary by
construction. `MapScreen`/`App.tsx` render one act at a time and label the
act-2 boss "Final boss"; a new `InterludeScreen` component handles the
3-option choice.

Deviations / notes:
- The act-1 boss win skips the reward screen entirely and goes straight to
  `interlude` (credits/intel applied silently) rather than showing a reward
  screen first — the spec's "no shop here, the choice is the interlude"
  read as skipping the intermediate screen too, not just the shop/upgrade
  pick.
- Field promotion currently just appends the upgrade (pre-addendum-A.4
  behavior) — the one-upgrade-per-ship replace rule lands with the rest of
  A.4 in M2, which explicitly covers the interlude's Field promotion too.
- Act-2 combat/elite nodes still draw from the **act-1 enemy pools**
  (`combatEnemyPool`/`eliteEnemyForColumn` are still act-agnostic) — the
  real act-2 roster (8.5), veterancy (8.4), and the 4-escalation schedule
  land in M2. This milestone only wires the map/phase/economy/fog
  machinery, not the content.
- Tests added: `map.test.ts` fully rewritten for the two-act shape (same
  seed → identical both acts + both boss picks; quotas per act; opener
  connects to all of column 1; act-scoped adjacency); `quests.test.ts`
  re-scoped to `actColumns`; `reducer.test.ts` gained dedicated blocks for
  the opener invariant (missile-only, max damage 2 < min Flagship HP, pays
  4cr+1intel, no line of retreat), the interlude (each option's effect,
  fog/quest/dossier reset, act-2 landing), and the global-column economy
  (act-2 col 0 pays 15). `npm test` (205 tests), `tsc -b`, `vite build` all
  green.

---

## Iteration 8 (planned — after iteration 7)

**The long war.** The run doubles: **two acts**, each a 10-column trellis
plus a boss. Act 1 opens with a guaranteed-survivable fixed fight and ends
at a mid-boss (the existing boss trio); act 2 is a new sector with a harder
enemy roster — built largely on the iteration 5/7 weapon tech — ending at a
new final-boss trio. Enemies also now **scale with depth** (veterancy)
inside each act, on top of escalations.

This iteration deliberately follows iteration 7: act-2 threats must be
answerable with tools the player can buy (lances against shield fortresses,
flak against torpedo wings), several act-2 enemies use the new tech
themselves, and the boss dossier is priced in iteration 7's intel currency.

Balancing directives folded in from play testing (2026-07-26): the run must
open with a single fixed combat that **cannot kill the player** (slight
damage at most); acts should hold **more fights** than iteration 3's
8-column trellis; difficulty should **scale continuously**, not only in
pool bands. Balance gate still suspended; every number is an eyeballed
starting point.

### 8.1 Act structure

- Each act is **11 columns (0–10)**: a 10-column trellis (3 lanes, the
  existing `|row - row'| ≤ 1` adjacency) + a boss at column 10. Two
  exceptions to the 3-lane rule: **act-1 column 0 is a single node — the
  opener (8.2)** — connecting to all of column 1, and each boss column is
  a single node reachable from all of column 9.
- **Global column** for economy = act-1 col 0–10, act-2 col 0–10 ≡ global
  11–21. Combat pays `4 + globalCol`, elites `8 + globalCol` (unchanged
  formulas; act-2 wins pay 15–25 cr). Intel income per iteration 7.5 (+1
  combat, +3 elite) is unchanged and act-independent.
- Both acts are generated at run start from the same `mapSeed` (same seed →
  same full run — pin in a test). State: `act: 1 | 2`;
  position/visited/fled are per-act (fresh for act 2). Losing any combat
  still ends the run. Act-1 boss win → **interlude** (8.3) → act 2 starts
  by picking any act-2 column-0 node. Final boss win → victory.
- The act-1 boss pays like an elite at its column (`8 + 10 = 18` cr, +3
  intel) — the only boss that pays, since the run continues. It is not an
  elite for reward-screen purposes (no upgrade pick).
- **Node quotas** (shuffled within column, as ever):

| Col | Act 1 | Act 2 |
|---|---|---|
| 0 | **opener** (single node) | combat, combat, combat |
| 1 | combat, combat, combat | combat, combat, event |
| 2 | combat, combat, event | shop, combat, event |
| 3 | shop, combat, event | elite, combat, event |
| 4 | elite, combat, event | repair, shop, combat |
| 5 | repair, shop, combat | elite, combat, event |
| 6 | combat, combat, event | combat, elite, event |
| 7 | elite, combat, event | shop, elite, combat |
| 8 | shop, elite, combat | repair, elite, combat |
| 9 | repair, elite, combat | elite, combat, event |
| 10 | boss | final boss |

  A typical act path is now ~7–8 combats (up from ~5–6), with the same
  shop/repair rhythm stretched to match.
- **Map UI:** render one act at a time (3×11 fits the current layout);
  act 2 is not visible during act 1 (a different sector — this keeps
  fog/intel act-scoped for free). Fog vision, scans, and quest target
  placement (`c+2 … 9`) operate within the current act only. Repair yards
  remain always-visible within the current act.

### 8.2 The opener (act-1 column 0)

A single fixed node, always the same enemy, no routing choice — the run's
guaranteed-gentle first step. The trick that makes "cannot kill you" a
mathematical invariant rather than a tuning hope: the opener enemy has
**missile dice only, no cannons**, so its total possible damage output for
the entire fight is hard-capped.

| id | Name | count | init | HP | comp | shield | Weapons (per ship) |
|---|---|---|---|---|---|---|---|
| `pickets` | Picket drones | 2 | 0 | 1 | 0 | 0 | 1×missile (1 dmg) |

- **Invariant (pin in a test):** the opener's maximum total damage across
  the whole fight is 2, and the minimum possible starting Flagship HP is 3
  (base frame HP, even with zero hull parts) — so the opener can never
  destroy the starting ship, only scratch it. The enemy panel's tone can
  say so ("automated pickets — a warm-up").
- After their missiles fire, the drones are harmless; the player's guns
  clean up. The one theoretical edge — a *player* who brought only missiles
  and whiffed them faces the 30-round stalemate loss — is already covered
  by the existing missile-only warning at Engage; no special rule.
- The opener is a normal combat node otherwise: pays `4 + 0` cr and +1
  intel, damage taken persists, no veterancy, no escalations (none are
  scheduled before column 3 anyway), Withdraw unavailable (single node —
  no line of retreat, consistent with the existing rule).

### 8.3 The interlude

After the act-1 boss: a one-screen choice, **exactly one of**:

| Option | Effect |
|---|---|
| Refit | Fully repair every ship |
| War chest | +15 credits |
| Field promotion | 1 random upgrade from the elite pool, attached to a ship of your choice |

Then into act 2. No shop here — the choice is the interlude. (A battered
fleet takes Refit; a healthy one banks power. Persistent damage cashing out
one more time.) New phase `interlude`, action
`INTERLUDE_CHOOSE { index, shipIndex? }`.

### 8.4 Veterancy (continuous depth scaling)

Pools alone make difficulty a staircase; with 10-column acts the steps are
too far apart. Veterancy is a per-column modifier applied to the enemy at
`PICK_NODE` (so prep screen and forecast see it for free), **labeled on the
enemy panel exactly like escalation badges** ("Veteran: +1 HP") — scaling
must stay legible:

| Columns (within act) | Modifier (per ship) |
|---|---|
| 0–3 | none |
| 4–6 | +1 HP |
| 7–9 | +2 HP |

- Applies to combat **and** elite nodes (stacking with the elite's own
  +2 HP bonus and any escalations); never to the opener or bosses (bosses
  are hand-tuned).
- Act 2 uses the same table on top of its already-harder pools and its
  stacked escalations — the intended act-2 curve is pools × veterancy ×
  escalations.
- If play testing wants a sharper late-act bite, the knob is adding
  +1 computer at cols 7–9, not more HP (HP inflates fight length; computer
  inflates threat).

**Escalations: 2 → 4 per run** — the existing two in act 1 (after cols 3
and 6, shifted one column to match the longer act) plus two more in act 2
(same columns), all seeded at run start, all revealable/cancellable through
the existing intel machinery. Act-2 escalations apply on top of act-1's
(enemy-wide and permanent), so late act 2 runs against +2-cumulative-buff
veteran enemies.

### 8.5 Act-2 enemy roster

New catalog entries (per-ship stats **before** veterancy/escalations;
groups uniform — mixed formations stay in the parking lot). Damage-2 dice
are the act-2 baseline; several enemies carry player-tech weapons,
including the first **enemy flak** (the anti-alpha check that keeps torpedo
builds honest) and **enemy lances** (pierce the player's shields —
anti-turtle).

**Easy pool (act-2 cols 0–3):**

| Name | count | init | HP | comp | shield | Weapons (per ship) | The check |
|---|---|---|---|---|---|---|---|
| Raider wing | 3 | 3 | 2 | 1 | 0 | 2×ion(2dmg) | act-2 baseline damage |
| Torpedo boats | 2 | 2 | 2 | 1 | 0 | 1×torpedo(3dmg), 1×ion | kill before launch, or armor through it |
| Lance frigate | 1 | 1 | 5 | 1 | 2 | 2×lance(2dmg, pierce 2) | your shields don't work here |

**Mid pool (cols 4–6):**

| Name | count | init | HP | comp | shield | Weapons (per ship) | The check |
|---|---|---|---|---|---|---|---|
| Rift cult | 2 | 2 | 3 | 1 | 0 | 2×rift(3dmg, nat-1 self-hit) | swingy — punish their bad rounds |
| Flak fortress | 1 | 0 | 8 | 1 | 2 | 2×plasma, flak 2 | missile alphas bounce; bring cannons |
| Antimatter battery | 1 | 1 | 6 | 2 | 1 | 1×antimatter(4dmg) | reactive armor's showcase |

**Hard pool (cols 7–9):**

| Name | count | init | HP | comp | shield | Weapons (per ship) | The check |
|---|---|---|---|---|---|---|---|
| Guardian pair | 2 | 2 | 4 | 2 | 2 | 2×plasma | the old endgame, doubled |
| Warden | 1 | 2 | 10 | 3 | 3 | 2×plasma, 1×antimatter | the pre-boss wall |
| Swarm armada | 5 | 3 | 2 | 0 | 0 | 1×ion(2dmg), 1×missile | arc projectors earn their keep |

Act-1 pools are unchanged, re-banded to the longer act: easy cols 1–3, mid
4–6, hard 7–9. Elite variants: existing `eliteVariant(+2 HP)` on the
hardest entry of the column's pool, as today.

### 8.6 Final bosses (act 2) and per-act dossiers

The existing trio (GCDS, Hive Mother, Dreadnought) becomes the **act-1
boss** pool, unchanged. New final trio, seeded independently (both picks
from `mapSeed`; a run can be Hive Mother → Titan, etc.):

| id | Name | count | init | HP | comp | shield | Weapons (per ship) | The counter it demands |
|---|---|---|---|---|---|---|---|---|
| `titan` | Titan | 1 | 1 | 16 | 3 | 3 | 4×plasma, 2×antimatter | maximum sustained damage + real defense |
| `empress` | Hive Empress | 6 | 4 | 2 | 1 | 0 | 2×missile, 1×ion(2dmg) | flak walls, arc projectors, initiative |
| `citadel` | Void Citadel | 1 | 0 | 20 | 2 | 5 | 2×antimatter, 2×plasma, flak 3 | lances/`optics`/computer 6 — shield 5 is a statement — and cannons, not missiles |

- **Boss dossier is per-act**, priced per iteration 7.5: during act 1 the
  **3-intel** dossier reveals the act-1 boss; once act 2 begins, the
  dossier resets and a second 3-intel purchase reveals the final boss. The
  act-2 boss node reads "Final boss — unknown" until then.
- The 4.4 required-computer readout must handle the Citadel gracefully
  ("needs computer 6+ — or shield pierce"): whenever the fleet's best
  pierce-adjusted requirement beats its best raw computer, the readout
  should recommend pierce.

### 8.7 Dreadnought frame + scuttling

The credit curve roughly doubles across a two-act run; the economy needs a
late-game sink. From the parking lot:

- **Dreadnought** (purchasable frame, 20 cr): **8 slots, max 4 weapons**,
  base HP 8, base initiative 0. Available at any shop (the price gates it
  to act 2 naturally). An alternative fleet architecture: one giant instead
  of flagship-plus-escorts. Not a second Flagship — it accepts upgrades
  like any ship but the Flagship remains the only frame you start with.
- **Scuttling** (needed so a capped fleet can restructure): at any shop,
  decommission a non-Flagship ship — its parts return to inventory, its
  upgrades are destroyed (consistent with combat loss), no credit refund.
  Fleet cap stays 4.

### 8.8 Tests

- Generation: same seed → identical both acts, both boss picks, all 4
  escalations; quotas match the 11-column tables; act-1 col 0 is a single
  node connected to all of column 1; act-scoped adjacency intact.
- Opener: always `pickets`; zero cannon dice on the enemy side (assert on
  the def, so a future edit can't silently break the invariant); max total
  enemy damage 2 < minimum starting Flagship HP 3; pays 4 cr + 1 intel;
  Withdraw unavailable; damage taken persists into the run.
- Veterancy: none at cols 0–3, +1 HP at 4–6, +2 at 7–9; stacks with elite
  bonus and escalations; never applied to opener or bosses; forecast and
  enemy-panel label reflect it.
- Flow: act-1 boss win → interlude → act-2 map; each interlude option
  applies exactly one effect; final boss win → victory; losses anywhere →
  defeat; act-1 boss pays 18 cr + 3 intel with no upgrade pick.
- Economy: `globalCol` credit formula across the act boundary (act-2 col 0
  pays 15).
- Enemies: enemy flak cancels player missile/torpedo dice (symmetric with
  the player's flak); enemy lance pierce applies against player shields;
  rift-cult self-hits can destroy their own ships; pools respect act +
  depth band; act-2 escalations stack on act-1's.
- Dossier: per-act reveal state; 3 intel deducted; final dossier
  purchasable only in act 2.
- Dreadnought/scuttle: weapon cap 4 enforced; scuttle returns parts,
  destroys upgrades, refuses the Flagship, can't empty the fleet.
- Fog/intel/quests: scans and quest targets never cross the act boundary.

### 8.9 Milestones

- **I8-M1 — act machinery:** two-act generation with the 11-column
  quotas, the opener node + invariant, global column economy, interlude
  phase, per-act map UI + fog scoping. Tests green.
- **I8-M2 — the enemy:** veterancy, act-2 roster (incl. enemy
  flak/lance/rift support in the resolver), escalation schedule ×4, final
  boss trio, per-act dossiers. Tests green.
- **I8-M3 — endgame economy + polish:** Dreadnought, scuttling, readout
  updates for shield 5, browser pass (full two-act run; the opener
  scratching but never sinking a fresh Flagship; a veteran-labeled enemy
  in the prep screen; an interlude Refit after a bloody act-1 boss; a
  Citadel loss that the readout explained in advance).

**Definition of done:** the first fight of every run is a safe on-ramp and
provably cannot end it; a full run is two distinct campaigns with a breath
between them; difficulty climbs every few columns instead of in three
steps, and the enemy panel always says why the numbers moved; act 2 feels
like a new war, not a bigger number — its enemies use the player's own
tech against them; the final boss is a rumor you pay (in intel) to hear
twice; and a rich late-game fleet has real ways to spend and restructure
its wealth.

---

## Addendum (2026-07-26, post-iteration-7 play feedback — in scope for iteration 8)

Four changes from live play, added after the spec above was written. Where
they conflict with anything above or with earlier iterations, the addendum
wins.

### A.1 Interceptor rework: Jink

Play finding: interceptors are too weak — the Warlord's free interceptor is
effectively +1 HP that dies in the first fight. The frame gains an innate
dodge:

- **Jink (innate to the Interceptor frame):** once per combat, the first
  hit that would land on this ship **misses instead**. Consumed before
  reactive-armor charges (dodge before armor). Log it with character
  ("Interceptor #2 jinks aside"). Applies per interceptor, per combat,
  automatically — not an active, no button.
- Against the 1-damage dice that usually delete interceptors, Jink roughly
  doubles life expectancy; against an antimatter die it dodges the whole
  4 — occasionally spectacular, always legible.
- No stat or price changes otherwise (6 cr, free ion). The three intended
  interceptor builds already exist as parts and should be treated as the
  frame's identity kit in any shop copy/tooltips: **distraction** (lure
  beacon decoy), **suicide bomber** (ramming prow, + lure), **missile
  bombardment** (torpedo/missile racks in its 3 slots).

### A.2 Job board: stakes

Free quests are always worth accepting, so accepting was never a decision.
Every job now has an **upfront stake** paid in credits at accept (disabled
if unaffordable); rewards rise to roughly 3× the stake. Failure — passive
lapse, fled bounty node, dead cargo carrier — forfeits the stake (no
refund line item; the loss already happened).

| Quest | Stake | Reward on completion |
|---|---|---|
| Bounty | 6 cr | +18 cr and the upgrade pick |
| Delivery | 5 cr | +15 cr and a reaction card (hand-full fallback +4 cr) |
| Recon | 3 cr | the intel-bundle reveals, plus +3 intel |

### A.3 Chaff launcher (new active part)

The anti-chip-damage tool: natural 6s always hit, so even a max-shield ship
bleeds ~1 hit in 6 — invisible to counter-building until now.

| id | Name | Type | Cost | Passive | Active (1/combat) |
|----|------|------|------|---------|-------------------|
| `chaff` | Chaff launcher | shield | 7 cr | +1 shield | This round, natural 6s against **this ship** are not automatic hits — they resolve as normal rolls (`roll + comp − shield ≥ 6`). |

On a shield-3 Bastion against low-computer enemies this is one truly
untouchable round — that's the point, it's the turtle's panic button, once
per combat. Joins the active stratum in shop offers.

### A.4 Upgrade cap: one per ship

Supersedes iteration 4's unlimited stacking and iteration 5's stackable
Expansion bay: **each ship holds at most 1 permanent upgrade.** The
accretion fantasy shifts from one god-ship to a fleet where every ship
carries one identity-defining upgrade — and it pre-balances the
Dreadnought, which would otherwise stack bays and stats on 8 slots.

- `PICK_UPGRADE { upgradeId, shipIndex }`: if the target ship already has
  an upgrade, the new one **replaces** it (the old one is destroyed; the
  UI says so before confirming). The elite reward is therefore never a
  dead pick, even with a fully-upgraded fleet. Same rule for the
  interlude's Field promotion.
- Expansion bay under the cap: at most one per ship, so effective slots =
  `frame.slots + 1` max (Flagship 7, Dreadnought 9). The old "hard cap 8"
  is gone.
- Upgrades still die with the ship (unchanged).

### A.5 Addendum tests + milestone placement

- Jink: once per combat per interceptor; consumed before reactive armor;
  dodges the full damage of one hit; resets between fights; logged.
- Chaff: for one round only, a natural 6 resolves as a normal roll (misses
  vs. high shield, still hits when comp beats shield); per-ship; once per
  combat.
- Stakes: deducted at accept; offer disabled when unaffordable; failure
  forfeits with no refund; rewards match the table.
- Upgrade cap: second upgrade replaces and destroys the first; cap
  enforced on every acquisition path (elite reward, interlude); one bay
  max → Flagship 7 / Dreadnought 9 effective slots.

Placement: Jink + Chaff + the upgrade cap land with **I8-M2** (resolver +
reward wiring); job-board stakes with **I8-M3** (economy polish). Browser
pass additions: an interceptor visibly jinking, and declining a job because
the stake stings.

### A.6 Early-act difficulty floor (play finding: scout packs at column 3)

Diagnosis: iteration 8 stretched the easy band to columns 0–3, the scout
pack is still in the act-1 easy pool even though it was tuned as iteration
3's *fight-1 tutorial enemy* (89–99% win rate by design) and the opener now
owns that job, and veterancy contributes nothing until column 4. Net
effect: a third of easy-band draws are a free win as late as the fourth
fight. Two changes:

- **Retire the scout pack from `EASY_POOL`.** The act-1 easy pool becomes
  missile frigate + missile swarm (two entries is fine — the hard pool
  already has two). The def stays in the catalog (tests and the old
  gauntlet reference it); it simply stops being drawn.
- **Veterancy starts earlier and climbs steadier:**

| Columns (within act) | Old | New |
|---|---|---|
| 0–1 | 0 | 0 |
| 2–4 | 0 / 0 / +1 | **+1** |
| 5–7 | +1 / +1 / +2 | **+2** |
| 8–9 | +2 | **+3** |

  Rationale: the old table left the entire easy band unscaled; on 1–2 HP
  ships +1 HP is a meaningful (often doubling) buff, so starting at
  column 2 gives the band an internal slope without new content.
- **Hand-tuning preserved:** the column-3 sniper elite was deliberately
  nerfed to +1 total HP; since veterancy now adds +1 at column 3, its
  eliteVariant bonus becomes 0 (total stays +1). The column-5/7 act-1
  elites absorb the extra veterancy as intended — everything past column
  2 is meant to get slightly tougher.
- Tests: pool contents exclude `scout-pack`; the new veterancy
  boundaries (1→0, 2→+1, 4→+1, 5→+2, 7→+2, 8→+3); col-3 elite total
  unchanged at +1.

Lands with **I8-M2** (or as a follow-up patch if M2 is already closed).
