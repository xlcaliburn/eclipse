import { getUpgrade } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';

// 47.3c: extracted from the ~17-line badge + empty-augment-slot +
// fusion-summary block duplicated in FleetPanel.tsx and FleetOverlay.tsx
// (a third, badges-only copy lived in CombatFleetView.tsx). The Warlord's
// augment-slot count change had to land in two places last time this drifted
// — this is the fix. `emptySlots`/`fusionText` are omitted by CombatFleetView
// (a combat card only ever shows the badges themselves, not the open-slot/
// fusion detail FleetPanel and FleetOverlay show — combat ships don't carry
// full PlayerShipState, just their raw upgrade ids).
interface UpgradeBadgeRowProps {
  upgrades: UpgradeId[];
  emptySlots?: number;
  fusionText?: string | null;
}

export function UpgradeBadgeRow({ upgrades, emptySlots = 0, fusionText }: UpgradeBadgeRowProps) {
  return (
    <div className="ship-card__upgrades">
      {upgrades.map((upgradeId, i) => (
        <span key={`${upgradeId}-${i}`} className="upgrade-badge" title={getUpgrade(upgradeId).description}>
          {getUpgrade(upgradeId).name}
        </span>
      ))}
      {Array.from({ length: Math.max(0, emptySlots) }).map((_, i) => (
        <span key={`empty-augment-${i}`} className="upgrade-badge upgrade-badge--empty" title="Open augment slot">
          Open augment slot
        </span>
      ))}
      {fusionText && (
        <span className="upgrade-badge" title="Iteration 31: permanent, slotless — fused at the Foundry">
          Fused: {fusionText}
        </span>
      )}
    </div>
  );
}
