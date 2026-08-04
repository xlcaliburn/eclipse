export type EscalationId = 'hardened' | 'deflectors' | 'firecontrol' | 'overdrive' | 'squadrons';

export interface EscalationDef {
  id: EscalationId;
  name: string;
  description: string;
}

export const ESCALATIONS: EscalationDef[] = [
  { id: 'hardened', name: 'Hardened hulls', description: '+1 HP per ship' },
  { id: 'deflectors', name: 'Deflector refit', description: '+1 shield' },
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

// Iteration 8: four escalations per run — two in act 1 (after local columns
// 4 and 7) plus two more in act 2 (after the same local columns), all
// drawn without replacement from the 5-entry pool so a full run samples
// nearly the whole escalation kit. Continues whatever rng stream the caller
// passes in (the reducer threads the same mulberry32 instance used for map
// generation, so the whole run's setup is deterministic from one seed).
//
// Iteration 22: landing columns shifted from 3/6 to 4/7 to stay aligned
// with enemies.ts's poolBand and veterancyBonus, which shifted for the same
// reason (see poolBand's comment) — all three used to step up independently
// at column 4, stacking into one cliff nobody had designed on purpose.
// scripts/actRun.ts's local drawAct1Escalations mirrors these numbers by
// hand (it can't import a full RunState-driven schedule) — keep both in
// sync.
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
  ];
}
