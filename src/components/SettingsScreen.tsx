import { setMotionSetting } from '../motionPreference';
import { useMotionSetting } from './useReducedMotion';

// The settings body, shared by the mobile tab and the desktop modal below —
// same reasoning (and same shape) as FleetOverlay/FleetScreen.
function settingsBody() {
  return <MotionSetting />;
}

// Motion lived in the HUD bar until it was moved here: it's a preference set
// once, not a readout worth a permanent slot in a bar that's meant for the
// run's live state (credits, heat).
function MotionSetting() {
  const motion = useMotionSetting();
  const reduced = motion === 'reduced';

  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <h3 className="settings-row__label">Motion</h3>
        <p className="settings-row__hint">
          {reduced
            ? 'Animations are off. Combat resolves instantly instead of replaying shot by shot.'
            : 'Combat replays shot by shot, with tracers, dice, and screen transitions.'}
        </p>
      </div>
      <button
        type="button"
        className="settings-row__toggle"
        onClick={() => setMotionSetting(reduced ? 'full' : 'reduced')}
        aria-pressed={!reduced}
        // Defaults to the system setting until it's set here even once, so
        // the copy shouldn't claim the player chose this.
        title={
          reduced
            ? 'Animations are off (following your system setting unless you change it here). Click to turn them on.'
            : 'Animations are on. Click to turn them off.'
        }
      >
        {reduced ? 'Off' : 'On'}
      </button>
    </div>
  );
}

// The mobile Settings tab — a full screen, no Close button, because the tab
// bar is the way out (same reasoning as the Chart and Fleet tabs).
export function SettingsScreen() {
  return (
    <div className="settings-screen">
      <h2>Settings</h2>
      {settingsBody()}
    </div>
  );
}

// Desktop has no tab bar, so the same body opens as a modal from the HUD
// bar's gear button — otherwise moving motion out of the HUD would have left
// desktop with no way to reach it at all.
export function SettingsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <h2>Settings</h2>
        </div>

        {settingsBody()}

        <button type="button" className="continue-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
