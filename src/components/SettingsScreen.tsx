import { useState } from 'react';
import { isTutorialDisabled, setTutorialDisabled } from '../onboardingProgress';
import { setMotionSetting } from '../motionPreference';
import { setSoundSetting } from '../soundPreference';
import { playSfx } from '../audio';
import { getCounterProtocol } from '../game/counterProtocols';
import type { CounterProtocolId } from '../game/counterProtocols';
import { getProtocol } from '../game/protocols';
import type { ProtocolId } from '../game/protocols';
import { seedToCode } from '../game/seedCode';
import { AdaptivePanel } from './AdaptivePanel';
import { useCopyToClipboard } from './useCopyToClipboard';
import { useMotionSetting } from './useReducedMotion';
import { useSoundSetting } from './useSoundSetting';

// The settings body, shared by the mobile tab and the desktop modal below —
// same reasoning (and same shape) as FleetOverlay/FleetScreen. `seed` is
// null for the daily run (see SeedRow) — everything else is unconditional.
function settingsBody(seed: number | null, protocols: ProtocolId[] | undefined, counterProtocol: CounterProtocolId | undefined) {
  return (
    <>
      <MotionSetting />
      <SoundSetting />
      <TutorialSetting />
      {protocols?.map((id) => (
        <ProtocolRow key={id} protocolId={id} />
      ))}
      {counterProtocol && <CounterProtocolRow counterProtocolId={counterProtocol} />}
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
// Exported (iteration 29.4) so FleetOverlay/FleetScreen can show the same
// readout — a player checking "what do I have" in the fleet view shouldn't
// have to go find Settings to remember which protocol they picked.
export function ProtocolRow({ protocolId }: { protocolId: ProtocolId }) {
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

// Iteration 30: the same permanent-readout reasoning as ProtocolRow above,
// for act 2's answer to it — mid-act-2 the player can re-check what the
// enemy has without entering a fight. Exported for the same reason
// ProtocolRow is (FleetOverlay/FleetScreen/FleetPanel show it too).
export function CounterProtocolRow({ counterProtocolId }: { counterProtocolId: CounterProtocolId }) {
  const counter = getCounterProtocol(counterProtocolId);
  return (
    <div className={`settings-row protocol-row protocol-row--${counter.tier} protocol-row--counter`}>
      <div className="settings-row__text">
        <h3 className="settings-row__label">
          Enemy answer: {counter.name}
          <span className="protocol-row__tier"> ({counter.tier})</span>
        </h3>
        <p className="settings-row__hint">{counter.blurb}</p>
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
  const [copied, copy] = useCopyToClipboard();
  const code = seedToCode(seed);

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
      <button type="button" className="settings-row__toggle" onClick={() => copy(code)}>
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

// Suppresses the automatic contextual popups (dice roll / missiles /
// piloting — OnboardingPopup.tsx) outright, for a player who's already
// past needing them. The on-demand "How to play" reference (the "?"
// button) is unaffected — this only stops things from appearing unasked.
// Plain local state, not a shared hook like Motion/Sound above: nothing
// else in the UI needs to react live to this changing.
function TutorialSetting() {
  const [disabled, setDisabled] = useState(isTutorialDisabled);

  function toggle(checked: boolean) {
    setDisabled(checked);
    setTutorialDisabled(checked);
  }

  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <h3 className="settings-row__label">
          <label className="settings-row__checkbox-label">
            <input
              type="checkbox"
              checked={disabled}
              onChange={(e) => toggle(e.target.checked)}
            />
            Dismiss tutorial popups
          </label>
        </h3>
        <p className="settings-row__hint">
          Skips the dice-roll/missiles/piloting popups that pop up the first time each matters in a fight. The "How
          to play" reference is still there if you want it.
        </p>
      </div>
    </div>
  );
}

// The mobile Settings tab — a full screen.
// Iteration 35: gained a real Back button — dropping the Mission tab
// removed the tab bar's own way back to it, so every mobile full-screen
// tab needs its own now (matching MapScreen's existing "Close" pattern).
// 47.3g: the mobile-tab (SettingsScreen) / desktop-modal (SettingsOverlay)
// split is now one component picking its shell via AdaptivePanel —
// isCompact decides which (desktop has no tab bar, so it needs a modal
// reachable from the HUD bar's gear button; otherwise moving motion out of
// the HUD would have left desktop with no way to reach it at all). Was
// two separate exported components.
export function SettingsScreen({
  seed,
  protocols,
  counterProtocol,
  isCompact,
  onClose,
}: {
  seed: number | null;
  protocols?: ProtocolId[];
  counterProtocol?: CounterProtocolId;
  isCompact: boolean;
  onClose?: () => void;
}) {
  return (
    <AdaptivePanel title="Settings" isCompact={isCompact} screenClassName="settings-screen" onClose={onClose}>
      {settingsBody(seed, protocols, counterProtocol)}
    </AdaptivePanel>
  );
}
