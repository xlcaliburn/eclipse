import type { MapNode, MapPosition, NodeType } from './map';
import type { RunState } from './types';

type FogState = Pick<RunState, 'visited' | 'revealedNodes' | 'visionCol'>;

function samePosition(a: MapPosition, b: MapPosition): boolean {
  return a.col === b.col && a.row === b.row;
}

// Whether a node's true type may be shown to the player. Repair yards and
// the boss node are always visible (long-range repair routing and knowing
// where the run ends are both free); anything else needs to have been
// visited, explicitly revealed (deep scan), or fall within the vision
// high-water mark (proximity to the player's position, monotonic).
export function isNodeRevealed(state: FogState, node: MapNode): boolean {
  if (node.type === 'repair' || node.type === 'boss') return true;
  if (state.visited.some((v) => samePosition(v, node))) return true;
  if (state.revealedNodes.some((v) => samePosition(v, node))) return true;
  return node.col <= state.visionCol;
}

// The node's type if it may be shown, or null if it should render as "?".
// UI code should call this rather than reading `node.type` directly, so a
// hidden node's real type never reaches the rendered view.
export function visibleNodeType(state: FogState, node: MapNode): NodeType | null {
  return isNodeRevealed(state, node) ? node.type : null;
}
