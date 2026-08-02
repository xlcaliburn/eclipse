import { useEffect, useRef, useState } from 'react';
import { getEscalation } from '../game/escalations';
import type { ScheduledEscalation } from '../game/escalations';
import { getBoss, getFinalBoss } from '../game/enemies';
import { visibleNodeType } from '../game/fog';
import { actColumns, CARGO_DESCRIPTION, CARGO_LABEL, reachableNodes } from '../game/map';
import type { CargoTag, GameMap, MapNode, MapPosition, NodeType } from '../game/map';
import type { ActiveQuest } from '../game/quests';
import { sectorName } from '../game/sectorName';
import { NodeGlyph } from './NodeGlyph';
import { usePrefersReducedMotion } from './useReducedMotion';

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
  onViewFleet?: () => void;
  onClose?: () => void; // set when this is a read-only peek from a shop/event, not the live map phase
  onAbandon?: () => void; // iteration 9.2 — live map only, never on the peek overlay
  onPickNode: (row: number) => void;
  // Iteration 16.1: defaults true (desktop peek + the live map phase are
  // unchanged). The mobile Chart tab passes false outside the map phase —
  // the reducer's phase guard already makes a stray PICK_NODE a no-op, this
  // just hides the pick affordances (reachable highlighting, hover, click)
  // so a read-only tab doesn't look actionable.
  interactive?: boolean;
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

// Iteration 15.1: a small cargo-glyph badge on every visible combat node,
// following the exact same fog rule as the node's type itself.
const CARGO_GLYPH: Record<CargoTag, string> = {
  patrol: '·',
  convoy: '$',
  wreck: '⚙',
  command: '♦',
};

function isVisited(visited: MapPosition[], col: number, row: number): boolean {
  return visited.some((p) => p.col === col && p.row === row);
}

// --- Starchart coordinate system (iteration 12.1) ---------------------------
// Node centers are a pure function of (col, row); single-node columns (the
// act-1 opener, the boss) sit on the middle lane. The SVG edge layer and the
// absolutely-positioned node buttons share these numbers, so lines always
// meet node centers exactly.
const COL_W = 112;
const ROW_H = 104;
const PAD_X = 64;
const PAD_Y = 60;

function nodeCenter(columns: MapNode[][], col: number, row: number): { x: number; y: number } {
  const y = columns[col].length === 1 ? PAD_Y + ROW_H : PAD_Y + row * ROW_H;
  return { x: PAD_X + col * COL_W, y };
}

function chartSize(columns: MapNode[][]): { width: number; height: number } {
  return { width: PAD_X * 2 + (columns.length - 1) * COL_W, height: PAD_Y * 2 + 2 * ROW_H };
}

interface ChartEdge {
  from: MapPosition;
  to: MapPosition;
}

// Every legal adjacency in the act: |row delta| <= 1, except single-node
// columns (opener, boss) which connect to/from every lane.
function chartEdges(columns: MapNode[][]): ChartEdge[] {
  const edges: ChartEdge[] = [];
  for (let c = 0; c < columns.length - 1; c++) {
    for (const a of columns[c]) {
      for (const b of columns[c + 1]) {
        const connects = columns[c].length === 1 || columns[c + 1].length === 1 || Math.abs(a.row - b.row) <= 1;
        if (connects) edges.push({ from: { col: a.col, row: a.row }, to: { col: b.col, row: b.row } });
      }
    }
  }
  return edges;
}

function samePos(a: MapPosition | null, b: MapPosition): boolean {
  return a !== null && a.col === b.col && a.row === b.row;
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
  onViewFleet,
  onClose,
  onAbandon,
  onPickNode,
  interactive = true,
}: MapScreenProps) {
  const columns = actColumns(map, act);
  const reachable = reachableNodes(columns, position);
  const reachableRows = new Set(reachable.map((n) => n.row));
  const isFled = (col: number, row: number) => fled.some((p) => p.col === col && p.row === row);
  const [hovered, setHovered] = useState<MapPosition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Keep the fleet's current column in view as the run advances.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const focusCol = position === null ? 0 : position.col;
    const target = PAD_X + focusCol * COL_W - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [position, reducedMotion]);
  const bossName = act === 1 ? getBoss(map.act1BossId).name : getFinalBoss(map.act2BossId).name;
  const bossLabel = bossRevealed
    ? `${act === 1 ? 'Boss' : 'Final boss'}: ${bossName}`
    : act === 1
      ? 'Boss — unknown'
      : 'Final boss — unknown';
  const fogState = { visited, revealedNodes, visionCol };
  // Only decrypted escalations are listed — an undecrypted one is a threat
  // you have no information about, so a placeholder row just adds noise.
  const revealedEscalations = escalations.filter((esc) => esc.act === act && esc.revealed);
  const isQuestTarget = (col: number, row: number) =>
    !!activeQuest && activeQuest.target.col === col && activeQuest.target.row === row;

  return (
    <div className="map-screen">
      <h2 className="map-screen__sector">
        SECTOR {act === 1 ? 'I' : 'II'} — {sectorName(map.seed + act)}
      </h2>
      {/* Credits/intel live in the persistent HUD bar — no per-screen copy. */}
      <div className="map-screen__header">
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
          : interactive
            ? "Pick your next stop. Only nearby columns, repair yards, and the boss are known up front — the rest is fog until you scout it or get there."
            : 'Viewing the map — switch tabs to get back to what you were doing.'}
      </p>

      {/* Iteration 13: legible copy, 1-indexed columns everywhere (players
          count columns from 1; the quest badge already did). "From column
          N" = the first column whose fights carry the buff. */}
      <div className="map-screen__escalations">
        {(revealedEscalations.length > 0 || activeQuest) && (
          <span className="map-screen__escalations-title">Sector threats</span>
        )}
        {revealedEscalations.map((esc, i) => (
          <span key={i} className="escalation-badge" title={getEscalation(esc.id).description}>
            From column {esc.landsAfterColumn + 2}: {getEscalation(esc.id).name} —{' '}
            {getEscalation(esc.id).description}
          </span>
        ))}
        {activeQuest && (
          <span
            className="escalation-badge escalation-badge--quest"
            title="Your active job — route through the marked node to complete it."
          >
            {QUEST_MARKER_LABEL[activeQuest.archetype]} quest target: column {activeQuest.target.col + 1}, lane{' '}
            {activeQuest.target.row + 1} (★ on the chart)
          </span>
        )}
      </div>

      {(() => {
        const size = chartSize(columns);
        const edges = chartEdges(columns);
        const canPickAt = (p: MapPosition) =>
          interactive &&
          !isFled(p.col, p.row) &&
          p.col === (position === null ? 0 : position.col + 1) &&
          reachableRows.has(p.row);
        const trail = visited.map((p) => nodeCenter(columns, p.col, p.row));
        return (
          <div className="starchart" ref={scrollRef}>
            <div className="starchart__canvas" style={{ width: size.width, height: size.height }}>
              <svg
                className="starchart__edges"
                width={size.width}
                height={size.height}
                viewBox={`0 0 ${size.width} ${size.height}`}
                aria-hidden="true"
              >
                {edges.map((edge, i) => {
                  const a = nodeCenter(columns, edge.from.col, edge.from.row);
                  const b = nodeCenter(columns, edge.to.col, edge.to.row);
                  const isReachableEdge = samePos(position, edge.from) && canPickAt(edge.to);
                  const isOnwardEdge = samePos(hovered, edge.from);
                  const intoFled = isFled(edge.to.col, edge.to.row) || isFled(edge.from.col, edge.from.row);
                  const cls = [
                    'map-edge',
                    isReachableEdge ? 'map-edge--reachable' : '',
                    isOnwardEdge ? 'map-edge--onward' : '',
                    intoFled ? 'map-edge--fled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return <line key={i} className={cls} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
                })}
                {trail.length >= 2 && (
                  <polyline className="map-trail" points={trail.map((p) => `${p.x},${p.y}`).join(' ')} />
                )}
              </svg>
              {columns.map((column) =>
                column.map((node) => {
                  const visitedHere = isVisited(visited, node.col, node.row);
                  const fledHere = isFled(node.col, node.row);
                  const isCurrent = samePos(position, node);
                  const isQuestHere = isQuestTarget(node.col, node.row);
                  const canPick = canPickAt(node);
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
                  const center = nodeCenter(columns, node.col, node.row);
                  const nodeSize = type === 'boss' ? 92 : 76;
                  // 15.1: the cargo glyph follows the exact same fog rule as
                  // the node's type — `type` is already null wherever the
                  // node is hidden, so gating on it here is enough.
                  const cargo = type === 'combat' ? node.cargo : undefined;
                  return (
                    <button
                      key={`${node.col}-${node.row}`}
                      type="button"
                      className={classNames}
                      style={{ left: center.x - nodeSize / 2, top: center.y - nodeSize / 2 }}
                      disabled={!canPick}
                      onClick={() => onPickNode(node.row)}
                      onMouseEnter={canPick ? () => setHovered({ col: node.col, row: node.row }) : undefined}
                      onMouseLeave={canPick ? () => setHovered(null) : undefined}
                      onFocus={canPick ? () => setHovered({ col: node.col, row: node.row }) : undefined}
                      onBlur={canPick ? () => setHovered(null) : undefined}
                      title={fledHere ? 'Fled — cannot return' : undefined}
                    >
                      <NodeGlyph type={type} size={type === 'boss' ? 26 : 18} />
                      <span className="map-node__label">
                        {fledHere ? `${label} (fled)` : isQuestHere ? `${label} ★` : label}
                      </span>
                      {cargo && (
                        <span
                          className={`map-node__cargo map-node__cargo--${cargo}`}
                          title={`${CARGO_LABEL[cargo]} — ${CARGO_DESCRIPTION[cargo]}`}
                        >
                          {CARGO_GLYPH[cargo]}
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
