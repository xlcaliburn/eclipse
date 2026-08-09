# Iteration 51 — Commander tune-up + withdraw removal (specced 2026-08-08)

> **Status: 51.1, 51.2, and 51.3 all implemented and verified**, in order,
> with `npm run balance:full` run after each per the 51.4 protocol.
> `npx tsc -b --force` clean project-wide, `npx vitest run` green
> (818 → 823 after 51.1, unchanged after 51.2, 808 after 51.3 — 15 WITHDRAW/
> `hasLineOfRetreat` tests deleted with their subject), `npx vite build`
> clean at every checkpoint. No browser/preview passes, per repo CLAUDE.md.
> See status notes at the end of this file for the full measurement table,
> deviations, and surprises — most notably that withdraw removal barely
> moved the numbers at all (contrary to the spec's own prediction), and
> that Admiral's c7 death spike got WORSE even as his act-1 clear improved.

## Motivation (user direction, 2026-08-08)

With `scripts/` finally fixed (see the Foundry-removal commit d45d9ff),
the per-commander balance numbers ran for the first time in a while:
act-1 clear 7.2%–12.6% (target band 20–40%), act-2 conditional 0%
everywhere. Death-column analysis (see chat, recorded below) plus the
user's own play impressions drove three decisions, made explicitly:

1. **Spymaster gets "Forewarned"** — his intel kit converts into a real
   combat stat for the first time. ("i like forewarned - nice and simple
   improvement.")
2. **Admiral gets a second free starting Interceptor** — the simplest
   possible buff to the worst-measuring commander (7.2%); explicitly an
   experiment: "let's just give him another interceptor to start and see
   how that changes the numbers."
3. **Withdraw/retreat is removed from the game entirely** — "'retreating'
   is rarely going to be an option that the player will pick. in fact i
   rather just remove it altogether." (This supersedes the chat-proposed
   "Spymaster always has a line of retreat" buff, which is dead on
   arrival without a retreat mechanic — Forewarned replaces it as his
   buff.)

### The death-column findings this responds to (baseline data, n=500/commander, 2026-08-08)

- **Act-1 columns 5–7 are ~half of ALL deaths** for every commander — the
  known mid-act cliff (iteration 46's Sniper-pair work).
- **~40–50% of act-2 entrants die at global column 11 — the FIRST act-2
  node** — despite entering fully healed from the boss win (baseline: 28
  of ~62 act-2 entrants; engineer 32 of ~63; warlord 26; spymaster 26).
  The act-2 entry step (new pools + counter-protocol + act-2 escalations
  at once) walls fleets that just proved good enough to clear act 1. The
  Merchant is the instructive exception (c11=3, spikes at c13/c15
  instead): his shop-first routing just defers the same wall.
- **No run has ever reached the final boss.** The act-2 boss is global
  column 23; across 3,000 runs there are zero c23 deaths — the 0% act-2
  conditional is the 12-column gauntlet (front-loaded at entry), not the
  boss fight itself.
- **NOT in scope this iteration**: tuning the act-2 entry ramp itself.
  Flagged as the highest-leverage single follow-up target on the curve —
  needs its own pass with the user's direction.

## 51.1 Spymaster: "Forewarned"

**Rule**: the Spymaster's fleet gains **+1 computer during the opening
exchange** — the missile phase (round 0) and cannon round 1. He studied
the enemy before contact; the edge fades once the shooting starts in
earnest.

**Why this shape**: it converts the info doctrine into faster early
kills (enemies that die sooner shoot less — an attrition answer, which
is the diagnosed run-killer), it's visible to the sim (a stats-level
effect that AUTO_RESOLVE exercises, unlike his iteration-48 command-
point kit, which the floor agent never uses by design), and it needs no
new machinery — it's the Alpha-doctrine pattern exactly (a per-round
derived modifier, not an armed-actives bag entry).

**Implementation**:

- `combatEngine.ts`: `CombatOrderOptions` (the iteration-48 commander-
  doctrine options bag on `initCombat`) gains
  `openingComputerBonus?: number` (default 0). `CombatState` stores it.
  `advanceRound` folds it into the player-side attacker computer for
  rounds 0 and 1 only — derive it into the local `roundModifiers` spread
  the same way `playerBaseShieldZeroed` is derived per-round from
  `alphaDoctrineActive` (NOT added to the armed-actives reset bag). It
  must compose additively with `computerBonus` from uplink2/orders.
- `reducer.ts` ENGAGE: pass `openingComputerBonus:
  state.commanderId === 'spymaster' ? SPYMASTER_FOREWARNED_COMPUTER : 0`
  (new named constant = 1, beside BASE_COMMAND_POINTS with the same
  export-for-UI reasoning if any UI wants it).
- `commanders.ts` Spymaster bullets: add
  `'Forewarned: +1 computer for the whole fleet during the missile phase
  and the first cannon round'`.
- Persistence: `CombatState` gains one always-read numeric field — old
  mid-fight saves would read `undefined`. Read it with `?? 0` at the ONE
  place it's consumed (the advanceRound derivation) rather than bumping
  SAVE_VERSION — unlike iteration 48's bracingShipIndices (`.includes()`
  on undefined throws, multiple read sites), an `undefined ?? 0` numeric
  add is a genuine one-line safe fallback. Note it in the v7 comment's
  style if the implementer disagrees and prefers v8 — either is
  defensible; the fallback is the default.
- Tests (`combatEngine.test.ts` + `reducer.test.ts`): bonus applies in
  round 0 and round 1 rolls (read the logged `computer` on enemy-side...
  no — on PLAYER-side roll events), gone by round 2; composes with
  uplink2 (+2 → total +3 in round 1); non-Spymaster ENGAGE passes 0;
  Spymaster ENGAGE passes 1.

## 51.2 Admiral: a second free starting Interceptor

**Rule**: the Admiral starts with **two** free, ion-fitted Interceptors
(fleet begins at 3 ships: Flagship + 2). Everything else unchanged.

**Why**: the simplest lever on the worst number on the board (7.2%
act-1, worst of five), directly on-doctrine ("starts wide"), and
explicitly an experiment — measure and see (51.4).

**Implementation**:

- `reducer.ts` CHOOSE_COMMANDER, the admiral branch: push two
  interceptors instead of one. Names: `shipName(seed, commissioned,
  'interceptor')` and `shipName(seed, commissioned + 1, 'interceptor')`;
  `shipsCommissioned` advances by 2 (was 1). Keep the existing "the
  fleet begins at N ships" comment accurate.
- `commanders.ts` Admiral bullets: `'Starts with a free, ion-fitted
  Interceptor — the fleet begins at 2 ships'` → `'Starts with two free,
  ion-fitted Interceptors — the fleet begins at 3 ships'`. Description
  prose: keep, it already says "starts wide with an extra hull" — update
  "an extra hull" to "extra hulls".
- Tests: update the existing CHOOSE_COMMANDER admiral case (fleet length
  2 → 3, shipsCommissioned assertion) and any test constructing an
  admiral start by hand.

## 51.3 Remove withdraw/retreat entirely

**Rule**: combat, once entered, resolves to a winner. No mid-fight exit.

**Design consequences, stated plainly (decided with eyes open)**:

- Every fight is now all-or-nothing; the 30-round stalemate rule (enemy
  wins) remains the only non-victory exit, and it's a loss.
- The sim agent currently uses withdraw as its bail-out valve
  (`withdrawHpRatio` policy) — removing it is expected to LOWER measured
  clear rates somewhat, independent of 51.1/51.2's buffs. This is why
  51.4 measures the changes separately; do not misread the combined
  number.
- Event-ambush win-conditional bonuses (`pendingAmbushBonus`, the
  debt/colony `chainEffect`s) lose their forfeit-on-withdraw path — the
  only outcomes left are win (pays/applies) and loss (run over). Their
  resolver comments about withdrawal become dead text; update them.

**Removal checklist** (verify each by grep at implementation time — this
list is from a spec-time survey, the tree may have moved):

- `reducer.ts`: the `WITHDRAW` action variant + case; `hasLineOfRetreat`
  (exported — check every consumer); `revertedPosition` (only feeds
  withdraw's position revert — but CHECK: it may also feed
  `hasLineOfRetreat`'s own candidate set only); `mergeRunStats`'s
  `withdrew` option; the `POST-WITHDRAW` half of `applyPostFightHeal`'s
  regen-on-any-survived-fight comment (regen's win-path behavior is
  unchanged; the "any survived fight" framing collapses back to
  win-only — keep the heal call in CONTINUE, delete the WITHDRAW call
  site with the case).
- **KEEP `RunState.fled`** — warp-lane shortcuts (iteration 32) mark
  skipped columns as fled in PICK_NODE; that use is independent of
  withdraw. Only the withdraw-writes to `fled` go away. Update `fled`'s
  doc comment to say shortcuts are now its only writer.
- `combatEngine.ts`: `shipEndState` STAYS (combatOutcome uses it);
  nothing else engine-side — withdraw was purely a reducer concept.
- `types.ts`: `RunStats.fightsWithdrawn` — remove the field, its
  `emptyRunStats` init (daily.ts), and any display (check EndScreen /
  share text / wiki). Old saves carrying the key are harmless extra
  data; no SAVE_VERSION bump for a removed field.
- UI: CombatScreen's Withdraw button, `withdrawEnabled`, the
  `canWithdraw` prop from App.tsx, the "No line of retreat here" hint;
  check PrepScreen/tutorial/onboarding copy for retreat mentions
  (iteration 45's polish batch already removed the prep-screen "Line of
  retreat" line — verify nothing else remains); wiki mentions.
- `scripts/sim`: `policy.ts` `withdrawHpRatio` field + every archetype's
  value; `agent.ts`'s withdraw block in `runCombat`, the
  `fightsWithdrawn` field on `AgentRunOutcome` and its printout in
  `runSim.ts`; `HANDLED_ACTIONS` loses its WITHDRAW row (the compile
  error when the variant disappears is the guard working — fix by
  deleting the row).
- Events (`events.ts`): comments describing withdraw-forfeit semantics
  on defector-pursuit / debt-collectors / colony-raiders (behavior
  unreachable now; the chainEffect win-gating itself is unchanged).
- Tests: every WITHDRAW/`hasLineOfRetreat` test deleted (the
  "never delete tests" rule guards live expectations, not tests whose
  subject is removed — same reasoning as 47.2's resolver deletion);
  agent liveness tests updated if they assert withdraw behavior. Record
  the test-count change.

## 51.4 Measurement protocol (the point of the exercise)

Run `npm run balance:full` after EACH numbered milestone lands, in
order (51.1 → 51.2 → 51.3), and record per-commander act-1 clear /
act-2 conditional / full-run, plus the global-column death spikes
(c5-c7, c11), in this file's status notes:

1. Baseline: already recorded 2026-08-08 (above / in chat) at d45d9ff.
2. After 51.1: expect Spymaster act-1 up from 9.0% (how much is the
   question); others unchanged within noise.
3. After 51.2: expect Admiral up from 7.2%; note whether his c7 elite
   death spike (161 deaths — his elite route bias) moves.
4. After 51.3: expect a broad DOWN-shift (the agent lost its bail-out
   valve) — record it honestly as the cost of the simplification, not a
   regression to hunt. `npm run balance` (the matchup table) should be
   IDENTICAL throughout — nothing here touches per-fight stats except
   Forewarned, which... DOES affect fights. Correction: after 51.1 the
   matchup table is unchanged (it simulates fixture fleets without a
   commander), but re-run it once at the end to confirm no accidental
   engine-level drift for commander-less fights (openingComputerBonus
   defaults to 0 — assert that in a test too).

Also run the standard bar per milestone: `tsc -b --force` clean
(project-wide — scripts/ is fixed now, no exclusions), `vitest run`
green (report count), `vite build` clean. No browser passes.

## Out of scope / follow-ups

- The act-2 entry wall (c11) — the single highest-leverage tuning target
  found by the death-column analysis; needs its own directed pass.
- Any further Spymaster/Admiral iteration beyond these two changes —
  measure first (51.4), then decide.
- The chat-proposed "always has a line of retreat" Spymaster buff —
  dead with 51.3, superseded by Forewarned.

## Status notes (2026-08-08, implementer)

### What landed

**51.1 (Forewarned)** — `combatEngine.ts`'s `CombatOrderOptions` gained
`openingComputerBonus?: number`; `CombatState` gained the always-read
`openingComputerBonus: number` field (default 0, no `SAVE_VERSION` bump —
the spec's default fallback approach, per its own note the implementer
could choose v8 instead but didn't need to). `advanceRound` derives it
into the local `roundModifiers.computerBonus` for rounds 0/1 only,
additive on top of whatever `state.roundModifiers.computerBonus` already
carries from uplink2/orders, mirroring `playerBaseShieldZeroed`'s
per-round derivation from `alphaDoctrineActive` exactly as directed.
`reducer.ts` gained `SPYMASTER_FOREWARNED_COMPUTER = 1` beside
`BASE_COMMAND_POINTS`, wired into ENGAGE's `orderOptions` bag. Spymaster
bullet added to `commanders.ts`. 5 tests added: bonus present in rounds
0/1 and gone by round 2 (`combatEngine.test.ts`), composes with uplink2
to +3 total, defaults to 0 with no `orderOptions` at all (the
commander-less-fight-unchanged assertion the spec asked for); ENGAGE
wires 1 for Spymaster / 0 for the other four commanders
(`reducer.test.ts`).

**51.2 (Admiral's second Interceptor)** — `reducer.ts`'s `CHOOSE_COMMANDER`
admiral branch now pushes two interceptors (`shipName(seed, commissioned,
'interceptor')` and `shipName(seed, commissioned + 1, 'interceptor')`),
`shipsCommissioned` advances by 2. `commanders.ts` bullet/description
updated ("two free, ion-fitted Interceptors — the fleet begins at 3
ships"; "extra hull" → "extra hulls"). Updated the 2 existing reducer
tests that hard-coded fleet length 2 / a single named interceptor /
`shipsCommissioned` +1 for the Admiral. No new tests — existing coverage
just widened to check both ships.

**51.3 (withdraw/retreat removed)** — the full checklist, verified by
grep as directed:
- `reducer.ts`: `WITHDRAW` action variant + case deleted; `hasLineOfRetreat`
  and `revertedPosition` deleted (both were single-purpose, only ever
  feeding the WITHDRAW case — `revertedPosition` was NOT shared with
  anything else, confirming the spec's "CHECK" note); the now-orphaned
  `samePosition` helper (only caller was `hasLineOfRetreat`) deleted too;
  `mergeRunStats`'s `withdrew` option removed; `settleFleetAfterFight`'s
  and `applyPostFightHeal`'s doc comments rewritten to describe CONTINUE
  as the sole remaining caller (signatures left alone — the spec allowed
  simplifying them but flagged it as optional, and the two-line comment
  fix carried zero behavior risk where a signature change would not have
  been risk-free for no real gain, given only one caller was ever going to
  use it). Every other WITHDRAW-referencing comment across the file (13+
  sites: the flagship-recovery gate's "four call sites" → three, the
  ghost-fleet-protocol "withdraws instead" language → "survives instead",
  the shortcut-fled comment, the lone-flagship mercenary-filter comment,
  BUY_MERCENARY's doc comment) rewritten to match.
- `RunState.fled` **kept**, doc comment rewritten to state shortcuts are
  its sole writer now.
- `combatEngine.ts`: `shipEndState` kept (as directed — `combatOutcome`
  uses it internally); its own doc comment, which explicitly named the
  now-deleted reducer WITHDRAW case as a second caller, rewritten to say
  so was true pre-51.3 and it's internal-only again now. Left `export`ed
  rather than churning the module's public surface for a caller that's
  now purely internal.
- `types.ts`: `RunStats.fightsWithdrawn` field removed; `daily.ts`'s
  `emptyRunStats()` and `dailyShareText()` (dropped the "↩️ N withdrawn"
  segment from the share-text line) updated, `daily.test.ts` updated to
  match; `EndScreen.tsx`'s conditional "Withdrawals" stat row removed.
- UI: `CombatScreen.tsx` lost the Withdraw button, `withdrawEnabled`,
  the `canWithdraw`/`onWithdraw` props, and the "No line of retreat here"
  hint paragraph; `App.tsx` lost the `hasLineOfRetreat` import and the
  `canWithdraw`/`onWithdraw` wiring. `styles.css`'s `.withdraw-button`
  rule block (plus its mobile touch-target inclusion) removed as dead
  CSS. `Wiki.tsx`'s phase-order rule line ("...until one side is
  destroyed or the player withdraws") trimmed. Checked PrepScreen/
  onboarding/tutorial copy — nothing else referenced retreat (iteration
  45's prep-screen "Line of retreat" line was already gone, confirmed).
  The map's "(fled)" node label / "Fled — cannot return" title text was
  deliberately left as-is: it's still accurate wording for the
  shortcut-only meaning ("you fled past this node" reads fine for a
  warp-lane skip too), so there was nothing to fix there beyond verifying
  it, which the spec asked for.
- `scripts/sim/policy.ts`: `withdrawHpRatio` field + doc comment removed
  from `PolicyConfig`, and the value deleted from all 6 archetypes.
  `scripts/sim/agent.ts`: the withdraw decision block in `runCombat`
  deleted (along with the now-dead `fractionAlive` helper it was the only
  caller of, and the round-1-first while-loop that existed purely to gate
  the withdraw decision); `AgentRunOutcome.fightsWithdrawn` removed (no
  `runSim.ts` printout referenced it directly — the spec's checklist item
  here turned out to be slightly ahead of the actual tree, verified by
  grep rather than assumed); `HANDLED_ACTIONS`' `WITHDRAW: true` row
  deleted, which is what made the compile error the spec predicted
  actually fire (`hasLineOfRetreat` import removed too). `runCombat`'s
  `config: PolicyConfig` parameter dropped outright (fully unused once
  the withdraw heuristic was gone) rather than left as accepted-but-idle,
  and its one call site in `step` updated to match.
- `events.ts`: the withdraw-forfeit comments on `debt-collectors` and
  `colony-raiders` reworded to describe only the loss case (the
  chainEffect win-gating code itself untouched, per spec). No
  withdraw-specific comment existed on `defector-pursuit` beyond a
  cross-reference to it from an unrelated event — nothing to fix there.
- `upgrades.ts`: Regenerative plating's description ("Repairs 1 damage
  after each fight, win or withdraw" → "...after each fight won") and
  `protocols.ts`'s Ghost fleet protocol blurb ("withdraws instead" →
  "survives instead") updated — both are flavor copy that used "withdraw"
  in a sense unrelated to the removed player action (a ship pulling back
  from destruction), but the word reads as a leftover mechanic now that
  there is none, so both were reworded for clarity, not because either
  was factually wrong.
- Tests: all 15 WITHDRAW/`hasLineOfRetreat`-subject tests deleted from
  `reducer.test.ts` (the Flagship-recovery-via-WITHDRAW case, the
  ambush-bonus-forfeit case, the whole "WITHDRAW — retreat from a losing
  fight" describe block of 7, the vision-high-water-mark case, the
  mercenary-leaves-on-withdraw case, the opener-has-no-retreat case, the
  withdraw-costs-heat and withdraw-resets-interception-heat cases, and
  the colony-raider-ambush-forfeit case), plus one now-dead
  `freshCombat()` test helper whose only callers were among those 15.
  One `fightsWithdrawn` assertion line removed from an otherwise-live
  `fightsWon` test rather than deleting that whole test. Test count:
  823 → 808 (−15, matches the count above exactly).

### Deviations from the spec's exact text

- **`settleFleetAfterFight`/`applyPostFightHeal` signatures**: the spec
  explicitly left simplifying them as the implementer's call ("consider
  whether the function signature can simplify"). Left unchanged — both
  keep taking an options bag that made sense with two callers and reads
  fine with one; collapsing either into CONTINUE's body would touch more
  lines than the comment fix bought back, for a file whose actual bug
  risk (per the "do NOT change behavior" instruction) is entirely on
  CONTINUE's path staying byte-identical.
- **`fightsWithdrawn`'s "runSim.ts printout"**: the spec's checklist
  named a `runSim.ts` printout of this field; grepping the actual tree
  found no such printout (only the `AgentRunOutcome` field itself and its
  one assignment in `agent.ts`). Treated the spec's checklist as a
  spec-time survey (its own framing) rather than ground truth, verified
  by grep as directed, and removed exactly what actually existed.
- **`runCombat`'s `config` parameter**: not explicitly named in the
  spec's checklist, but removing the withdraw decision block left it
  completely unused (`noUnusedParameters` is on project-wide) — dropped
  from the signature rather than prefixing with `_` or leaving a
  placeholder, since nothing else in that function will plausibly need
  policy config now that its one policy-driven decision is gone.

### The measurement table (51.4)

All runs `npm run balance:full` (n=500/commander), act-1 clear rate,
full CI omitted here for brevity (see the raw logs) — every act-2
conditional clear was 0% at every checkpoint including baseline, so
that column is dropped from the table (nothing to compare).

| Checkpoint | auto | merchant | engineer | spymaster | admiral | warlord |
|---|---|---|---|---|---|---|
| Baseline (d45d9ff, recorded earlier) | — | 12.6% | 12.6% | 9.0% | 7.2% | 11.8% |
| After 51.1 (Forewarned) | 12.6% | 12.6% | 12.6% | **9.6%** | 7.2% | 11.8% |
| After 51.2 (2nd Interceptor) | 12.8% | 12.6% | 12.6% | 9.6% | **9.0%** | 11.8% |
| After 51.3 (withdraw removed) | 12.8% | 12.4% | 12.6% | 9.6% | 9.0% | 11.8% |

Death-column detail for the two changed commanders (c5/c6/c7/c11, global
columns):

| Checkpoint | Spymaster c5/c6/c7/c11 | Admiral c5/c6/c7/c11 |
|---|---|---|
| After 51.1 | 61/88/84/27 | 58/90/**161**/16 |
| After 51.2 | 61/88/84/27 | 46/96/**174**/19 |
| After 51.3 | 61/88/84/27 | 46/96/174/19 |

`npm run balance` (the matchup table, fixture fleets, no commander) was
re-run once at the very end: every sanity check landed on the same
PASS/FAIL pattern as the established baseline (the known KNOWN
FAIL/MARGINAL gaps from earlier iterations, unchanged) — no accidental
engine-level drift, confirming `openingComputerBonus`'s `?? 0` default
really does leave commander-less fights untouched (also asserted
directly in `combatEngine.test.ts`).

### Surprises worth flagging

- **Forewarned moved Spymaster, but only barely**: 9.0% → 9.6%, a +0.6pp
  bump that's well inside the measurement noise band ([7.3–12.5%] CI at
  n=500) — real in direction (a stats-level effect the sim actually
  exercises, as designed) but not the kind of number that reads as "the
  fix." Consistent with the spec's own framing ("how much is the
  question") — just noting the answer turned out to be "not much."
- **The second Interceptor moved Admiral more clearly**: 7.2% → 9.0%, a
  +1.8pp bump, the largest single-commander move of the three milestones,
  though the CIs ([5.2–9.8%] vs [6.8–11.8%]) still overlap.
- **Admiral's c7 elite death spike got WORSE, not better**, even as his
  overall act-1 number improved: 161 → 174 deaths at c7 (both post-51.1
  and unchanged through 51.3). Reading the death-column data plainly: a
  bigger opening fleet routes into more elite fights (the Admiral's
  existing `+15` elite route bias in `scripts/sim/policy.ts`'s
  `COMMANDER_ROUTE_BIAS`) and evidently dies to more of them in absolute
  terms even while surviving more OTHER columns net-positive enough to
  lift the aggregate act-1 rate. Flagged, not chased — 51's own scope was
  "give him another interceptor and see," not to also re-tune the elite
  route bias in response.
- **Withdraw removal cost the fleet almost nothing measurable**: every
  commander's act-1 clear rate after 51.3 is within 0.2pp of its 51.2
  value (merchant actually ticked down 0.2pp; everyone else is bit-for-
  bit identical), flatly contradicting the spec's own prediction of "a
  broad DOWN-shift... the agent lost its bail-out valve." The
  death-column breakdowns for Spymaster/Admiral are IDENTICAL
  before/after 51.3, which is the real tell: the floor agent's
  `withdrawHpRatio` heuristic (bail out once badly outmatched at round 1)
  essentially never fired in a way that changed the final outcome for
  these seeds — either the fights it would have triggered on were already
  unwinnable regardless of retreating, or the specific HP-ratio
  thresholds tuned per archetype rarely crossed during these runs. Worth
  taking at face value rather than explaining away: the user's own
  framing going in was "retreating is rarely going to be an option that
  the player will pick" — this suggests the simulated floor agent agreed
  with that read even before the mechanic was removed, for what these
  particular seeds are worth. Recorded honestly per 51.4's own
  instruction, not chased further.
