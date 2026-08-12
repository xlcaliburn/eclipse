import type { SlotKind } from '../game/frames';
import type { Part } from '../game/types';

// Iteration 10.3: one code-authored glyph per part type (cannon and missile
// are split from the single 'weapon' Part.type via `weapon.kind`, since
// that's where the game data actually distinguishes them). All share a
// 0-100 viewBox, stroke-based so they read at small hardpoint-socket sizes.

const CANNON_GLYPH = (
  <>
    <rect x="15" y="42" width="55" height="16" rx="2" />
    <polygon points="70,32 92,50 70,68" />
  </>
);

const MISSILE_GLYPH = (
  <>
    <polygon points="50,8 64,58 50,48 36,58" />
    <polygon points="40,58 60,58 50,92" />
  </>
);

const COMPUTER_GLYPH = (
  <>
    <rect x="28" y="28" width="44" height="44" rx="4" />
    <rect x="40" y="40" width="20" height="20" />
    <line x1="50" y1="8" x2="50" y2="28" />
    <line x1="50" y1="72" x2="50" y2="92" />
    <line x1="8" y1="50" x2="28" y2="50" />
    <line x1="72" y1="50" x2="92" y2="50" />
  </>
);

const SHIELD_GLYPH = (
  <path d="M50,8 L85,24 L85,52 Q85,80 50,94 Q15,80 15,52 L15,24 Z" />
);

const HULL_GLYPH = <polygon points="50,12 82,32 82,68 50,88 18,68 18,32" />;

const DRIVE_GLYPH = (
  <>
    <polygon points="32,15 68,15 50,55" />
    <line x1="50" y1="60" x2="50" y2="75" />
    <line x1="50" y1="80" x2="50" y2="92" />
  </>
);

const CARGO_GLYPH = (
  <>
    <rect x="15" y="30" width="70" height="55" rx="3" />
    <line x1="15" y1="48" x2="85" y2="48" />
  </>
);

const ACTIVE_SPARK_GLYPH = (
  <polygon points="50,6 59,38 92,50 59,62 50,94 41,62 8,50 41,38" />
);

// Iteration 60.8: a classic lightning-bolt zigzag, deliberately distinct
// from the 8-point active-ability burst above — power and "has a
// once-per-combat button" are different concepts and shouldn't share a
// glyph. Used by PowerPipRow (now an icon + fraction, not a pip meter).
const POWER_BOLT_GLYPH = <polygon points="56,4 22,54 46,54 40,96 82,40 54,40" />;

// 2026-08-12: a reactor's icon is now the same lightning-bolt glyph the
// power meter uses (POWER_BOLT_GLYPH, above) — "this part generates
// power" and "this is what power looks like" read as one visual idea
// instead of two unrelated ones. Replaces the old concentric-rings glyph.
const TYPE_GLYPHS: Record<Exclude<Part['type'], 'weapon'>, React.ReactNode> = {
  computer: COMPUTER_GLYPH,
  shield: SHIELD_GLYPH,
  hull: HULL_GLYPH,
  drive: DRIVE_GLYPH,
  cargo: CARGO_GLYPH,
  reactor: POWER_BOLT_GLYPH,
};

function glyphFor(part: Part): React.ReactNode {
  if (part.type === 'weapon') {
    return part.weapon?.kind === 'missile' ? MISSILE_GLYPH : CANNON_GLYPH;
  }
  return TYPE_GLYPHS[part.type];
}

interface PartIconProps {
  part: Part;
  size?: number;
  className?: string;
}

export function PartIcon({ part, size = 20, className }: PartIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`part-icon${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {glyphFor(part)}
    </svg>
  );
}

// Iteration 52.2: one glyph per SLOT KIND (as opposed to TYPE_GLYPHS above,
// which is per PART type) — an empty slot's icon deliberately reuses the
// same shapes so a "weapon slot waiting to be filled" and an actual weapon
// part read as one visual family, not two unrelated icon sets. `defense`
// reuses the shield glyph, `systems` the computer glyph, `universal` the
// cargo glyph (the one PartType universal slots exist to guarantee room
// for) — see SlotRow.tsx for where this renders.
const SLOT_KIND_GLYPH: Record<SlotKind, React.ReactNode> = {
  weapon: CANNON_GLYPH,
  defense: SHIELD_GLYPH,
  systems: COMPUTER_GLYPH,
  universal: CARGO_GLYPH,
};

export function SlotKindIcon({ kind, size = 20, className }: { kind: SlotKind; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`part-icon${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {SLOT_KIND_GLYPH[kind]}
    </svg>
  );
}

// The active-ability spark, standalone — used on the "Ship actives" combat
// buttons rather than on a specific part's type.
export function ActiveSparkIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`part-icon${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {ACTIVE_SPARK_GLYPH}
    </svg>
  );
}

// Iteration 60.8: the power meter's icon — standalone, like ActiveSparkIcon
// above, since it labels a fraction rather than a specific part's type.
export function PowerBoltIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`part-icon${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {POWER_BOLT_GLYPH}
    </svg>
  );
}
