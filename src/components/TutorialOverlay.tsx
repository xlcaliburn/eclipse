// Iteration 25: a short, static reference for the combat math — every
// number here is quoted straight from the engine (resolver.ts's
// `resolveHit`, combatEngine.ts's `OUTSPEED_GAP`), not re-derived, so it
// can't quietly drift out of sync with what a fight actually does.
import { DieFace, WeaponDie } from './Die';

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
        <p className="tutorial-row__formula">roll + Computer − Piloting ≥ 6</p>
        <p className="tutorial-row__hint">
          Example: your Computer is 2, their Piloting is 1. Roll a 4 → 4 + 2 − 1 = 5, not enough — miss. Roll a 5 →
          5 + 2 − 1 = 6 — hit. The combat log shows this math on every roll, including a callout on any roll where
          Piloting fully cancels out your Computer (only a natural 6 gets through then).
        </p>
        <div className="tutorial-dice-example">
          <WeaponDie damage={2} kind="cannon" size={30} />
          <span className="tutorial-dice-example__caption">
            This is what a die on a ship's readout looks like — the number is its <strong>damage</strong>, not a
            roll. This one deals 2 damage per hit. Every attack still rolls its own fresh d6 against the ≥6
            threshold above —
          </span>
          <DieFace value={6} size={30} />
          <span className="tutorial-dice-example__caption">a natural 6 always hits, no matter the math.</span>
        </div>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">Computer</h3>
        <p className="tutorial-row__hint">
          Added to every attack roll your ship makes. Higher Computer means more of your rolls clear the ≥6
          threshold — it's straight-up accuracy.
        </p>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">Piloting</h3>
        <p className="tutorial-row__hint">
          Subtracted from the attacker's roll before it's checked against your ship. Higher Piloting makes a ship
          harder to hit — but a natural 6 ignores it completely, so piloting alone is never a perfect wall.
        </p>
      </section>

      <section className="tutorial-row">
        <h3 className="tutorial-row__label">Missiles</h3>
        <p className="tutorial-row__hint">
          Before the first cannon round, one missile phase fires — only if at least one fleet is actually carrying
          missiles (skipped outright otherwise). Missiles roll the same hit math as cannons, but there's no return
          fire that phase: it's a free opening volley, not a trade. Flak batteries can shoot missile dice down
          before they land, cancelling them before they're even rolled.
        </p>
        <div className="tutorial-dice-example">
          <WeaponDie damage={1} kind="missile" size={30} />
          <span className="tutorial-dice-example__caption">
            A missile die on a ship's readout — the dashed ring (vs. a cannon die's solid one) is how you tell them
            apart at a glance. This one deals 1 damage, fired once, in the opening volley only.
          </span>
        </div>
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
    // modal-backdrop--tutorial (iteration 35): this can open mid-combat —
    // bottom-anchored on mobile so it doesn't sit over the fleet cards up
    // top, the exact thing a player might be checking the rules against.
    <div className="modal-backdrop modal-backdrop--tutorial" onClick={onClose}>
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
