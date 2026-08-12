import { PowerBoltIcon } from './PartIcon';

interface PowerPipRowProps {
  used: number;
  budget: number;
  // 2026-08-12: the frame's own innate power, when a caller has it AND it
  // differs from `budget` — i.e. a carried reactor is inflating the
  // budget above the hull's structural number. Shown as "(base N)" next
  // to the fraction; omitted when equal to budget (most ships, no
  // reactor equipped) so it never states the obvious. Callers compute
  // this as `budget - equippedPowerGen(equipped)` — powerBudget's own
  // definition — rather than a second getFrame import.
  base?: number;
}

// Iteration 57.3 introduced this as a segmented pip meter (same visual
// family as HP's HpPipRow); iteration 60.8 replaced that with a bolt icon +
// plain fraction — the pips kept reading as a second HP bar despite 57.3's
// own relabelling attempt (identical dimensions to the HP pips, but with
// INVERTED semantics: lit = spent here, lit = remaining there). A glyph
// that unambiguously means "power" next to the bare number doesn't have
// that problem, and needs no separate "Power" word label beside it either.
// Component name and {used, budget} API kept exactly as-is so every call
// site (FleetPanel, FleetOverlay, ShopScreen's frame cards, the shipyard's
// refit rows) inherits the new look with no changes of its own.
// `used` exceeding `budget` is defensive only (a save from before this
// feature, or similar) — canEquip/canRefit never let a live build reach
// this state — but the fraction still renders sanely, danger-colored,
// instead of silently claiming to fit.
export function PowerPipRow({ used, budget, base }: PowerPipRowProps) {
  const over = used > budget;
  const showBase = base !== undefined && base !== budget;
  return (
    <span className={`power-fraction${over ? ' power-fraction--over' : ''}`} title={`Power ${used}/${budget}`}>
      <PowerBoltIcon size={12} className="power-fraction__icon" />
      {used}/{budget}
      {showBase && <span className="power-fraction__base">(base {base})</span>}
    </span>
  );
}
