import { heatTier, MAX_HEAT } from '../game/heat';
import { setMotionSetting } from '../motionPreference';
import { useMotionSetting } from './useReducedMotion';

interface HudBarProps {
  credits: number;
  heat: number;
  // Omitted wherever a map peek makes no sense (on the map itself, or once
  // the run is over) — the button simply isn't rendered.
  onViewMap?: () => void;
}

// Iteration 10.6: a persistent top-bar HUD readout, always visible once a
// run's economy is live. This is the single place credits/intel are shown —
// per-screen copies were removed once this bar existed.
// Iteration 15.2: joined by the heat track — kept quiet by design (a bare
// 4-pip gauge, no number), with the tier word and "Hunted" warning only
// surfacing in the tooltip/pip tint.
export function HudBar({ credits, heat, onViewMap }: HudBarProps) {
  const motion = useMotionSetting();
  const reduced = motion === 'reduced';
  const tier = heatTier(heat);
  const armed = heat >= MAX_HEAT;

  return (
    <div className="hud-bar">
      {onViewMap && (
        <button type="button" className="hud-bar__map-button" onClick={onViewMap}>
          Map
        </button>
      )}
      <button
        type="button"
        className="hud-bar__motion-button"
        onClick={() => setMotionSetting(reduced ? 'full' : 'reduced')}
        aria-pressed={!reduced}
        title={
          reduced
            ? 'Animations are off (following your system setting unless you change it here). Click to turn them on.'
            : 'Animations are on. Click to turn them off.'
        }
      >
        Motion: {reduced ? 'off' : 'on'}
      </button>
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
