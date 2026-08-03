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
function MissionGlyph() {
  return (
    <svg viewBox="0 0 100 100" width={20} height={20} aria-hidden="true">
      <circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" strokeWidth="9" />
      <line x1="50" y1="2" x2="50" y2="24" stroke="currentColor" strokeWidth="9" />
      <line x1="50" y1="76" x2="50" y2="98" stroke="currentColor" strokeWidth="9" />
      <line x1="2" y1="50" x2="24" y2="50" stroke="currentColor" strokeWidth="9" />
      <line x1="76" y1="50" x2="98" y2="50" stroke="currentColor" strokeWidth="9" />
    </svg>
  );
}

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

// Eight spokes on the same 0-100 viewBox — a gear reads as settings at 20px
// where a more literal one would just be mush.
function SettingsGlyph() {
  return (
    <svg viewBox="0 0 100 100" width={20} height={20} aria-hidden="true">
      <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="9" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        return (
          <line
            key={i}
            x1={50 + cos * 30}
            y1={50 + sin * 30}
            x2={50 + cos * 44}
            y2={50 + sin * 44}
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
        );
      })}
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
        className={cls('mission')}
        aria-current={surface === 'mission' ? 'page' : undefined}
        onClick={() => onSelect('mission')}
      >
        <MissionGlyph />
        <span className="tab-bar__label">Mission</span>
      </button>
      <button
        type="button"
        className={cls('chart')}
        aria-current={surface === 'chart' ? 'page' : undefined}
        onClick={() => onSelect('chart')}
      >
        <ChartGlyph />
        <span className="tab-bar__label">Chart</span>
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
      <button
        type="button"
        className={cls('settings')}
        aria-current={surface === 'settings' ? 'page' : undefined}
        onClick={() => onSelect('settings')}
      >
        <SettingsGlyph />
        <span className="tab-bar__label">Settings</span>
      </button>
    </nav>
  );
}
