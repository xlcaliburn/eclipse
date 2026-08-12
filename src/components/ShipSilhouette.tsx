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
// Iteration 37 (art pass): every active hull rebuilt as a recognizable
// top-down spacecraft rather than a single abstract polygon. The shared
// design language, so the fleet reads as one navy:
//   - bow up / stern down, symmetric about x=50 (except the Derelict);
//   - a ship is SEVERAL attached masses — fuselage + wings/nacelles/pods —
//     never one convex blob;
//   - dark (var(--bg)) canopy near the bow, dark engine nozzles at the
//     stern, thin dark spine/panel seams for scale;
//   - engine glows are currentColor shapes BELOW the stern outline — over
//     transparent space, where translucent currentColor is actually
//     visible (see the hard-won note above).
// Details are kept chunky (>=2.5 viewBox units) — these render at 28-44px.
const FRAME_SHAPES: Record<FrameId, React.ReactNode> = {
  cruiser: ( // Flagship — broad command ship: bottle hull, swept wing sponsons, wingtip pods, twin engines
    <>
      <polygon points="50,4 57,14 61,30 61,70 55,84 45,84 39,70 39,30 43,14" />
      <polygon points="39,44 16,60 16,70 26,72 39,62" />
      <polygon points="61,44 84,60 84,70 74,72 61,62" />
      <polygon points="12,56 18,54 18,76 12,74" />
      <polygon points="88,56 82,54 82,76 88,74" />
      <ellipse cx="50" cy="18" rx="3.5" ry="5.5" fill="var(--bg)" opacity="0.8" />
      <rect x="48.75" y="28" width="2.5" height="44" fill="var(--bg)" opacity="0.5" />
      <rect x="44.5" y="77" width="3" height="6" fill="var(--bg)" opacity="0.75" />
      <rect x="52.5" y="77" width="3" height="6" fill="var(--bg)" opacity="0.75" />
      <polygon points="45,85 48,85 46.5,94" opacity="0.5" />
      <polygon points="52,85 55,85 53.5,94" opacity="0.5" />
    </>
  ),
  interceptor: ( // dart fighter — needle fuselage, delta wings swept hard back, canards, one hot engine
    <>
      <polygon points="50,4 55,20 55,68 50,82 45,68 45,20" />
      <polygon points="45,34 22,70 30,76 45,58" />
      <polygon points="55,34 78,70 70,76 55,58" />
      <polygon points="45,18 37,27 45,29" />
      <polygon points="55,18 63,27 55,29" />
      <ellipse cx="50" cy="16" rx="2.5" ry="4.5" fill="var(--bg)" opacity="0.8" />
      <polygon points="46.5,76 53.5,76 52,82 48,82" fill="var(--bg)" opacity="0.75" />
      <polygon points="46,83 54,83 50,97" opacity="0.55" />
    </>
  ),
  'light-cruiser': ( // Cruiser — sleek destroyer: tapered hull, mid wings, twin engine nacelles astern
    <>
      <polygon points="50,6 58,20 58,72 53,84 47,84 42,72 42,20" />
      <polygon points="42,40 26,56 26,64 35,64 42,54" />
      <polygon points="58,40 74,56 74,64 65,64 58,54" />
      <polygon points="34,64 42,66 42,88 34,86" />
      <polygon points="66,64 58,66 58,88 66,86" />
      <ellipse cx="50" cy="17" rx="3" ry="4.5" fill="var(--bg)" opacity="0.8" />
      <rect x="48.75" y="26" width="2.5" height="40" fill="var(--bg)" opacity="0.5" />
      <circle cx="38" cy="83" r="2" fill="var(--bg)" opacity="0.8" />
      <circle cx="62" cy="83" r="2" fill="var(--bg)" opacity="0.8" />
      <polygon points="35,88 41,88 38,97" opacity="0.5" />
      <polygon points="59,88 65,88 62,97" opacity="0.5" />
    </>
  ),
  bastion: ( // armored bulwark — wide shield hull, bolted side slabs, chevron plating, twin heavy engines
    <>
      <polygon points="50,8 68,14 76,32 76,68 68,86 50,92 32,86 24,68 24,32 32,14" />
      <polygon points="14,36 24,40 24,64 14,60" />
      <polygon points="86,36 76,40 76,64 86,60" />
      <polygon points="32,34 50,26 68,34 68,39 50,31 32,39" fill="var(--bg)" opacity="0.5" />
      <polygon points="32,50 50,42 68,50 68,55 50,47 32,55" fill="var(--bg)" opacity="0.5" />
      <circle cx="50" cy="66" r="6.5" fill="var(--bg)" opacity="0.55" />
      <circle cx="32" cy="22" r="3" fill="var(--bg)" opacity="0.85" />
      <circle cx="68" cy="22" r="3" fill="var(--bg)" opacity="0.85" />
      <polygon points="41,86 46,86 45,92 42,92" fill="var(--bg)" opacity="0.75" />
      <polygon points="54,86 59,86 58,92 55,92" fill="var(--bg)" opacity="0.75" />
      <polygon points="42,93 46,93 44,99" opacity="0.45" />
      <polygon points="54,93 58,93 56,99" opacity="0.45" />
    </>
  ),
  dreadnought: ( // capital ship — long layered hull, spinal gun channel, turreted sponsons, lower fins, three engines
    <>
      <polygon points="50,3 60,10 64,26 64,74 58,88 42,88 36,74 36,26 40,10" />
      <polygon points="40,12 34,24 40,28" />
      <polygon points="60,12 66,24 60,28" />
      <polygon points="20,32 36,36 36,62 20,58" />
      <polygon points="80,32 64,36 64,62 80,58" />
      <polygon points="36,70 26,84 33,84 39,77" />
      <polygon points="64,70 74,84 67,84 61,77" />
      <rect x="48.75" y="6" width="2.5" height="18" fill="var(--bg)" opacity="0.65" />
      <circle cx="27" cy="42" r="2.2" fill="var(--bg)" opacity="0.85" />
      <circle cx="27" cy="50" r="2.2" fill="var(--bg)" opacity="0.85" />
      <circle cx="73" cy="42" r="2.2" fill="var(--bg)" opacity="0.85" />
      <circle cx="73" cy="50" r="2.2" fill="var(--bg)" opacity="0.85" />
      <rect x="43.75" y="30" width="2.5" height="42" fill="var(--bg)" opacity="0.4" />
      <rect x="53.75" y="30" width="2.5" height="42" fill="var(--bg)" opacity="0.4" />
      <polygon points="42,84 46,84 45,90 43,90" fill="var(--bg)" opacity="0.75" />
      <polygon points="48,86 52,86 51.5,92 48.5,92" fill="var(--bg)" opacity="0.75" />
      <polygon points="54,84 58,84 57,90 55,90" fill="var(--bg)" opacity="0.75" />
      <polygon points="42.5,91 46.5,91 44.5,99" opacity="0.5" />
      <polygon points="48,93 52,93 50,100" opacity="0.5" />
      <polygon points="53.5,91 57.5,91 55.5,99" opacity="0.5" />
    </>
  ),
  freighter: ( // hauler — cab, thin spine, four slung cargo containers, engine block astern
    <>
      <polygon points="42,6 58,6 62,20 38,20" />
      <rect x="47" y="20" width="6" height="58" />
      <rect x="28" y="24" width="18" height="22" />
      <rect x="28" y="50" width="18" height="22" />
      <rect x="54" y="24" width="18" height="22" />
      <rect x="54" y="50" width="18" height="22" />
      <polygon points="40,78 60,78 57,90 43,90" />
      <rect x="43" y="10" width="14" height="4" fill="var(--bg)" opacity="0.7" />
      <rect x="30" y="34" width="14" height="2.5" fill="var(--bg)" opacity="0.5" />
      <rect x="30" y="60" width="14" height="2.5" fill="var(--bg)" opacity="0.5" />
      <rect x="56" y="34" width="14" height="2.5" fill="var(--bg)" opacity="0.5" />
      <rect x="56" y="60" width="14" height="2.5" fill="var(--bg)" opacity="0.5" />
      <polygon points="44,82 48,82 47,88 45,88" fill="var(--bg)" opacity="0.75" />
      <polygon points="52,82 56,82 55,88 53,88" fill="var(--bg)" opacity="0.75" />
      <polygon points="44,91 48,91 46,98" opacity="0.5" />
      <polygon points="52,91 56,91 54,98" opacity="0.5" />
    </>
  ),
  derelict: ( // battered wreck of a cruiser — jagged hull, one stub wing, a breach, an engine barely alight
    <>
      <polygon points="50,8 58,20 56,42 64,52 58,60 60,82 50,90 44,76 40,58 46,48 38,32 44,18" />
      <polygon points="42,44 26,56 31,62 44,54" />
      <polygon points="48,28 56,34 50,44 44,34" fill="var(--bg)" opacity="0.6" />
      <circle cx="52" cy="62" r="2.5" fill="var(--bg)" opacity="0.7" />
      <polygon points="46,84 52,84 51,89 47,89" fill="var(--bg)" opacity="0.75" />
      <polygon points="47,90 51,90 49,95" opacity="0.3" />
    </>
  ),

  // Iteration 36: the plain utility carrier — deliberately the least
  // flamboyant hull in the yard (identity lives on whatever part it
  // carries). Iteration 37 art: a compact tug — short fuselage, twin
  // mid-mounted thruster pods doing the work.
  corvette: (
    <>
      <polygon points="50,10 57,20 57,64 50,72 43,64 43,20" />
      <polygon points="35,34 43,38 43,60 35,62" />
      <polygon points="65,34 57,38 57,60 65,62" />
      <ellipse cx="50" cy="17" rx="3" ry="4" fill="var(--bg)" opacity="0.8" />
      <polygon points="36,58 41,58 40,63 37,63" fill="var(--bg)" opacity="0.75" />
      <polygon points="59,58 64,58 63,63 60,63" fill="var(--bg)" opacity="0.75" />
      <polygon points="47.5,66 52.5,66 51.5,71 48.5,71" fill="var(--bg)" opacity="0.75" />
      <polygon points="36,64 41,64 38.5,73" opacity="0.5" />
      <polygon points="59,64 64,64 61.5,73" opacity="0.5" />
    </>
  ),

  // --- Iteration 52: 5 genuinely new frames ------------------------------
  gunboat: ( // stubby hull, three forward gun barrels side by side
    <>
      <polygon points="50,12 60,26 60,66 50,78 40,66 40,26" />
      <rect x="38" y="30" width="5" height="30" />
      <rect x="47.5" y="26" width="5" height="34" />
      <rect x="57" y="30" width="5" height="30" />
      <ellipse cx="50" cy="18" rx="3" ry="4" fill="var(--bg)" opacity="0.8" />
      <polygon points="46,70 54,70 51,80 49,80" fill="var(--bg)" opacity="0.6" />
    </>
  ),
  destroyer: ( // lean fast hull, swept twin fins, single hot engine
    <>
      <polygon points="50,5 57,18 57,72 50,86 43,72 43,18" />
      <polygon points="43,36 20,58 28,64 43,50" />
      <polygon points="57,36 80,58 72,64 57,50" />
      <ellipse cx="50" cy="15" rx="3" ry="4.5" fill="var(--bg)" opacity="0.8" />
      <rect x="48.75" y="24" width="2.5" height="40" fill="var(--bg)" opacity="0.5" />
      <polygon points="45,74 55,74 51,88 49,88" opacity="0.55" />
    </>
  ),
  battleship: ( // wide armored hull, three dorsal turrets, twin flank sponsons
    <>
      <polygon points="50,6 64,16 68,32 68,70 60,86 40,86 32,70 32,32 36,16" />
      <circle cx="50" cy="24" r="5" fill="var(--bg)" opacity="0.6" />
      <circle cx="50" cy="42" r="5" fill="var(--bg)" opacity="0.6" />
      <circle cx="50" cy="60" r="5" fill="var(--bg)" opacity="0.6" />
      <polygon points="18,38 32,42 32,64 18,60" />
      <polygon points="82,38 68,42 68,64 82,60" />
      <polygon points="42,80 58,80 54,92 46,92" opacity="0.5" />
    </>
  ),
  valkyrie: ( // legendary striker — narrow spear hull, sharp swept wings, hot triple engines
    <>
      <polygon points="50,3 56,16 56,70 50,84 44,70 44,16" />
      <polygon points="44,30 14,52 22,60 44,46" />
      <polygon points="56,30 86,52 78,60 56,46" />
      <polygon points="44,46 30,68 38,70 44,60" />
      <polygon points="56,46 70,68 62,70 56,60" />
      <ellipse cx="50" cy="14" rx="2.5" ry="4" fill="var(--bg)" opacity="0.85" />
      <polygon points="45,74 55,74 53,84 47,84" fill="var(--bg)" opacity="0.7" />
      <polygon points="46,85 54,85 50,98" opacity="0.55" />
    </>
  ),
  titan: ( // the roster's largest hull — layered capital spine, quad sponsons, heavy stern block
    <>
      <polygon points="50,2 62,10 66,26 66,76 58,92 42,92 34,76 34,26 38,10" />
      <polygon points="38,12 30,26 38,30" />
      <polygon points="62,12 70,26 62,30" />
      <polygon points="14,30 34,34 34,64 14,60" />
      <polygon points="86,30 66,34 66,64 86,60" />
      <rect x="48.75" y="6" width="2.5" height="20" fill="var(--bg)" opacity="0.6" />
      <circle cx="22" cy="42" r="2.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="22" cy="52" r="2.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="78" cy="42" r="2.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="78" cy="52" r="2.5" fill="var(--bg)" opacity="0.85" />
      <rect x="42.5" y="34" width="2.5" height="46" fill="var(--bg)" opacity="0.4" />
      <rect x="54.5" y="34" width="2.5" height="46" fill="var(--bg)" opacity="0.4" />
      <polygon points="40,88 48,88 46,96 42,96" opacity="0.5" />
      <polygon points="52,88 60,88 58,96 54,96" opacity="0.5" />
    </>
  ),

  // --- Support hulls (iteration 23) — retired iteration 36, un-retired
  // iteration 52 (see frames.ts's FrameId comment). Shapes unchanged. ---
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

// Iteration 37 (art pass): the enemy fleet gets its own design language,
// distinct from the player navy's winged-fuselage look — mandible prows,
// forward-swept fins, waisted insectoid hulls, claw arms. Same rendering
// rules as FRAME_SHAPES (dark recessed detail, glows only over
// transparent space).
const ENEMY_SHAPES: Record<EnemyArchetype, React.ReactNode> = {
  // Kept the sparest of the set — swarm renders 3-7 copies on screen at
  // once, so it's body + mandibles + eye, no engine glow to multiply.
  swarm: ( // insect dart — waisted body, twin mandible prongs reaching forward
    <>
      <polygon points="50,10 59,34 55,54 50,88 45,54 41,34" />
      <polygon points="44,16 33,4 39,22" />
      <polygon points="56,16 67,4 61,22" />
      <circle cx="50" cy="30" r="3" fill="var(--bg)" opacity="0.8" />
    </>
  ),
  frigate: ( // blade ship — waisted hull, fins swept FORWARD (the alien cue), visor slit
    <>
      <polygon points="50,6 59,18 55,44 59,78 50,88 41,78 45,44 41,18" />
      <polygon points="45,32 28,18 33,38 45,44" />
      <polygon points="55,32 72,18 67,38 55,44" />
      <rect x="46" y="20" width="8" height="3" fill="var(--bg)" opacity="0.8" />
      <polygon points="46.5,82 53.5,82 52,88 48,88" fill="var(--bg)" opacity="0.75" />
      <polygon points="46,89 54,89 50,98" opacity="0.5" />
    </>
  ),
  cruiser: ( // beetle warship — notched carapace hull, blade wings, paired eyes, twin engines
    <>
      <polygon points="50,8 66,24 62,50 66,72 50,86 34,72 38,50 34,24" />
      <polygon points="34,30 12,44 20,54 36,50" />
      <polygon points="66,30 88,44 80,54 64,50" />
      <polygon points="38,38 50,32 62,38 62,43 50,37 38,43" fill="var(--bg)" opacity="0.55" />
      <rect x="48.75" y="46" width="2.5" height="26" fill="var(--bg)" opacity="0.5" />
      <circle cx="44" cy="22" r="2.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="56" cy="22" r="2.5" fill="var(--bg)" opacity="0.85" />
      <polygon points="41,80 46,80 45,86 42,86" fill="var(--bg)" opacity="0.75" />
      <polygon points="54,80 59,80 58,86 55,86" fill="var(--bg)" opacity="0.75" />
      <polygon points="41.5,87 45.5,87 43.5,95" opacity="0.5" />
      <polygon points="54.5,87 58.5,87 56.5,95" opacity="0.5" />
    </>
  ),
  fortress: ( // gun platform — heavy octagon, four turret spurs, dark reactor ring, radial seams
    <>
      <polygon points="36,14 64,14 82,36 82,64 64,86 36,86 18,64 18,36" />
      <polygon points="45,4 55,4 50,15" />
      <polygon points="45,96 55,96 50,85" />
      <polygon points="4,45 4,55 15,50" />
      <polygon points="96,45 96,55 85,50" />
      <circle cx="50" cy="50" r="11" fill="none" stroke="var(--bg)" strokeWidth="3" opacity="0.55" />
      <circle cx="50" cy="50" r="3" fill="var(--bg)" opacity="0.7" />
      <rect x="24" y="48.75" width="52" height="2.5" fill="var(--bg)" opacity="0.4" />
      <rect x="48.75" y="24" width="2.5" height="52" fill="var(--bg)" opacity="0.4" />
      <circle cx="33" cy="30" r="2.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="67" cy="30" r="2.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="33" cy="70" r="2.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="67" cy="70" r="2.5" fill="var(--bg)" opacity="0.85" />
    </>
  ),
  boss: ( // crowned monstrosity — bulked hull with a notched waist, horn crown, claw arms, dark maw, wide exhaust
    <>
      <polygon points="50,4 64,12 72,34 68,56 74,76 58,92 42,92 26,76 32,56 28,34 36,12" />
      <polygon points="38,12 27,0 33,18" />
      <polygon points="62,12 73,0 67,18" />
      <polygon points="28,38 6,28 10,56 28,56" />
      <polygon points="72,38 94,28 90,56 72,56" />
      <polygon points="42,24 58,24 50,38" fill="var(--bg)" opacity="0.6" />
      <circle cx="43" cy="16" r="2.5" fill="var(--bg)" opacity="0.85" />
      <circle cx="57" cy="16" r="2.5" fill="var(--bg)" opacity="0.85" />
      <rect x="48.75" y="40" width="2.5" height="44" fill="var(--bg)" opacity="0.5" />
      <polygon points="43,88 47,88 46,93 44,93" fill="var(--bg)" opacity="0.75" />
      <polygon points="53,88 57,88 56,93 54,93" fill="var(--bg)" opacity="0.75" />
      <polygon points="42,94 58,94 50,100" opacity="0.35" />
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
