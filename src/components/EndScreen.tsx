import type { PlayerShipState } from '../game/types';
import { FrameSilhouette } from './ShipSilhouette';

interface EndScreenProps {
  outcome: 'victory' | 'defeat';
  column: number;
  act: 1 | 2;
  credits: number;
  intel: number;
  visitedCount: number;
  fleet: PlayerShipState[];
  onNewRun: () => void;
}

export function EndScreen({ outcome, column, act, credits, intel, visitedCount, fleet, onNewRun }: EndScreenProps) {
  const won = outcome === 'victory';
  return (
    <div className={`end-screen${won ? ' end-screen--victory' : ' end-screen--defeat'}`}>
      <h2 className={won ? 'verdict verdict--win' : 'verdict verdict--loss'}>
        {won ? 'Victory' : 'Defeat'}
      </h2>
      <p>
        {won
          ? 'The final boss falls — the long war is won.'
          : `Your fleet was destroyed in act ${act}, column ${column + 1}.`}
      </p>

      {won && (
        <div className="end-screen__fleet">
          {fleet.map((ship, i) => (
            <FrameSilhouette key={i} frameId={ship.frameId} size={64} />
          ))}
        </div>
      )}

      <dl className="end-screen__stats stat-grid">
        <dt>Systems explored</dt>
        <dd>{visitedCount}</dd>
        <dt>Credits</dt>
        <dd>{credits}</dd>
        <dt>Intel</dt>
        <dd>{intel}</dd>
        <dt>Ships remaining</dt>
        <dd>{fleet.length}</dd>
      </dl>

      <button type="button" className="continue-button" onClick={onNewRun}>
        New run
      </button>
    </div>
  );
}
