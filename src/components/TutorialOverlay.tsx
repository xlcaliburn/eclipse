// Iteration 25: a short, static reference for the combat math — every
// number here is quoted straight from the engine (resolver.ts's
// `resolveHit`, combatEngine.ts's `OUTSPEED_GAP`), not re-derived, so it
// can't quietly drift out of sync with what a fight actually does.
import { WeaponDie } from './Die';

interface TutorialOverlayProps {
  onClose: () => void;
}

// Iteration 38: trimmed hard — this used to be a paragraph per section.
// One line each, dice examples doing the rest of the explaining visually.
function TutorialBody() {
  return (
    <div className="tutorial-body">
      <section className="tutorial-row">
        <h3 className="tutorial-row__label">The dice roll</h3>
        <p className="tutorial-row__formula">roll + Computer − Piloting ≥ 6</p>
        <p className="tutorial-row__hint">Natural 6 always hits. Natural 1 always misses.</p>
        <div className="tutorial-dice-example">
          <WeaponDie damage={2} kind="cannon" size={26} />
          <span className="tutorial-dice-example__caption">= damage per hit, not a roll.</span>
        </div>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">Missiles</h3>
        <p className="tutorial-row__hint">One free opening volley, no return fire. Flak can shoot them down first.</p>
        <div className="tutorial-dice-example">
          <WeaponDie damage={1} kind="missile" size={26} />
          <span className="tutorial-dice-example__caption">dashed ring = missile die.</span>
        </div>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">Outspeed</h3>
        <p className="tutorial-row__hint">Beat the enemy's fastest ship by 4+ initiative for a bonus shot.</p>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">Rounds</h3>
        <p className="tutorial-row__hint">Missile phase, then cannon rounds until one side's wiped.</p>
      </section>
    </div>
  );
}

export function TutorialOverlay({ onClose }: TutorialOverlayProps) {
  return (
    // modal-backdrop--tutorial (iteration 35, redone iteration 38): this can
    // open mid-combat — a small floating card, not a modal, so it never
    // darkens or covers the fight underneath (see styles.css: transparent,
    // click-through backdrop; the card itself is the only interactive part).
    <div className="modal-backdrop modal-backdrop--tutorial">
      <div className="modal-panel tutorial-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <h2>How to play</h2>
        </div>
        <TutorialBody />
        <button type="button" className="continue-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
