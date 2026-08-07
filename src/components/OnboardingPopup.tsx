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
const CONTENT: Record<OnboardingKey, { title: string; body: React.ReactNode }> = {
  diceRoll: {
    title: 'The dice roll',
    body: (
      <>
        <p className="tutorial-row__hint">
          Every shot rolls one 6-sided die. A natural <strong>6</strong> always hits, no matter what. A natural{' '}
          <strong>1</strong> always misses, no matter what. Anything else hits if:
        </p>
        <p className="tutorial-row__formula">roll + Computer − Piloting ≥ 6</p>
        <p className="tutorial-row__hint">
          The combat log shows this math on every roll as it happens — including a callout whenever a target's
          Piloting fully cancels out your Computer (only a natural 6 gets through then).
        </p>
      </>
    ),
  },
  missiles: {
    title: 'Missiles',
    body: (
      <p className="tutorial-row__hint">
        Before the first cannon round, one missile phase fires — only because at least one fleet here is actually
        carrying missiles (it's skipped outright otherwise). Missiles roll the same hit math as cannons, but
        there's no return fire that phase: it's a free opening volley, not a trade. Flak batteries can shoot
        missile dice down before they land, cancelling them before they're even rolled.
      </p>
    ),
  },
  piloting: {
    title: 'Piloting',
    body: (
      <p className="tutorial-row__hint">
        Subtracted from the attacker's roll before it's checked against your ship. Higher Piloting makes a ship
        harder to hit — but a natural 6 ignores it completely, so piloting alone is never a perfect wall.
      </p>
    ),
  },
};

export function OnboardingPopup({ topic, onClose }: OnboardingPopupProps) {
  const { title, body } = CONTENT[topic];
  return (
    <div className="modal-backdrop" onClick={onClose}>
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
