import type { FrameId } from '../game/frames';
import { getFrame } from '../game/frames';
import { FrameSilhouette } from './ShipSilhouette';

interface InterludeReinforcementScreenProps {
  options: Exclude<FrameId, 'cruiser'>[];
  onChoose: (frameId: Exclude<FrameId, 'cruiser'>) => void;
}

// Iteration 64.4: a one-time follow-on to InterludeScreen, only shown when
// the fleet crossed into act 2 under 3 commissioned hulls — a free
// common-tier replacement hull, seeded 1-of-2, arriving with its starting
// fit. No credit interaction; picking is the only action here.
export function InterludeReinforcementScreen({ options, onChoose }: InterludeReinforcementScreenProps) {
  return (
    <div className="interlude-screen">
      <h2>Reinforcements arrive</h2>
      <p className="hint">
        The fleet is under strength heading into act two. Command has released one replacement hull, free of
        charge — pick one.
      </p>

      <div className="interlude-screen__ship-picks">
        <div className="ship-picks">
          {options.map((frameId) => {
            const frame = getFrame(frameId);
            return (
              <button key={frameId} type="button" className="shop-button" onClick={() => onChoose(frameId)} title={frame.blurb}>
                <FrameSilhouette frameId={frameId} size={24} />
                {frame.name}
                {/* 2026-08-13: same baseHp gap as the shipyard's frame-card
                    (ShopScreen) — this picker has no other stat preview at
                    all, so it's the same "buying blind on toughness" issue. */}
                <span className="hint"> ({frame.baseHp} HP)</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
