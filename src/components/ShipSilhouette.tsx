import type { FrameId } from '../game/frames';

// Iteration 10.3: simple geometric top-down silhouettes, code-authored
// (inline SVG, no image assets). All share a 0-100 viewBox so they compose
// uniformly at any size. Player ships tint cyan, enemies tint red — via
// `currentColor` + a wrapping class, not baked into the paths themselves.

export type EnemyArchetype = 'swarm' | 'frigate' | 'cruiser' | 'fortress' | 'boss';

// One archetype per enemy *silhouette*, not per enemy — a small heuristic
// over an enemy group's own stats, kept entirely in presentation code so
// no engine/type files need an "archetype" field. `BOSS_IDS` covers the
// hand-tuned boss trios (act-1 mid-bosses + act-2 finals), whose ids are
// stable and never elite/bounty-suffixed.
const BOSS_IDS = new Set(['gcds', 'hive', 'dread', 'titan', 'empress', 'citadel']);

// A boss's centerpiece is always its first group, by convention in
// enemies.ts — later groups are escorts and get the ordinary heuristic, so
// a Titan's picket screen doesn't render as three Titans.
export function classifyArchetype(
  enemyId: string,
  group: { count: number; stats: { hp: number; shield: number } },
  groupIndex = 0,
): EnemyArchetype {
  if (BOSS_IDS.has(enemyId) && groupIndex === 0) return 'boss';
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

// 2026-08-04, corrected same day: the first detail pass layered `opacity`
// accents in the SAME `currentColor` as the hull underneath them — which is
// invisible. Alpha-blending a translucent shape over an opaque region of
// the identical color produces exactly that color back out, unchanged (src
// and dst are the same hue, so the blend is a no-op); the only thing that
// pass actually added was a couple of new full-opacity polygons (checked
// live: every child's computed fill was the literal same `rgb(...)` string
// regardless of its `opacity` attribute). Verified live in the browser
// against the real cascade before rewriting, not just assumed.
//
// Fixed properly this time: interior detail (windows, panel seams, turret
// sockets, ribbing, crosshairs, exhaust ports) uses `fill="var(--bg)"` /
// `stroke="var(--bg)"` — the actual near-black page background color, not
// currentColor — so it reads as a real recessed/shaded mark against the
// bright hull, in both the cyan (player) and red (enemy) tint. Only
// elements that sit mostly over TRANSPARENT space (wings, dishes, masts,
// pods, spikes, vanes — anything that extends past the hull's own outline
// rather than sitting on top of its fill) stay `currentColor`, since those
// were never the problem: a translucent shape over nothing is visible fine.
const FRAME_SHAPES: Record<FrameId, React.ReactNode> = {
  cruiser: ( // Flagship — elongated hexagon body + swept side wings
    <>
      <polygon points="50,5 65,25 65,75 50,95 35,75 35,25" />
      <polygon points="35,40 10,55 35,65" />
      <polygon points="65,40 90,55 65,65" />
      <circle cx="50" cy="23" r="5" fill="var(--bg)" opacity="0.8" />
      <rect x="48.5" y="32" width="3" height="42" fill="var(--bg)" opacity="0.55" />
      <polygon points="41,80 59,80 54,94 46,94" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  interceptor: ( // small, sharp — fast and fragile
    <>
      <polygon points="50,5 70,90 50,75 30,90" />
      <circle cx="50" cy="18" r="4" fill="var(--bg)" opacity="0.8" />
      <polygon points="66,80 78,92 61,87" fill="var(--bg)" opacity="0.6" />
      <polygon points="34,80 22,92 39,87" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  'light-cruiser': ( // Cruiser — plain elongated diamond, no gimmick
    <>
      <polygon points="50,10 62,35 62,70 50,90 38,70 38,35" />
      <rect x="40" y="36" width="3" height="34" fill="var(--bg)" opacity="0.5" />
      <rect x="57" y="36" width="3" height="34" fill="var(--bg)" opacity="0.5" />
      <circle cx="50" cy="21" r="4" fill="var(--bg)" opacity="0.8" />
      <polygon points="43,78 57,78 53,92 47,92" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  bastion: ( // wide, blocky — durable protector
    <>
      <polygon points="35,10 65,10 85,30 85,70 65,90 35,90 15,70 15,30" />
      <rect x="20" y="31.5" width="60" height="3" fill="var(--bg)" opacity="0.45" />
      <rect x="20" y="65.5" width="60" height="3" fill="var(--bg)" opacity="0.45" />
      <circle cx="50" cy="50" r="9" fill="var(--bg)" opacity="0.5" />
      <circle cx="30" cy="25" r="3.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="70" cy="25" r="3.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="30" cy="75" r="3.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="70" cy="75" r="3.5" fill="var(--bg)" opacity="0.85" />
    </>
  ),
  dreadnought: ( // large body + side blocks + nose spike
    <>
      <polygon points="50,8 66,22 66,78 50,95 34,78 34,22" />
      <polygon points="20,38 34,46 34,62 20,54" />
      <polygon points="80,38 66,46 66,62 80,54" />
      <polygon points="44,8 56,8 50,22" />
      <circle cx="27" cy="50" r="3" fill="var(--bg)" opacity="0.85" />
      <circle cx="73" cy="50" r="3" fill="var(--bg)" opacity="0.85" />
      <rect x="48.5" y="28" width="3" height="42" fill="var(--bg)" opacity="0.5" />
      <polygon points="42,82 58,82 53,96 47,96" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  freighter: ( // boxy hauler — plain rectangular hull, cargo pods slung either side
    <>
      <polygon points="40,10 60,10 60,90 40,90" />
      <polygon points="15,30 35,35 35,65 15,70" />
      <polygon points="85,30 65,35 65,65 85,70" />
      <rect x="42" y="23.5" width="16" height="2.5" fill="var(--bg)" opacity="0.5" />
      <rect x="42" y="43.5" width="16" height="2.5" fill="var(--bg)" opacity="0.5" />
      <rect x="42" y="63.5" width="16" height="2.5" fill="var(--bg)" opacity="0.5" />
      <circle cx="20" cy="35" r="2" fill="var(--bg)" opacity="0.85" />
      <circle cx="80" cy="35" r="2" fill="var(--bg)" opacity="0.85" />
      <polygon points="43,84 57,84 53,94 47,94" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  derelict: ( // small, irregular — a battered hulk patched more than built
    <>
      <polygon points="50,20 62,35 58,60 68,75 45,90 32,68 38,45 30,30" />
      <polygon points="55,38 63,44 57,52 50,46" fill="var(--bg)" opacity="0.5" />
      <polygon points="34,58 42,62 38,72 30,68" fill="var(--bg)" opacity="0.45" />
      <circle cx="47" cy="50" r="2.5" fill="var(--bg)" opacity="0.7" />
    </>
  ),

  // --- Support hulls (iteration 23) ---
  frigate: ( // slim hull + a dish — a coordination ship, not a combatant
    <>
      <polygon points="50,15 60,35 60,85 50,95 40,85 40,35" />
      <circle cx="50" cy="25" r="12" />
      <line x1="38" y1="25" x2="62" y2="25" stroke="var(--bg)" strokeWidth="2" opacity="0.6" />
      <line x1="50" y1="13" x2="50" y2="37" stroke="var(--bg)" strokeWidth="2" opacity="0.6" />
      <rect x="49" y="2" width="2" height="12" />
      <polygon points="44,80 56,80 52,92 48,92" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  aegis: ( // small core ringed by a broadcast halo — the ring and its four
    // node-dots sit at radius 34 from center, well clear of the r~14 hex
    // core, so they're over transparent space and read fine at full
    // currentColor; only the ring itself needs fill:none so it's a stroked
    // annulus, not a same-color disc burying the core.
    <>
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.45" />
      <circle cx="50" cy="16" r="3" opacity="0.8" />
      <circle cx="50" cy="84" r="3" opacity="0.8" />
      <circle cx="16" cy="50" r="3" opacity="0.8" />
      <circle cx="84" cy="50" r="3" opacity="0.8" />
      <polygon points="50,30 62,42 62,58 50,70 38,58 38,42" />
    </>
  ),
  tender: ( // hull + a pair of drone-bay pods slung low, each marked with a
    // dark repair cross
    <>
      <polygon points="45,10 55,10 55,90 45,90" />
      <polygon points="25,55 42,60 42,80 25,75" />
      <polygon points="75,55 58,60 58,80 75,75" />
      <rect x="31" y="64" width="6" height="2" fill="var(--bg)" opacity="0.9" />
      <rect x="33" y="62" width="2" height="6" fill="var(--bg)" opacity="0.9" />
      <rect x="65" y="64" width="6" height="2" fill="var(--bg)" opacity="0.9" />
      <rect x="67" y="62" width="2" height="6" fill="var(--bg)" opacity="0.9" />
      <polygon points="47,84 53,84 51,94 49,94" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  'ew-cutter': ( // narrow hull + a jamming array fanned out front
    <>
      <polygon points="50,25 58,45 58,90 42,90 42,45" />
      <polygon points="30,10 50,25 30,35" />
      <polygon points="70,10 50,25 70,35" />
      <circle cx="30" cy="18" r="2.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="70" cy="18" r="2.5" fill="var(--bg)" opacity="0.85" />
      <rect x="48.5" y="48" width="3" height="30" fill="var(--bg)" opacity="0.5" />
      <polygon points="45,82 55,82 52,94 48,94" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  'disruptor-cutter': ( // narrow hull + a projector spike forward, ringed
    // like a focusing lens — visually paired with the EW Cutter's array but
    // distinct up close
    <>
      <polygon points="50,30 58,50 58,90 42,90 42,50" />
      <polygon points="46,5 54,5 50,30" />
      <circle cx="50" cy="12" r="4" fill="none" stroke="var(--bg)" strokeWidth="2" opacity="0.6" />
      <polygon points="34,45 42,52 34,58" />
      <polygon points="66,45 58,52 66,58" />
      <polygon points="45,82 55,82 52,94 48,94" fill="var(--bg)" opacity="0.6" />
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
  // Kept deliberately spare — swarm renders 3+ copies on screen at once, so
  // extra detail per unit reads as noise rather than texture at that count.
  swarm: (
    <>
      <polygon points="50,15 75,50 50,85 25,50" />
      <circle cx="50" cy="50" r="4" fill="var(--bg)" opacity="0.7" />
    </>
  ),
  frigate: (
    <>
      <polygon points="42,10 58,10 58,80 42,80" />
      <polygon points="30,55 42,60 42,75" />
      <polygon points="70,55 58,60 58,75" />
      <circle cx="50" cy="20" r="3.5" fill="var(--bg)" opacity="0.85" />
      <polygon points="45,72 55,72 51,86 49,86" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  cruiser: (
    <>
      <polygon points="50,8 70,30 70,70 50,92 30,70 30,30" />
      <rect x="31.5" y="32" width="3" height="36" fill="var(--bg)" opacity="0.5" />
      <rect x="65.5" y="32" width="3" height="36" fill="var(--bg)" opacity="0.5" />
      <circle cx="50" cy="24" r="4" fill="var(--bg)" opacity="0.85" />
      <polygon points="43,78 57,78 52,90 48,90" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  fortress: (
    <>
      <polygon points="30,20 70,20 90,50 70,80 30,80 10,50" />
      <polygon points="45,5 55,5 50,20" />
      <polygon points="45,95 55,95 50,80" />
      <polygon points="5,45 5,55 20,50" />
      <polygon points="95,45 95,55 80,50" />
      <circle cx="50" cy="50" r="10" fill="var(--bg)" opacity="0.5" />
      <circle cx="35" cy="35" r="3" fill="var(--bg)" opacity="0.85" />
      <circle cx="65" cy="35" r="3" fill="var(--bg)" opacity="0.85" />
      <circle cx="35" cy="65" r="3" fill="var(--bg)" opacity="0.85" />
      <circle cx="65" cy="65" r="3" fill="var(--bg)" opacity="0.85" />
    </>
  ),
  boss: (
    <>
      <polygon points="50,10 75,30 75,70 50,95 25,70 25,30" />
      <polygon points="25,40 0,30 5,60 25,60" />
      <polygon points="75,40 100,30 95,60 75,60" />
      <polygon points="45,0 55,0 50,15" />
      <circle cx="50" cy="30" r="5" fill="var(--bg)" opacity="0.6" />
      <circle cx="35" cy="45" r="3" fill="var(--bg)" opacity="0.85" />
      <circle cx="65" cy="45" r="3" fill="var(--bg)" opacity="0.85" />
      <rect x="48.5" y="35" width="3" height="50" fill="var(--bg)" opacity="0.5" />
      <polygon points="42,86 58,86 52,96 48,96" fill="var(--bg)" opacity="0.6" />
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
