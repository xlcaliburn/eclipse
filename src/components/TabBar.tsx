// 'settings' stays a valid surface (App.tsx still renders SettingsScreen for
// it) — only the tab bar's own button for it is gone, per the change below.
export type Surface = 'mission' | 'chart' | 'fleet' | 'settings';

interface TabBarProps {
  surface: Surface;
  onSelect: (surface: Surface) => void;
}

// Iteration 16.1: mobile navigation shell, fixed to the bottom at ≤720px
// (see .tab-bar in styles.css — the bar only ever mounts when App's
// useIsCompact() is true, so there's no need for the CSS itself to also
// gate on width). Glyphs are code-authored inline SVG on the shared 0-100
// viewBox used throughout (NodeGlyph, ShipSilhouette), tinted via
// currentColor so the active tab just recolors — no separate art per state.
//
// Settings used to be a fourth tab here; it moved to the top HudBar's gear
// button (already built for desktop) so mobile reaches it the same way —
// one tap on a persistent icon, not a dedicated slot in the primary nav.
//
// Iteration 35: Mission followed Settings out — it was the redundant one
// once you actually count taps: it's already the surface every phase
// change snaps back to (see App.tsx's phase-keyed reset effect), so it
// only ever earned its own tab as the sole way *back* from Map/Fleet.
// That's now a Back button on each of those screens instead (same "close
// button whenever onClose is provided" pattern MapScreen already used for
// desktop) — a home tab that's also the only way home was circular; an
// explicit Back reads clearer than a tab that means "here, but also away."
function ChartGlyph() {
  return (
    <svg viewBox="0 0 100 100" width={20} height={20} aria-hidden="true">
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="9" />
      <circle cx="50" cy="50" r="13" fill="currentColor" />
    </svg>
  );
}

function FleetGlyph() {
  return (
    <svg viewBox="0 0 100 100" width={20} height={20} aria-hidden="true">
      <polygon points="50,6 66,28 66,72 50,94 34,72 34,28" fill="currentColor" />
      <polygon points="34,42 10,56 34,64" fill="currentColor" />
      <polygon points="66,42 90,56 66,64" fill="currentColor" />
    </svg>
  );
}

export function TabBar({ surface, onSelect }: TabBarProps) {
  function cls(id: Surface): string {
    return `tab-bar__button${surface === id ? ' tab-bar__button--active' : ''}`;
  }

  return (
    <nav className="tab-bar" aria-label="Screens">
      <button
        type="button"
        className={cls('chart')}
        aria-current={surface === 'chart' ? 'page' : undefined}
        onClick={() => onSelect('chart')}
      >
        <ChartGlyph />
        <span className="tab-bar__label">Map</span>
      </button>
      <button
        type="button"
        className={cls('fleet')}
        aria-current={surface === 'fleet' ? 'page' : undefined}
        onClick={() => onSelect('fleet')}
      >
        <FleetGlyph />
        <span className="tab-bar__label">Fleet</span>
      </button>
    </nav>
  );
}
