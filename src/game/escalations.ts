export type EscalationId = 'hardened' | 'deflectors' | 'firecontrol' | 'overdrive' | 'squadrons';

export interface EscalationDef {
  id: EscalationId;
  name: string;
  description: string;
}

export const ESCALATIONS: EscalationDef[] = [
  { id: 'hardened', name: 'Hardened hulls', description: '+1 HP per ship' },
  { id: 'deflectors', name: 'Deflector refit', description: '+1 piloting' },
  { id: 'firecontrol', name: 'Fire control upgrade', description: '+1 computer' },
  { id: 'overdrive', name: 'Overcharged drives', description: '+1 initiative' },
  { id: 'squadrons', name: 'Reinforced squadrons', description: 'groups of 2+ gain one extra ship' },
];

const ESCALATIONS_BY_ID: Record<EscalationId, EscalationDef> = Object.fromEntries(
  ESCALATIONS.map((e) => [e.id, e]),
) as Record<EscalationId, EscalationDef>;

export function getEscalation(id: EscalationId): EscalationDef {
  const escalation = ESCALATIONS_BY_ID[id];
  if (!escalation) throw new Error(`Unknown escalation id: ${id}`);
  return escalation;
}

export interface ScheduledEscalation {
  id: EscalationId;
  act: 1 | 2; // iteration 8: which act's local column this escalation counts against
  landsAfterColumn: number;
  revealed: boolean;
}

// Iteration 8: escalations per run, drawn without replacement from the
// 5-entry pool. Continues whatever rng stream the caller passes in (the
// reducer threads the same mulberry32 instance used for map generation, so
// the whole run's setup is deterministic from one seed).
//
// Iteration 32 (2026-08-07): a 5th draw (act 2's third wave, below) means
// every draw-without-replacement now exhausts the entire 5-entry pool —
// a full run gets ALL FIVE escalations, always, not "nearly the whole kit"
// as before this iteration (4 of 5, one omitted at random each run). The
// only remaining variance is which escalation lands at which of the five
// (act, column) slots. Noted here since it's a real behavior change the
// plan's own wording didn't call out; not treated as a bug — five
// escalations feels proportionate to a run that's now 22 lane columns
// long instead of 20, and the pool was never designed to be scarce.
//
// Iteration 22: landing columns shifted from 3/6 to 4/7 to stay aligned
// with enemies.ts's poolBand and veterancyBonus, which shifted for the same
// reason (see poolBand's comment) — all three used to step up independently
// at column 4, stacking into one cliff nobody had designed on purpose.
// 2026-08-08 (iteration 45): scripts/actRun.ts used to mirror these
// numbers by hand in a local drawAct1Escalations, which is exactly the
// "keep both in sync" trap the balancing-engine rebuild exists to
// eliminate — scripts/sim/agent.ts drives the real reducer (and so this
// real function) directly, nothing to keep in sync any more.
//
// Iteration 32 (2026-08-07): act 2 grew from 10 lane columns to 12 (see
// map.ts's ACT2_QUOTAS) — room for a third wave where 10 only held two.
// Act 1 is untouched (still 2 waves; it didn't grow). Landing at column 9
// (not 10 or 11): the trio should read as "escalating toward the boss,"
// not "arrives with it" — the same one-column-of-breathing-room reasoning
// that put the second wave at 7, three shy of act 1's old col-10 boss.
export function drawEscalationSchedule(rng: () => number): ScheduledEscalation[] {
  const pool = [...ESCALATIONS];
  const pick = (): EscalationId => {
    const index = Math.floor(rng() * pool.length);
    return pool.splice(index, 1)[0].id;
  };
  return [
    { id: pick(), act: 1, landsAfterColumn: 4, revealed: false },
    { id: pick(), act: 1, landsAfterColumn: 7, revealed: false },
    { id: pick(), act: 2, landsAfterColumn: 4, revealed: false },
    { id: pick(), act: 2, landsAfterColumn: 7, revealed: false },
    { id: pick(), act: 2, landsAfterColumn: 9, revealed: false },
  ];
}
