## Iteration 11 (planned — after iteration 10)

**Tempo & teeth.** Three playtest findings from the live iteration-8/10
build, and one shared root cause:

1. The act-1 → act-2 transition should always heal the fleet — Refit was
   the obvious interlude pick, which means it was never a choice.
2. The back half of act 1 is too easy, and act 2 must get meaningfully
   harder — especially now that the act transition heals for free.
3. Initiative feels useless: fights average 4+ rounds, and turn order only
   matters in round 1 and against missile alphas.

Findings 2 and 3 are causally linked: HP-heavy scaling (veterancy, elite
bonuses, tanky act-2 rosters) is *why* fights run long, and long fights
are why initiative's round-1 edge evaporates. So this iteration's tuning
principle, everywhere: **buff damage and computers, never HP.** Shorter,
deadlier fights fix difficulty and tempo at once.

Because eyeballed numbers have missed repeatedly and browser passes are
not performed in this repo, this iteration **partially re-arms the balance
script as a tuning tool** (still not a merge gate — see 11.4).

### 11.1 Interlude rework: healing is automatic

Winning the act-1 boss now **fully repairs every ship, automatically**,
before the interlude screen ("the yards at the sector border refit the
fleet"). The interlude stays a pick-exactly-one of three, with Refit's
slot replaced so the trio reads money / power / knowledge:

| Option | Effect |
|---|---|
| War chest | +15 credits |
| Field promotion | 1 random upgrade from the elite pool, attached to a ship of your choice (one-per-ship cap and replace rule per iteration 8 A.4) |
| Deep-space charts | +4 intel, and reveal the node types of act 2's columns 0–2 |

The interlude screen shows a "fleet repaired" summary line (damage healed,
per the repair-yard screen's existing pattern) above the choice.

### 11.2 Initiative rework: evasion — SUPERSEDED, never implemented

> **Note (2026-07-27):** this section was never built (the rest of
> iteration 11's items landed piecemeal). The initiative problem it
> targeted is solved differently by **iteration 17's Outspeed rule**
> (extra activations for a large initiative gap) — do not implement
> evasion; initiative should be one strong idea, not two stacked ones.

New combat rule, one sentence: **a defender that is strictly faster than
its attacker gains +1 effective shield against that attack** ("evasion").

- Applies to both sides, every phase, every round. In the missile phase
  the attacker's initiative is the launching ship's initiative as normal.
- Stacks with real shields (and `capacitor`, `modulator`, escalation
  shields) in the existing hit formula; natural 6 still always hits and
  natural 1 still always misses, so nothing is ever immune.
- Binary, not per-point: faster-by-3 is the same as faster-by-1. This is
  deliberate — per-point evasion stacks into unhittability and recreates
  the shield dead-zone illegibility that 4.4 existed to fix.
- Ties = no evasion (equal speed is a fair fight; also preserves "player
  wins initiative ties" as a pure ordering rule).
- Initiative keeps its existing ordering role unchanged.

Consequences, all intended:

- Drive parts and the `drives` upgrade become dual-purpose (tempo +
  defense), giving initiative value in round 6 as much as round 1.
- Interceptors (init 2) are naturally slippery, stacking with Jink — the
  frame's dodge identity, completed.
- Fast enemies (act-2 raiders init 3, Hive ships init 3–4) are evasive
  against an init-0 Flagship **unless the player buys drives to match** —
  a counter-build axis no purchase currently serves.
- `injector`'s +99-init round now also grants fleet-wide evasion for that
  round — a real buff to an underwhelming active; keep it.
- Slow fortress enemies (init 0) get easier to hit, offsetting their HP —
  consistent with "damage over HP" fight pacing.

**Legibility (required, not optional):** the hit-roll log line shows
evasion explicitly ("+1 shield — target is faster"); the enemy panel marks
any enemy group faster than the player's fastest *weapon-carrying* ship
("Evasive vs your fleet — needs drives or computer"); the 4.4
required-computer readout adds +1 to its requirement when that marker is
active. The forecast needs no work — it runs the real resolver.

### 11.3 Difficulty pass (act-1 back half, all of act 2)

Structural changes first, then tune to the bands in 11.4:

- **Veterancy gains a computer axis** (per A.6's own forward note), and
  act 2 gets its own stronger table (replacing "same table on top of
  harder pools"):

| Cols (within act) | Act 1 | Act 2 |
|---|---|---|
| 0–1 | — | +1 HP |
| 2–4 | +1 HP | +2 HP, +1 computer |
| 5–7 | +2 HP | +2 HP, +1 computer |
| 8–9 | +2 HP, **+1 computer** | +3 HP, **+2 computer** |

  (Act-1 cols 8–9 trade the old +3 HP for +2 HP +1 comp; act 2 leans
  computer-heavy on purpose — computers threaten through shields and
  shorten fights, HP just lengthens them. Veterancy still never touches
  the opener or bosses; the enemy-panel badge now lists both bonuses.)
- **Act-2 escalations land earlier**: after act-2 columns 1 and 4 (was 3
  and 6), so the sector feels hostile from the start. Act-1 escalation
  columns unchanged.
- **Act-2 roster damage pass** (starting points; tune via script): torpedo
  boats' ion → ion(2dmg); rift cult init 2 → 3; guardian pair gains
  1×ion(2dmg) each; swarm armada missile → missile(2dmg). Final-boss trio
  untouched until the script says otherwise — they were tuned as walls
  and the free act-transition heal already softens the approach to them,
  not their own stats.
- The free interlude heal is itself a difficulty change (act 2 always
  opens fresh): the bands below already assume it.

### 11.4 Balance script, re-armed as a tool

`scripts/balance.ts` gets refreshed (still NOT a merge gate — it's the
tuning instrument for this iteration, and the standing suspension note in
PLAN.md gains a pointer here):

- **Reference fleets** (rebuild from what a competent run actually holds):
  `act1-mid` (~col 5: flagship 6 parts + 1 escort), `act1-exit` (boss-
  ready: full flagship, 2 escorts, 1 upgrade), `act2-mid` (~col 5 of act
  2: 3–4 ships incl. a Bastion or Cruiser, 2 upgrades, some exotics),
  `act2-exit` (final-boss-ready: 4 ships, expansion bay, lances/antimatter
  present).
- **Tables**: per-enemy win rates per fleet, with veterancy applied at a
  representative column, for both acts; plus the three final bosses and
  three act-1 bosses; plus average combat length in rounds.
- **Target bands** (tune enemies until these hold; prefer damage/computer
  knobs, never HP, and re-run after 11.2 since evasion shifts everything):
  1. act1-mid vs act-1 mid pool: **45–65%**
  2. act1-exit vs act-1 hard pool (col-8 veterancy): **50–70%**
  3. act1-exit vs act-1 bosses: **40–65%**
  4. act2-mid vs act-2 mid pool: **40–60%**
  5. act2-exit vs act-2 hard pool (col-8 veterancy): **40–60%**
  6. act2-exit vs final bosses: **25–50%**
  7. **Average fight length ≤ 4 cannon rounds** for every non-boss
     matchup above — the tempo target that makes initiative matter.
- Record before/after numbers in this file per the old M5 tradition.

### 11.5 Tests

- Interlude: act-1 boss win heals every ship to full before the choice;
  each of the three options applies exactly once; charts reveal act-2
  cols 0–2 and pay +4 intel.
- Evasion: strictly-faster defender gains exactly +1 effective shield;
  ties and slower defenders gain nothing; both sides benefit; missile
  phase uses the launcher's initiative; natural 6/1 unchanged; stacks
  with real shield; `injector` round grants it fleet-wide; log line
  present.
- Veterancy: both acts' tables (HP and computer axes) at each boundary
  column; badge data includes both bonuses; opener/bosses still exempt.
- Escalations: act-2 schedule lands after act-2 cols 1 and 4.
- Readout: required-computer adds +1 when the enemy is faster than the
  fleet's fastest weapon-carrying ship.
- Balance script: compiles, runs, prints all reference fleets and the
  rounds-length column (bands are human-checked, not asserted in tests).

### 11.6 Milestones

- **I11-M1 — interlude + script:** auto-heal, the new option trio,
  refreshed balance script with reference fleets and length column. Tests
  green.
- **I11-M2 — evasion:** the resolver rule, log line, enemy-panel marker,
  readout integration. Tests green.
- **I11-M3 — the tuning pass:** veterancy v3, act-2 escalation timing,
  roster damage pass, then iterate against the 11.4 bands and record
  before/after tables here. Tests green; `npm run balance` output pasted
  into this file.

**Definition of done:** the act transition is a breath, not a decision
about breathing; every band in 11.4 holds and no non-boss fight averages
over 4 cannon rounds; a drive part is a defensible answer to a fast enemy
and the enemy panel says so; and a player who ignored initiative all
campaign gets visibly punished for it in act 2 — and can see why in the
log.

## Status (closed 2026-08-12)

I11-M1 (auto-heal interlude, the option trio, the balance script rearm)
landed, along with the roster/tuning ground the I8-addendum items
already covered. I11-M2 (the evasion resolver rule) was never built as
specced — iteration 17's Outspeed mechanic (a ≥4 initiative gap grants a
bonus cannon activation) replaced it outright as the answer to "initiative
feels useless," a different mechanism aimed at the same problem. I11-M3's
tuning-pass goal is picked back up by iteration 55 (flatten the
difficulty curve against the wealth curve), which supersedes the specific
bands proposed here. Closed as a loose end rather than carried forward —
nothing here is still open work.
