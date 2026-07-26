import type { NodeType } from '../game/map';

// Iteration 10.4: one small code-authored glyph per map node type, shown
// inside each starchart "star system" circle.
const NODE_GLYPHS: Record<NodeType, React.ReactNode> = {
  opener: <polygon points="50,15 82,85 18,85" />,
  combat: <polygon points="50,15 82,85 18,85" />,
  elite: <polygon points="50,4 61,37 96,37 68,58 79,92 50,71 21,92 32,58 4,37 39,37" />,
  shop: <polygon points="50,8 92,50 50,92 8,50" />,
  repair: (
    <>
      <rect x="40" y="8" width="20" height="84" />
      <rect x="8" y="40" width="84" height="20" />
    </>
  ),
  event: (
    <>
      <rect x="42" y="8" width="16" height="46" rx="8" />
      <circle cx="50" cy="72" r="11" />
    </>
  ),
  boss: <polygon points="50,4 76,20 92,50 76,80 50,96 24,80 8,50 24,20" />,
};

export function NodeGlyph({ type, size = 18 }: { type: NodeType | null; size?: number }) {
  if (!type) {
    return <span className="map-node__unknown">?</span>;
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="node-glyph" aria-hidden="true">
      {NODE_GLYPHS[type]}
    </svg>
  );
}
