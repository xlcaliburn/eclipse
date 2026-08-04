# Iteration 24 — Boss closure + the Flagship comes back (specced + implemented 2026-08-04)

Three player-requested fixes, all touching what happens right after a fight
resolves.

## 24.1 Boss fights auto-heal the fleet

Both boss branches of `CONTINUE` (act-1 → interlude, act-2 → victory) now
fully heal every surviving ship (`damage: 0`) before returning — there's no
shop between a boss kill and whatever comes next, so a battered survivor
used to carry that damage somewhere it could never be repaired.

## 24.2 The boss reward is a guaranteed upgrade

The interlude used to be a 3-way choice — Refit (heal) / War chest (+15cr)
/ Field promotion (upgrade) — competing against each other. Now that heal
is automatic (24.1) and credits are already paid via `eliteReward` before
the interlude is even reached, the interlude has one job: attach a
guaranteed random elite-pool upgrade to a ship of the player's choice.
`INTERLUDE_CHOOSE` dropped its `index: 0|1|2` discriminator down to just
`shipIndex`; `InterludeScreen` dropped its option menu down to a ship
picker.

## 24.3 Flagship recovery

The Flagship (`frameId: 'cruiser'`) is the one hull that can never be
rebought. Losing it in a fight the rest of the fleet survives used to just
mean it was gone for the rest of the run. Now `CONTINUE` and `WITHDRAW`
both gate their natural next phase (reward / interlude / victory / map)
behind a one-time salvage offer via `withFlagshipRecoveryGate`:

- New phase `'flagship-recovery'`, new `RunState` fields
  `pendingFlagshipRecovery` (`{ cost, shipName, kills, fightsSurvived }`)
  and `flagshipRecoveryResumePhase`.
- The gate wraps the state each call site had already fully computed —
  fleet, credits, pendingReward, etc. are already correct on `next`; only
  `phase` is swapped to `'flagship-recovery'` and restored by
  `RESOLVE_FLAGSHIP_RECOVERY`. No branch logic duplicated at any of the
  four call sites (act-2 boss win, act-1 boss win, normal win, withdraw).
- Cost is `getFrame('cruiser').cost` (14cr) — reuses the frame's existing
  (never-purchasable-until-now) price tag rather than inventing a new
  number.
- Recovering rebuilds the hull with an empty loadout (equipped/upgrades
  lost, same as any other destroyed ship) but keeps the same name, kills,
  and fights-survived — it's the same ship, recovered, not a replacement.
  Declining costs nothing; the fleet carries on without her, same as
  before this iteration existed.

## Touched files

- `types.ts` — `Phase` +`'flagship-recovery'`; `RunState` +2 fields.
- `reducer.ts` — `withFlagshipRecoveryGate` helper; boss-branch auto-heal;
  gate wrapped around all 4 post-combat return points; `INTERLUDE_CHOOSE`
  simplified; new `RESOLVE_FLAGSHIP_RECOVERY` case.
- `persistence.ts` — `isValidRunState` case for `'flagship-recovery'`.
- `InterludeScreen.tsx` — rewritten (3-way choice → ship picker).
- `FlagshipRecoveryScreen.tsx` — new.
- `App.tsx` — updated `InterludeScreen` wiring, new screen wired in.
- `styles.css` — `.flagship-recovery-screen` (mirrors `.interlude-screen`).
- `reducer.test.ts` — interlude describe block rewritten; 2 new boss
  auto-heal tests; new `describe('flagship recovery (iteration 24)', …)`
  block (7 tests: CONTINUE gates it, a surviving Flagship doesn't trigger
  it, WITHDRAW gates it too, recover succeeds/deducts credits, recover
  refuses when unaffordable, decline resumes free, refuses outside the
  phase).

## Verification

`tsc -b`, `npm test` (496/496), `vite build` all clean. Live browser pass:
flagship-recovery screen renders and correctly disables "Recover" when
unaffordable; declining resumes to the reward screen exactly as the fight
would have resolved without the gate; recovering deducts credits and
restores the Flagship (fresh loadout, same name) at fleet index 0; a
damaged boss-fight fleet reaches the interlude fully healed; the
simplified interlude screen attaches the upgrade and transitions to act 2.
