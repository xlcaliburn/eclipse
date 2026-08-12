import { PowerBoltIcon } from './PartIcon';

interface PowerPipRowProps {
  used: number;
  budget: number;
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
export function PowerPipRow({ used, budget }: PowerPipRowProps) {
  const over = used > budget;
  return (
    <span className={`power-fraction${over ? ' power-fraction--over' : ''}`} title={`Power ${used}/${budget}`}>
      <PowerBoltIcon size={12} className="power-fraction__icon" />
      {used}/{budget}
    </span>
  );
}
