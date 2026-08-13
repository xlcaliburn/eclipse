// Iteration 50.2 — the reward-tier guardrail's taxonomy and manifest.
//
// Kept out of rewardTiers.test.ts so game code and any future UI/wiki
// surface can import the same vocabulary without pulling in Vitest. The
// manifest below classifies every single-node credit-reward source in the
// game (per the 50.1 audit in plans/iteration-50.md) into a tier; it does
// NOT carry hand-copied payout numbers — a `measure` discriminator instead
// tells rewardTiers.test.ts how to obtain the LIVE value by exercising the
// real code. That's deliberate: a hand-copied number can drift from the
// code exactly the way the code drifted from design intent in the first
// place (distress-beacon's original 6cr ambush bonus — see 50.0). Drift is
// then impossible by construction: retune a payout in events.ts/reducer.ts
// and the guardrail re-measures it automatically.
//
// Layering: this file imports ONLY the two exported bonus constants from
// reducer.ts (for the 'combat-bonus' measure's closures) — never
// resolveEventChoice/applyCargoReward from events.ts/reducer.ts. Those two
// measure kinds ('event', 'cargo') carry data only (an id/tag); the actual
// call happens in rewardTiers.test.ts, which already needs to import
// resolveEventChoice/applyCargoReward for its own fixedRng-driven
// measurement anyway. This keeps neither events.ts nor reducer.ts ever
// needing to import this file (checked — no import cycle either way).
import { COMMAND_CARGO_BONUS, ELITE_KILL_BONUS } from './reducer';
import type { CargoTag } from './map';
import type { EventId } from './events';

export type RewardTier = 'flat' | 'low-risk' | 'high-risk';

// Bonus OVER the column's own baseline (winReward for a normal fight, with
// eliteReward's premium measured as its own delta over winReward, pinned
// separately by rewardTiers.test.ts's baseline-curve-shape group) —
// relative bands, so they need no re-deriving if winReward's formula
// changes later.
export const TIER_BONUS_BAND: Record<Exclude<RewardTier, 'flat'>, { min: number; max: number }> = {
  'low-risk': { min: 0, max: 4 }, // EASY_POOL ambushes, convoy-class cargo
  'high-risk': { min: 4, max: 8 }, // HARD_POOL ambushes, elite, command cargo
};
export const FLAT_REWARD_BAND = { min: 1, max: 6 }; // no-fight event payouts

// A source that ALSO grants a part must sit in the LOWER HALF of its tier's
// credit band — the part is real value the credit bands can't see
// (distress-beacon's original mispricing was exactly this: +6cr AND a
// part). Lower half = min..(min+max)/2 inclusive. Verified against current
// data before adopting: distress-beacon +2 of [0,4] ✓, elite kill bonus +4
// of [4,8] ✓ — the rule is already true everywhere, so it's a pure
// guardrail (rewardTiers.test.ts's group 2), not a forced retune.

export type RewardMeasure =
  // Resolve the event choice for real (fixedRng-style inputs, same pattern
  // events.test.ts's own helpers use) and read ambushBonus.credits ?? the
  // credit delta off the returned state.
  | { kind: 'event'; eventId: EventId; choiceIndex: number }
  // applyCargoReward(tag, 0) — command's own +8 is NOT modeled here (it
  // passes through applyCargoReward unchanged; see 'command-cargo' below,
  // a combat-bonus entry instead).
  | { kind: 'cargo'; tag: CargoTag }
  // Reads an exported bonus constant straight off reducer.ts — no
  // hand-copied number to drift.
  | { kind: 'combat-bonus'; value: () => number };

export interface RewardSourceEntry {
  id: string;
  tier: RewardTier;
  grantsPart?: true;
  measure: RewardMeasure;
}

// One entry per single-node reward source from the 50.1 audit table.
// Excluded by that audit (see plans/iteration-50.md for the reasoning in
// each case, not repeated here): wreck cargo (a discount, not a bonus —
// nothing to gate), the 3 chain events (relic/debt/colony's actual
// chain-progression payoffs — an EV over future probabilistic rolls, not a
// flat lookup; their non-chain "walk away" flat payouts below ARE included,
// since those are immediate and deterministic like any other flat event),
// and any payout that reaches credits via a direct `credits:` state-spread
// rather than events.ts's own `pay()` helper or an `ambushBonus.credits`
// literal — those evade rewardTiers.test.ts's source-scrape tripwire by
// design (documented there), so classifying them here would be untestable
// coverage theater. Concretely: militia-requisition's +7cr (exceeds
// FLAT_REWARD_BAND on purpose — it's a part-for-cash trade, not a reward),
// salvage-claim's +8/+12cr (heat-priced, a different currency trade), and
// relic-core/colony-arrival/debt-broker's chain-finale payouts all fall
// here.
export const REWARD_SOURCES: RewardSourceEntry[] = [
  // --- Combat-side sources (reducer.ts's CONTINUE case) -------------------
  { id: 'convoy-cargo', tier: 'low-risk', measure: { kind: 'cargo', tag: 'convoy' } },
  {
    id: 'command-cargo',
    tier: 'high-risk',
    measure: { kind: 'combat-bonus', value: () => COMMAND_CARGO_BONUS },
  },
  {
    id: 'elite-kill-bonus',
    tier: 'high-risk',
    grantsPart: true, // every elite win also drops CAPTURED_SCHEMATIC_PART_ID
    measure: { kind: 'combat-bonus', value: () => ELITE_KILL_BONUS },
  },

  // --- Event ambushes (a win-conditional bonus riding pendingAmbushBonus) -
  { id: 'defector-pursuit-fight', tier: 'high-risk', measure: { kind: 'event', eventId: 'defector-pursuit', choiceIndex: 0 } },
  {
    id: 'distress-beacon-fight',
    tier: 'low-risk',
    grantsPart: true, // ambushBonus.partId, a random FIVE_CREDIT_PARTS pick
    measure: { kind: 'event', eventId: 'distress-beacon', choiceIndex: 1 },
  },
  // Iteration 56.3: the black-site vault's "blow the door" fight — 6cr,
  // upper-middle of the high-risk band, matching its "real risk, real
  // payoff" billing (a HARD_POOL_ACT2 detachment, same strength as
  // defector-pursuit's/debt-collectors' hunt squads). Verified 2026-08-12:
  // this test file's completeness tripwire genuinely FAILS with this entry
  // omitted (the literal `ambushBonus: { credits: 6 }` in events.ts has no
  // covering entry then) — confirmed before adding this one.
  { id: 'black-site-vault-fight', tier: 'high-risk', measure: { kind: 'event', eventId: 'black-site-vault', choiceIndex: 1 } },

  // --- Flat, no-fight event payouts ---------------------------------------
  // Every positive pay(state, N, ...) reachable from a non-chain event
  // choice — see rewardTiers.test.ts's completeness tripwire, which scrapes
  // events.ts directly so this list can't silently drift from the code.
  { id: 'derelict-cruiser-salvage', tier: 'flat', measure: { kind: 'event', eventId: 'derelict-cruiser', choiceIndex: 0 } },
  { id: 'asteroid-field-full-burn', tier: 'flat', measure: { kind: 'event', eventId: 'asteroid-field', choiceIndex: 2 } },
  { id: 'abandoned-arsenal-sell', tier: 'flat', measure: { kind: 'event', eventId: 'abandoned-arsenal', choiceIndex: 0 } },
  { id: 'intercepted-signal-sell', tier: 'flat', measure: { kind: 'event', eventId: 'intercepted-signal', choiceIndex: 0 } },
  { id: 'recon-probe-strip', tier: 'flat', measure: { kind: 'event', eventId: 'recon-probe', choiceIndex: 0 } },
  { id: 'sabotage-raid-move-on', tier: 'flat', measure: { kind: 'event', eventId: 'sabotage-raid', choiceIndex: 0 } },
  { id: 'defector-turn-in', tier: 'flat', measure: { kind: 'event', eventId: 'defector', choiceIndex: 0 } },
  { id: 'distress-beacon-lure', tier: 'flat', measure: { kind: 'event', eventId: 'distress-beacon', choiceIndex: 2 } },
  { id: 'relic-signal-sell', tier: 'flat', measure: { kind: 'event', eventId: 'relic-signal', choiceIndex: 0 } },
  { id: 'relic-vault-strip', tier: 'flat', measure: { kind: 'event', eventId: 'relic-vault', choiceIndex: 0 } },
  { id: 'war-surplus-peddler-sell', tier: 'flat', measure: { kind: 'event', eventId: 'war-surplus-peddler', choiceIndex: 2 } },
  { id: 'nav-buoy-scrap', tier: 'flat', measure: { kind: 'event', eventId: 'nav-buoy', choiceIndex: 0 } },
  { id: 'colony-ship-sell', tier: 'flat', measure: { kind: 'event', eventId: 'colony-ship', choiceIndex: 0 } },
];
