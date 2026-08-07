# Iteration 30 — Counter-protocols: the enemy answers the draft (specced 2026-08-06)

> **Status: specced, not implemented.**

User direction: "for act 2, now that we added in these buffs to the
player, we need to also buff the enemies. we should create buffs
corresponding to the player, eg a prismatic buff to the player should
give some variation of a prismatic buff to the enemy too."

Iteration 28's protocol draft pours player power into act 2 with nothing
pushing back — act 2 had difficulty headroom, but a prismatic pick plus a
gold-free act is more headroom than intended, and more importantly the
draft currently has no *tension*: prismatic is strictly the biggest
number. This iteration makes the draft tier a real decision: **whatever
tier the player drafts, the enemy fleet gains a same-tier
"counter-protocol" for all of act 2** — a smaller, tier-matched answer,
visible on the draft card *before* the pick (transparency law: the
player weighs "big buff + big enemy answer" against "small buff + small
enemy answer" with full information, never surprised after the fact).

## Design principles

- **Tier-paired, not effect-mirrored.** A prismatic pick triggers a
  prismatic-tier enemy counter — but the counter is its own effect drawn
  from an enemy-side pool, not a literal mirror of the player's protocol
  (most player protocols — shop discounts, fleet caps — have no sensible
  enemy mirror anyway).
- **The player still comes out ahead.** The draft is a reward with teeth,
  not a trap: each tier's counter should measure at roughly **half or
  less** of that tier's player-side value. Enforced by measurement, not
  vibes — see Verification.
- **Zero engine changes.** Every counter below is pure stat data on
  `ShipStats` fields the combat engine already honors on the enemy side
  (`hp`/`computer`/`shield`/`initiative`, `flak` — symmetric since
  iteration 8's Flak fortress, `reactiveArmor`, per-weapon `shieldPierce`
  and `damage`, extra ships via the squadrons pattern). No
  `combatEngine.ts` edits, no new resolver rules, no new
  `CombatProtocolFlags`. This is deliberate scope discipline: iteration
  28 already spent the engine budget; this iteration is data + plumbing +
  UI.
- **Deterministic and seed-shared.** Counters draw from the run's rng
  stream at the same moment the protocol offers do, so two players on
  one seed see identical offer/counter pairings and diverge only on the
  pick.

## 30.1 The counter pools (`src/game/counterProtocols.ts`, new)

Mirrors `protocols.ts` structurally: `CounterProtocolId` union,
`CounterProtocolDef { id, tier, name, blurb }`, per-tier pools, and a
draw function. Numbers are starting points for the balance pass.

**Silver — one escalation's worth (pool of 3):**
- *Hardened veterans* — every enemy ship +1 HP.
- *Targeting arrays* — every enemy ship +1 computer.
- *Evasive doctrine* — every enemy ship +1 shield (shown as "piloting"
  once iteration 29's rename lands; this spec writes "shield" to match
  today's code).

**Gold — a build-shaped answer (pool of 3):**
- *Flak screens* — every enemy ship gains flak 1 (each cancels one player
  missile die per combat — answers missile builds).
- *Piercing munitions* — every enemy cannon gains shieldPierce 1
  (answers shield/piloting stacking).
- *Overdrive signals* — every enemy ship +2 initiative (threatens enemy
  Outspeed against slow fleets; the existing gap-4 rule already computes
  the enemy side).

**Prismatic — rule-breaker feel, still pure stats (pool of 3):**
- *Ablative plating* — every enemy ship gains reactiveArmor 1 (the first
  hit it takes each combat is negated outright).
- *Attack wings* — **every** group gains +1 ship; a solo enemy gains a
  wingman instead (reuse `applyEscalations`' squadrons logic including
  its `isFormationCenterpiece` guard so a solo boss is never doubled —
  the wingman rule and centerpiece guard are already written, in
  `enemies.ts`).
- *Overcharged munitions* — every enemy cannon die deals +1 damage.

## 30.2 Draw, pick, persist

- `drawCounterProtocols(rng)` returns `[oneSilver, oneGold, onePrismatic]`
  — index-paired with the protocol offers (offer `i` ⇄ counter `i`).
  Called in `CONTINUE`'s act-1-boss branch immediately after
  `drawProtocolOffers`, same 9.1 reload-can't-reroll discipline, stored
  as `RunState.protocolCounterOffers?: CounterProtocolId[]`.
- `PROTOCOL_CHOOSE` additionally records
  `counterProtocol?: CounterProtocolId` from the same index, and clears
  `protocolCounterOffers`.
- Persistence: both fields optional-additive (iteration 21 precedent, no
  SAVE_VERSION bump). `isValidRunState`'s `'protocol-draft'` case keeps
  requiring the 3 protocol offers but treats missing counter offers as
  legal — a mid-draft save from the current shipped version predates
  counters and should load, not blank; `PROTOCOL_CHOOSE` handles the
  absent-counters case by simply recording no counter (the legacy run
  finishes as drafted).

## 30.3 Application (act 2 only)

New `applyCounterProtocol(enemy, counterId)` in `enemies.ts`, built the
same way as `applyEscalations` (clone groups, mutate stats, badge what
changed): stat bumps per the table above; *Piercing munitions* /
*Overcharged munitions* map over each group's `cannons` entries; *Attack
wings* reuses the squadrons/wingman code path. Sets a new
`EnemyDef.appliedCounter?: CounterProtocolId` field for the UI.

Called from every act-2 enemy construction site in `PICK_NODE` (the
combat / elite / boss branches, plus the heat-4 interception and any
event-ambush path that can fire in act 2), gated on
`state.act === 2 && state.counterProtocol`, applied AFTER veterancy and
escalations (order documented: counters are the outermost layer, so
their badge always reflects what they actually added on top). The act-2
final boss is included — same uniformity rule as escalations, checked by
the balance pass below rather than exempted by fiat; if measurement
shows a prismatic counter pushing a final boss out of band, the
implementer notes the number and we decide then, rather than silently
exempting it now.

## 30.4 UI

- **Draft card** (`ProtocolDraftScreen.tsx`): each card gains an "enemy
  answer" line under the cost line, danger-colored, e.g. "The enemy
  adapts: Flak screens — every enemy ship gains flak." The prismatic
  card now shows BOTH its own cost and its counter — that's the point.
- **Enemy panel** (`EnemyPanel.tsx`): the existing escalation/veterancy
  badge row gains the counter ("Their answer to your protocol: …") keyed
  off `appliedCounter` — same only-if-it-changed honesty rule.
- **Settings** (`SettingsScreen.tsx`): the `ProtocolRow` readout shows
  the counter beneath the held protocol, so mid-act-2 the player can
  re-check what the enemy has without entering a fight.

## Verification

- Unit tests: draw determinism + 1/1/1 tier composition
  (`counterProtocols.test.ts`, mirroring `protocols.test.ts`);
  `applyCounterProtocol` per-counter stat assertions including the
  solo-wingman and centerpiece-guard cases; reducer tests for
  draw-at-CONTINUE, pick-records-counter, act-2-only application, and
  the legacy no-counter-offers save path; persistence round-trip.
- **Balance gate (the "half or less" principle made measurable):** a
  small script pass — extend `scripts/balance.ts` or add a sibling —
  measuring, for a representative act-2 pool enemy and one final boss,
  the strong-fleet win-rate delta from each counter alone. Starting
  bands: silver ≤ ~8pp drop, gold ≤ ~15pp, prismatic ≤ ~25pp, all > 0pp
  (a counter that measures 0 is dead weight; one past its band gets its
  number tuned down before shipping). Record the measured table in this
  file's status notes, per house convention.
- Standard bar: `tsc -b --force`, `npx vitest run`, `npx vite build`,
  plus a live browser pass via a hand-edited save (the established
  technique): draft screen shows counter lines on all three cards; an
  act-2 fight's enemy panel badges the counter; an act-1 replay confirms
  counters never fire in act 1; Settings shows protocol + counter.

## Files touched (anticipated)

- `src/game/counterProtocols.ts` + `counterProtocols.test.ts` — new.
- `src/game/types.ts` — `RunState.protocolCounterOffers`/`counterProtocol`;
  `EnemyDef.appliedCounter`.
- `src/game/enemies.ts` — `applyCounterProtocol`.
- `src/game/reducer.ts` — draw in CONTINUE's boss branch; PROTOCOL_CHOOSE
  records the pairing; act-2 application at every PICK_NODE enemy site.
- `src/game/persistence.ts`(+test), `src/game/reducer.test.ts` — as above.
- `src/components/ProtocolDraftScreen.tsx`, `EnemyPanel.tsx`,
  `SettingsScreen.tsx`, `src/styles.css` — the three UI surfaces.

## Milestones

- **30-M1** — data + plumbing: `counterProtocols.ts`, RunState fields,
  draw/pick/persist, `applyCounterProtocol` + act-2 application, unit
  tests.
- **30-M2** — UI: draft-card enemy-answer line, enemy-panel badge,
  Settings readout.
- **30-M3** — balance measurement against the per-tier bands (tune any
  counter that lands outside), browser pass, status notes here and in
  `PLAN.md`.
