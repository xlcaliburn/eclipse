import type { FrameId } from '../game/frames';

// Iteration 10.3: simple geometric top-down silhouettes, code-authored
// (inline SVG, no image assets). All share a 0-100 viewBox so they compose
// uniformly at any size. Player ships tint cyan, enemies tint red — via
// `currentColor` + a wrapping class, not baked into the paths themselves.

export type EnemyArchetype = 'swarm' | 'frigate' | 'cruiser' | 'fortress' | 'boss';

// One archetype per enemy *silhouette*, not per enemy — a small heuristic
// over an enemy group's own stats, kept entirely in presentation code so
// no engine/type files need an "archetype" field. `knownBossId` covers the
// hand-tuned boss trios (act-1 mid-bosses + act-2 finals), whose ids are
// stable and never elite/bounty-suffixed.
const BOSS_IDS = new Set(['gcds', 'hive', 'dread', 'titan', 'empress', 'citadel']);

export function classifyArchetype(enemyId: string, group: { count: number; stats: { hp: number; shield: number } }): EnemyArchetype {
  if (BOSS_IDS.has(enemyId)) return 'boss';
  if (group.count >= 3) return 'swarm';
  if (group.stats.shield >= 3 || group.stats.hp >= 8) return 'fortress';
  if (group.stats.hp <= 2 && group.count <= 2) return 'frigate';
  return 'cruiser';
}

interface SilhouetteProps {
  size?: number; // px, square
  className?: string;
}

function Svg({ size = 32, className, children }: SilhouetteProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`silhouette${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const FRAME_SHAPES: Record<FrameId, React.ReactNode> = {
  cruiser: ( // Flagship — elongated hexagon body + swept side wings
    <>
      <polygon points="50,5 65,25 65,75 50,95 35,75 35,25" />
      <polygon points="35,40 10,55 35,65" />
      <polygon points="65,40 90,55 65,65" />
    </>
  ),
  interceptor: ( // small, sharp — fast and fragile
    <polygon points="50,5 70,90 50,75 30,90" />
  ),
  'light-cruiser': ( // Cruiser — plain elongated diamond, no gimmick
    <polygon points="50,10 62,35 62,70 50,90 38,70 38,35" />
  ),
  bastion: ( // wide, blocky — durable protector
    <polygon points="35,10 65,10 85,30 85,70 65,90 35,90 15,70 15,30" />
  ),
  dreadnought: ( // large body + side blocks + nose spike
    <>
      <polygon points="50,8 66,22 66,78 50,95 34,78 34,22" />
      <polygon points="20,38 34,46 34,62 20,54" />
      <polygon points="80,38 66,46 66,62 80,54" />
      <polygon points="44,8 56,8 50,22" />
    </>
  ),
};

export function FrameSilhouette({ frameId, size, className }: { frameId: FrameId } & SilhouetteProps) {
  return (
    <Svg size={size} className={`silhouette--player${className ? ` ${className}` : ''}`}>
      {FRAME_SHAPES[frameId]}
    </Svg>
  );
}

const ENEMY_SHAPES: Record<EnemyArchetype, React.ReactNode> = {
  swarm: <polygon points="50,15 75,50 50,85 25,50" />,
  frigate: (
    <>
      <polygon points="42,10 58,10 58,80 42,80" />
      <polygon points="30,55 42,60 42,75" />
      <polygon points="70,55 58,60 58,75" />
    </>
  ),
  cruiser: <polygon points="50,8 70,30 70,70 50,92 30,70 30,30" />,
  fortress: (
    <>
      <polygon points="30,20 70,20 90,50 70,80 30,80 10,50" />
      <polygon points="45,5 55,5 50,20" />
      <polygon points="45,95 55,95 50,80" />
      <polygon points="5,45 5,55 20,50" />
      <polygon points="95,45 95,55 80,50" />
    </>
  ),
  boss: (
    <>
      <polygon points="50,10 75,30 75,70 50,95 25,70 25,30" />
      <polygon points="25,40 0,30 5,60 25,60" />
      <polygon points="75,40 100,30 95,60 75,60" />
      <polygon points="45,0 55,0 50,15" />
    </>
  ),
};

export function EnemySilhouette({ archetype, size, className }: { archetype: EnemyArchetype } & SilhouetteProps) {
  return (
    <Svg size={size} className={`silhouette--enemy${className ? ` ${className}` : ''}`}>
      {ENEMY_SHAPES[archetype]}
    </Svg>
  );
}

// Iteration 10.3: destroyed ships collapse to a dimmed broken-hull glyph —
// two drifted half-shapes, independent of the frame/archetype above.
export function BrokenHullGlyph({ size, className }: SilhouetteProps) {
  return (
    <Svg size={size} className={`silhouette--broken${className ? ` ${className}` : ''}`}>
      <polygon points="30,10 55,30 45,70 20,60" />
      <polygon points="70,15 80,55 60,90 50,50" />
    </Svg>
  );
}
