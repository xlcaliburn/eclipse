import { getCommander } from '../game/commanders';
import type { CommanderId } from '../game/commanders';
import { heatTier, MAX_HEAT } from '../game/heat';
import { CommanderCrest } from './CommanderCrest';

interface HudBarProps {
  credits: number;
  heat: number;
  // The commander is picked once and then never shown again — the crest here
  // is the only persistent reminder of which run-wide perk is active.
  // Optional because it's unset until the 'commander' phase resolves.
  commanderId?: CommanderId;
  daily?: boolean; // iteration 18: this run is today's one-attempt daily
  // Omitted wherever a map peek makes no sense (on the map itself, or once
  // the run is over) — the button simply isn't rendered.
  onViewMap?: () => void;
  // Iteration 22.6-ui: mobile also reaches settings through this gear now
  // (moved off the bottom tab bar) — same button on both, not a
  // desktop-only affordance anymore.
  onOpenSettings?: () => void;
}

// Iteration 10.6: a persistent top-bar HUD readout, always visible once a
// run's economy is live. This is the single place credits/intel are shown —
// per-screen copies were removed once this bar existed.
// Iteration 15.2: joined by the heat track — kept quiet by design (a bare
// 4-pip gauge, no number), with the tier word and "Hunted" warning only
// surfacing in the tooltip/pip tint.
export function HudBar({ credits, heat, commanderId, daily, onViewMap, onOpenSettings }: HudBarProps) {
  const tier = heatTier(heat);
  const armed = heat >= MAX_HEAT;
  const commander = commanderId ? getCommander(commanderId) : null;

  return (
    <div className="hud-bar">
      {onViewMap && (
        <button type="button" className="hud-bar__map-button" onClick={onViewMap}>
          Map
        </button>
      )}
      {daily && (
        <span className="hud-bar__daily-chip" title="Today's daily run — one attempt, same sector for everyone.">
          DAILY
        </span>
      )}
      {commander && (
        // The perk itself is passive and run-long, so this is a readout, not
        // a control — the name is carried for screen readers and the tooltip
        // spells out what the perk actually does, since the pick screen is
        // long gone by the time anyone wonders.
        <span
          className="hud-bar__commander"
          title={`${commander.name} — ${commander.description}`}
        >
          <CommanderCrest commanderId={commander.id} size={18} />
          <span className="hud-bar__commander-name">{commander.name}</span>
        </span>
      )}
      {onOpenSettings && (
        <button
          type="button"
          className="hud-bar__settings-button"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      )}
      <div
        className={`hud-bar__heat${armed ? ' hud-bar__heat--hunted' : ''}`}
        title={`Heat: ${tier}${armed ? ' — the next stop you make, they find you.' : ''}`}
      >
        {Array.from({ length: MAX_HEAT }, (_, i) => (
          <span key={i} className={`hud-bar__heat-pip${i < heat ? ' hud-bar__heat-pip--filled' : ''}`} />
        ))}
      </div>
      <span className="hud-bar__counter hud-bar__counter--credits">{credits} cr</span>
    </div>
  );
}
