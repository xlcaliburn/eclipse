import { getEscalation } from '../game/escalations';
import type { ScheduledEscalation } from '../game/escalations';
import { getBoss, getFinalBoss } from '../game/enemies';
import { visibleNodeType } from '../game/fog';
import { actColumns, reachableNodes } from '../game/map';
import type { GameMap, MapPosition, NodeType } from '../game/map';
import type { ActiveQuest } from '../game/quests';
import { sectorName } from '../game/sectorName';
import { NodeGlyph } from './NodeGlyph';

interface MapScreenProps {
  map: GameMap;
  act: 1 | 2;
  position: MapPosition | null;
  visited: MapPosition[];
  fled: MapPosition[];
  revealedNodes: MapPosition[];
  visionCol: number;
  escalations: ScheduledEscalation[];
  bossRevealed: boolean;
  activeQuest?: ActiveQuest;
  credits?: number; // shown when viewing the map as the current screen (not a peek overlay)
  intel?: number;
  onViewFleet?: () => void;
  onClose?: () => void; // set when this is a read-only peek from a shop/event, not the live map phase
  onAbandon?: () => void; // iteration 9.2 — live map only, never on the peek overlay
  onPickNode: (row: number) => void;
}

const QUEST_MARKER_LABEL: Record<ActiveQuest['archetype'], string> = {
  bounty: 'Bounty',
  delivery: 'Delivery',
  recon: 'Recon',
};

const NODE_LABEL: Record<NodeType, string> = {
  opener: 'Combat',
  combat: 'Combat',
  elite: 'Elite',
  shop: 'Shop',
  repair: 'Repair',
  event: 'Event',
  boss: 'Boss',
};

function isVisited(visited: MapPosition[], col: number, row: number): boolean {
  return visited.some((p) => p.col === col && p.row === row);
}

export function MapScreen({
  map,
  act,
  position,
  visited,
  fled,
  revealedNodes,
  visionCol,
  escalations,
  bossRevealed,
  activeQuest,
  credits,
  intel,
  onViewFleet,
  onClose,
  onAbandon,
  onPickNode,
}: MapScreenProps) {
  const columns = actColumns(map, act);
  const reachable = reachableNodes(columns, position);
  const reachableRows = new Set(reachable.map((n) => n.row));
  const isFled = (col: number, row: number) => fled.some((p) => p.col === col && p.row === row);
  const bossName = act === 1 ? getBoss(map.act1BossId).name : getFinalBoss(map.act2BossId).name;
  const bossLabel = bossRevealed
    ? `${act === 1 ? 'Boss' : 'Final boss'}: ${bossName}`
    : act === 1
      ? 'Boss — unknown'
      : 'Final boss — unknown';
  const fogState = { visited, revealedNodes, visionCol };
  const isQuestTarget = (col: number, row: number) =>
    !!activeQuest && activeQuest.target.col === col && activeQuest.target.row === row;

  return (
    <div className="map-screen">
      <h2 className="map-screen__sector">
        SECTOR {act === 1 ? 'I' : 'II'} — {sectorName(map.seed + act)}
      </h2>
      <div className="map-screen__header">
        {credits !== undefined && <div className="credits-badge">{credits} credits</div>}
        {intel !== undefined && <div className="credits-badge credits-badge--intel">{intel} intel</div>}
        {onViewFleet && (
          <button type="button" className="shop-button" onClick={onViewFleet}>
            View fleet
          </button>
        )}
        {onClose && (
          <button type="button" className="shop-button" onClick={onClose}>
            Close map
          </button>
        )}
        {onAbandon && (
          <button type="button" className="shop-button" onClick={onAbandon}>
            Abandon run
          </button>
        )}
      </div>
      <p className="hint">
        {onClose
          ? 'Viewing the map — close it to get back to what you were doing.'
          : "Pick your next stop. Only nearby columns, repair yards, and the boss are known up front — the rest is fog until you scout it or get there."}
      </p>

      <div className="map-screen__escalations">
        {escalations
          .filter((esc) => esc.act === act)
          .map((esc, i) => (
            <span key={i} className="escalation-badge">
              After col {esc.landsAfterColumn}:{' '}
              {esc.revealed ? `${getEscalation(esc.id).name} (${getEscalation(esc.id).description})` : 'unknown'}
            </span>
          ))}
        {activeQuest && (
          <span className="escalation-badge escalation-badge--quest">
            {QUEST_MARKER_LABEL[activeQuest.archetype]} quest: column {activeQuest.target.col + 1}, lane{' '}
            {activeQuest.target.row + 1}
          </span>
        )}
      </div>

      <div className="map-screen__lanes">
        {columns.map((column, col) => (
          <div key={col} className="map-screen__column">
            {column.map((node) => {
              const visitedHere = isVisited(visited, node.col, node.row);
              const fledHere = isFled(node.col, node.row);
              const isCurrent = position !== null && position.col === node.col && position.row === node.row;
              const isQuestHere = isQuestTarget(node.col, node.row);
              const canPick =
                !fledHere && node.col === (position === null ? 0 : position.col + 1) && reachableRows.has(node.row);
              const type = visibleNodeType(fogState, node);
              const classNames = [
                'map-node',
                type ? `map-node--${type}` : 'map-node--hidden',
                visitedHere ? 'map-node--visited' : '',
                fledHere ? 'map-node--fled' : '',
                isCurrent ? 'map-node--current' : '',
                canPick ? 'map-node--reachable' : '',
                isQuestHere ? 'map-node--quest' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const label = type === 'boss' ? bossLabel : type ? NODE_LABEL[type] : '?';
              return (
                <button
                  key={node.row}
                  type="button"
                  className={classNames}
                  disabled={!canPick}
                  onClick={() => onPickNode(node.row)}
                  title={fledHere ? 'Fled — cannot return' : undefined}
                >
                  <NodeGlyph type={type} size={type === 'boss' ? 26 : 18} />
                  <span className="map-node__label">
                    {fledHere ? `${label} (fled)` : isQuestHere ? `${label} ★` : label}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
