import { setMotionSetting } from '../motionPreference';
import { useMotionSetting } from './useReducedMotion';

interface HudBarProps {
  credits: number;
  // Omitted wherever a map peek makes no sense (on the map itself, or once
  // the run is over) — the button simply isn't rendered.
  onViewMap?: () => void;
}

// Iteration 10.6: a persistent top-bar HUD readout, always visible once a
// run's economy is live. This is the single place credits/intel are shown —
// per-screen copies were removed once this bar existed.
export function HudBar({ credits, onViewMap }: HudBarProps) {
  const motion = useMotionSetting();
  const reduced = motion === 'reduced';

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
      <span className="hud-bar__counter hud-bar__counter--credits">{credits} cr</span>
    </div>
  );
}
