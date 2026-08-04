import type { CommanderId } from '../game/commanders';

// One crest per commander, in the same code-authored inline-SVG idiom as
// ShipSilhouette: a 0-100 viewBox, shapes filled with currentColor so the
// card's own color drives the tint. Each crest reads as the system that
// commander biases — trade, repair, war, intel.
const CREST_SHAPES: Record<CommanderId, React.ReactNode> = {
  // Balance scale over a coin — trade and margins.
  merchant: (
    <>
      <rect x="47" y="24" width="6" height="46" />
      <rect x="20" y="30" width="60" height="5" />
      <circle cx="50" cy="22" r="7" />
      <polygon points="20,35 34,35 27,54" />
      <polygon points="66,35 80,35 73,54" />
      <rect x="32" y="72" width="36" height="6" />
    </>
  ),
  // Cog with a hollow hub — maintenance and repair.
  engineer: (
    <>
      <path
        d="M50 14 L58 20 L68 17 L72 27 L82 31 L79 41 L86 50 L79 59 L82 69 L72 73 L68 83 L58 80 L50 86 L42 80 L32 83 L28 73 L18 69 L21 59 L14 50 L21 41 L18 31 L28 27 L32 17 L42 20 Z"
        fillRule="evenodd"
      />
      <circle cx="50" cy="50" r="13" fill="var(--panel)" />
    </>
  ),
  // Crossed blades over a chevron — a fleet that starts already fighting.
  warlord: (
    <>
      <polygon points="24,20 32,16 62,62 54,68" />
      <polygon points="76,20 68,16 38,62 46,68" />
      <polygon points="50,70 78,88 50,82 22,88" />
    </>
  ),
  // Sensor eye — vision reaching further than anyone else's.
  spymaster: (
    <>
      <path d="M8 50 Q50 18 92 50 Q50 82 8 50 Z" />
      <circle cx="50" cy="50" r="15" fill="var(--panel)" />
      <circle cx="50" cy="50" r="7" />
    </>
  ),
  // Three equal-sized hulls abreast — a wide fleet, not one bigger ship
  // (the distinction from the Warlord's single pair of crossed blades).
  admiral: (
    <>
      <polygon points="20,30 28,42 28,68 20,80 12,68 12,42" />
      <polygon points="50,22 58,34 58,76 50,90 42,76 42,34" />
      <polygon points="80,30 88,42 88,68 80,80 72,68 72,42" />
    </>
  ),
};

export function CommanderCrest({ commanderId, size = 64 }: { commanderId: CommanderId; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="commander-crest" aria-hidden="true">
      {CREST_SHAPES[commanderId]}
    </svg>
  );
}
