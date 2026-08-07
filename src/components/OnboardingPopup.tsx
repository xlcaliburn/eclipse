import { DieFace, WeaponDie } from './Die';
import type { OnboardingKey } from '../onboardingProgress';

interface OnboardingPopupProps {
  topic: OnboardingKey;
  onClose: () => void;
}

// Iteration 29: contextual, first-run-only popups that replace "a tutorial
// link you have to remember to open" — each fires the first time its topic
// actually matters (see CombatScreen's nextOnboardingPopup), not before.
// Content deliberately mirrors TutorialOverlay's matching sections (same
// facts, same numbers) — that overlay stays reachable on demand for anyone
// who dismissed a popup without reading it or wants to re-check later.
// Iteration 38: trimmed hard — one line per topic, the dice/formula doing
// the rest of the explaining visually rather than in prose.
const CONTENT: Record<OnboardingKey, { title: string; body: React.ReactNode }> = {
  diceRoll: {
    title: 'The dice roll',
    body: (
      <>
        <p className="tutorial-row__formula">roll + Computer − Piloting ≥ 6</p>
        <p className="tutorial-row__hint">Natural 6 always hits. Natural 1 always misses.</p>
        <div className="tutorial-dice-example">
          <WeaponDie damage={2} kind="cannon" size={24} />
          <span className="tutorial-dice-example__caption">= damage per hit, not a roll.</span>
          <DieFace value={6} size={24} />
          <span className="tutorial-dice-example__caption">always hits.</span>
        </div>
      </>
    ),
  },
  missiles: {
    title: 'Missiles',
    body: (
      <>
        <p className="tutorial-row__hint">One free opening volley before cannons — no return fire that phase.</p>
        <div className="tutorial-dice-example">
          <WeaponDie damage={1} kind="missile" size={24} />
          <span className="tutorial-dice-example__caption">dashed ring = missile die.</span>
        </div>
      </>
    ),
  },
  piloting: {
    title: 'Piloting',
    body: (
      <p className="tutorial-row__hint">Subtracts from the enemy's roll against you. A natural 6 ignores it.</p>
    ),
  },
};

export function OnboardingPopup({ topic, onClose }: OnboardingPopupProps) {
  const { title, body } = CONTENT[topic];
  return (
    // modal-backdrop--tutorial (iteration 35, redone iteration 38): these
    // fire mid-combat — a small floating card, not a modal, so it never
    // darkens or covers the fight underneath (see styles.css: transparent,
    // click-through backdrop; the card itself is the only interactive part).
    <div className="modal-backdrop modal-backdrop--tutorial">
      <div className="modal-panel tutorial-overlay onboarding-popup" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <h2>{title}</h2>
        </div>
        <div className="tutorial-body">
          <section className="tutorial-row">{body}</section>
        </div>
        <button type="button" className="continue-button" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
