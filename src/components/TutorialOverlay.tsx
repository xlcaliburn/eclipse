// Iteration 25: a short, static reference for the combat math — every
// number here is quoted straight from the engine (resolver.ts's
// `resolveHit`, combatEngine.ts's `OUTSPEED_GAP`), not re-derived, so it
// can't quietly drift out of sync with what a fight actually does.
interface TutorialOverlayProps {
  onClose: () => void;
}

function TutorialBody() {
  return (
    <div className="tutorial-body">
      <section className="tutorial-row">
        <h3 className="tutorial-row__label">The dice roll</h3>
        <p className="tutorial-row__hint">
          Every shot rolls one 6-sided die. A natural <strong>6</strong> always hits, no matter what. A natural{' '}
          <strong>1</strong> always misses, no matter what. Anything else hits if:
        </p>
        <p className="tutorial-row__formula">roll + Computer − Shield ≥ 6</p>
        <p className="tutorial-row__hint">
          Example: your Computer is 2, their Shield is 1. Roll a 4 → 4 + 2 − 1 = 5, not enough — miss. Roll a 5 →
          5 + 2 − 1 = 6 — hit.
        </p>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">Computer</h3>
        <p className="tutorial-row__hint">
          Added to every attack roll your ship makes. Higher Computer means more of your rolls clear the ≥6
          threshold — it's straight-up accuracy.
        </p>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">Shield</h3>
        <p className="tutorial-row__hint">
          Subtracted from the attacker's roll before it's checked against that ship. Higher Shield makes a ship
          harder to hit — but a natural 6 ignores it completely, so shields alone are never a perfect wall.
        </p>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">Initiative &amp; Outspeed</h3>
        <p className="tutorial-row__hint">
          Every ship on the field acts in initiative order, fastest first, each round. If your ship's initiative
          beats the fastest surviving enemy ship's by <strong>4 or more</strong>, it fires a bonus cannon shot that
          same round — worth building toward on a ship you want landing extra hits.
        </p>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">HP &amp; the round structure</h3>
        <p className="tutorial-row__hint">
          A fight opens with one missile phase (skipped if nobody's carrying missiles), then cannon rounds repeat —
          every ship fires, in initiative order — until one whole side is destroyed. A ship is out once its damage
          reaches its HP. A fight that somehow drags past 30 rounds is called for the enemy.
        </p>
      </section>
    </div>
  );
}

export function TutorialOverlay({ onClose }: TutorialOverlayProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
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
