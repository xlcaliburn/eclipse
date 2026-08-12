interface PowerPipRowProps {
  used: number;
  budget: number;
}

// Iteration 57.3: power as segmented pips — same visual family as HP
// (HpPipRow) rather than a third visual language of its own, per the
// spec's own instruction. One pip per point of the frame's power budget,
// `used` of them lit left-to-right. Semantics are inverted from HP (which
// drains as a ship takes damage): here lit = SPENT, dark = still
// available — a build fills the meter, it doesn't empty it.
// `used` exceeding `budget` is defensive only (a save from before this
// feature, or similar) — canEquip/canRefit never let a live build reach
// this state — but the row still renders sanely: every point past the
// budget length lights in the danger color instead of silently clipping.
export function PowerPipRow({ used, budget }: PowerPipRowProps) {
  const total = Math.max(budget, used);
  const lit = Math.max(0, used);
  return (
    <div className="power-pips" title={`Power ${used}/${budget}`}>
      {Array.from({ length: total }, (_, i) => {
        const lastLit = i < lit;
        const overBudget = i >= budget;
        return (
          <div
            key={i}
            className={`power-pips__pip${lastLit ? ` power-pips__pip--${overBudget ? 'over' : 'used'}` : ''}`}
          />
        );
      })}
    </div>
  );
}
