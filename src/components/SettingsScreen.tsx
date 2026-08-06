import { useState } from 'react';
import { setMotionSetting } from '../motionPreference';
import { setSoundSetting } from '../soundPreference';
import { playSfx } from '../audio';
import { getProtocol } from '../game/protocols';
import type { ProtocolId } from '../game/protocols';
import { seedToCode } from '../game/seedCode';
import { useMotionSetting } from './useReducedMotion';
import { useSoundSetting } from './useSoundSetting';

// The settings body, shared by the mobile tab and the desktop modal below —
// same reasoning (and same shape) as FleetOverlay/FleetScreen. `seed` is
// null for the daily run (see SeedRow) — everything else is unconditional.
function settingsBody(seed: number | null, protocols: ProtocolId[] | undefined) {
  return (
    <>
      <MotionSetting />
      <SoundSetting />
      {protocols?.map((id) => (
        <ProtocolRow key={id} protocolId={id} />
      ))}
      {seed !== null && <SeedRow seed={seed} />}
    </>
  );
}

// Iteration 28: the act-1 boss's protocol pick is a permanent, silent
// stat/pricing/combat hook everywhere else — this is its one visible
// readout for the rest of the run, since a pure stat change (a card
// picked once, columns ago) is otherwise easy to forget you have. Reuses
// the tier-accent classes ProtocolDraftScreen already defines rather than
// inventing a second color scheme for the same three tiers.
function ProtocolRow({ protocolId }: { protocolId: ProtocolId }) {
  const protocol = getProtocol(protocolId);
  return (
    <div className={`settings-row protocol-row protocol-row--${protocol.tier}`}>
      <div className="settings-row__text">
        <h3 className="settings-row__label">
          Protocol: {protocol.name}
          <span className="protocol-row__tier"> ({protocol.tier})</span>
        </h3>
        <p className="settings-row__hint">{protocol.blurb}</p>
        {protocol.cost && <p className="settings-row__hint protocol-row__cost">Cost: {protocol.cost}</p>}
      </div>
    </div>
  );
}

// Iteration 26 (daily suppression added in 27): lets a player copy the
// current run's seed code to share it (or save it themselves) — the
// counterpart to the landing screen's "start from a seed" input. Same code
// either way (seedCode.ts); this is just a read-only display of the run
// already in progress. The caller passes `seed: null` for a daily run —
// today's daily seed is the same for every player attempting it today
// (daily.ts's dailySeed), so surfacing it here would let a player look it
// up mid-attempt and effectively pre-scout the one sector everyone's
// supposed to be seeing cold.
function SeedRow({ seed }: { seed: number }) {
  const [copied, setCopied] = useState(false);
  const code = seedToCode(seed);

  function copy() {
    navigator.clipboard
      ?.writeText(code)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <h3 className="settings-row__label">Run seed</h3>
        <p className="settings-row__hint">
          Share this code so someone else (or you, later) can play this exact sector — same map, bosses, shops,
          and events.
        </p>
        <p className="settings-row__seed-code">{code}</p>
      </div>
      <button type="button" className="settings-row__toggle" onClick={copy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
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

// Kept as its own preference rather than tied to Motion — a player might
// want combat sound with animations off, or the reverse.
function SoundSetting() {
  const sound = useSoundSetting();
  const on = sound === 'on';

  function toggle() {
    const next = on ? 'off' : 'on';
    setSoundSetting(next);
    // Play the cue on the same click that turns it on, so switching it on
    // confirms itself immediately instead of waiting for the next fight.
    if (next === 'on') playSfx('effect');
  }

  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <h3 className="settings-row__label">Sound</h3>
        <p className="settings-row__hint">
          {on
            ? 'Combat plays short procedural cues — hits, misses, kills, victory/defeat.'
            : 'Sound effects are off.'}
        </p>
      </div>
      <button
        type="button"
        className="settings-row__toggle"
        onClick={toggle}
        aria-pressed={on}
        title={on ? 'Sound effects are on. Click to turn them off.' : 'Sound effects are off. Click to turn them on.'}
      >
        {on ? 'On' : 'Off'}
      </button>
    </div>
  );
}

// The mobile Settings tab — a full screen, no Close button, because the tab
// bar is the way out (same reasoning as the Chart and Fleet tabs).
export function SettingsScreen({ seed, protocols }: { seed: number | null; protocols?: ProtocolId[] }) {
  return (
    <div className="settings-screen">
      <h2>Settings</h2>
      {settingsBody(seed, protocols)}
    </div>
  );
}

// Desktop has no tab bar, so the same body opens as a modal from the HUD
// bar's gear button — otherwise moving motion out of the HUD would have left
// desktop with no way to reach it at all.
export function SettingsOverlay({
  seed,
  protocols,
  onClose,
}: {
  seed: number | null;
  protocols?: ProtocolId[];
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <h2>Settings</h2>
        </div>

        {settingsBody(seed, protocols)}

        <button type="button" className="continue-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
