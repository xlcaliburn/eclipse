import { getFrame } from '../game/frames';
import { getPart } from '../game/parts';
import type { RunAction } from '../game/reducer';
import { playerShipLabel } from '../game/ship';
import type { RunState } from '../game/types';
import { getUpgrade } from '../game/upgrades';

// 47.3j: one place computing the shop's purchase/install toast text, given
// the about-to-be-dispatched action and the state it's about to resolve
// against (pre-dispatch — offer/upgrade lookups read the CURRENT shop
// offers, since the action itself hasn't run yet). Moves getPart/getFrame/
// getUpgrade/playerShipLabel's only use in App.tsx (building toast
// strings for 8 near-identical `showToast(...); dispatch(...)` shop
// callbacks) out of it entirely. Returns null for actions that don't toast
// (SELL_PART, SCUTTLE_SHIP, EQUIP, etc. — unchanged, still dispatched
// directly with no toast).
export function shopToastText(action: RunAction, state: RunState): string | null {
  switch (action.type) {
    case 'BUY_PART':
      return `Bought ${getPart(state.shopOffers![action.offerIndex]).name}.`;
    case 'BUY_SHIP':
      return `${getFrame(action.frameId).name} added to the fleet.`;
    case 'BUY_COMMODITY_LOT':
      return 'Commodity lot bought.';
    case 'BUY_MERCENARY':
      return 'Mercenary escort hired.';
    case 'BUY_REPAIR':
      return `Repaired ${playerShipLabel(state.fleet, action.shipIndex)}.`;
    case 'BUY_UPGRADE':
      return `Installed ${getUpgrade(state.shopUpgradeOffer!).name} onto ${playerShipLabel(state.fleet, action.shipIndex)}.`;
    case 'FUSE_STAT':
      return `Fused ${getPart(action.partId).name} into ${playerShipLabel(state.fleet, action.shipIndex)}.`;
    default:
      return null;
  }
}
