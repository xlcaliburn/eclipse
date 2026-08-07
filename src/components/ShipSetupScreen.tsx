import { useState } from 'react';
import { getFrame } from '../game/frames';
import { getPart } from '../game/parts';
import { SETUP_ALLOWED_PARTS, SETUP_BUDGET } from '../game/reducer';
import { deriveStats, hasWeapon } from '../game/ship';
import type { PartId } from '../game/types';
import { PartCard } from './PartCard';

interface ShipSetupScreenProps {
  equipped: PartId[];
  onAddPart: (partId: PartId) => void;
  onRemovePart: (partId: PartId) => void;
  onConfirm: () => void;
}

function spent(equipped: PartId[]): number {
  return equipped.reduce((sum, id) => sum + getPart(id).cost, 0);
}

export function ShipSetupScreen({ equipped, onAddPart, onRemovePart, onConfirm }: ShipSetupScreenProps) {
  // The reducer already pre-fits the reference loadout (initialRunState's
  // STARTING_LOADOUT) before this screen ever renders, so most players have
  // nothing to change — this defaults to that fast path and only reveals
  // the full editor on request.
  const [customizing, setCustomizing] = useState(false);
  const frame = getFrame('cruiser');
  const stats = deriveStats('cruiser', equipped);
  const canConfirm = hasWeapon(stats);
  const used = spent(equipped);
  const remaining = SETUP_BUDGET - used;

  if (!customizing) {
    return (
      <div className="setup-screen">
        <h2>Your {frame.name} is ready</h2>
        <p className="hint">
          Fitted with the reference loadout — 2 ion cannons, an electron computer, and hull plating.
        </p>

        <div className="slot-grid">
          {equipped.map((partId, i) => (
            <PartCard key={`${partId}-${i}`} part={getPart(partId)} />
          ))}
        </div>

        <div className="setup-screen__stats">
          HP {stats.hp} · Init {stats.initiative} · Comp {stats.computer} · Piloting {stats.shield}
        </div>

        <button type="button" className="engage-button" disabled={!canConfirm} onClick={onConfirm}>
          Start the Journey
        </button>
        <button type="button" className="setup-screen__customize-link" onClick={() => setCustomizing(true)}>
          Customize your flagship
        </button>
      </div>
    );
  }

  return (
    <div className="setup-screen">
      <h2>Fit out your starting {frame.name}</h2>
      <p className="hint">
        You have a {SETUP_BUDGET}-credit fitting budget — enough for the reference loadout (2 ion cannons,
        an electron computer, and hull plating), spent however you like. Your {frame.name} has{' '}
        {frame.slots} slots total, so whatever you don't spend here stays open for the run's real shops.
      </p>

      <div className="setup-screen__budget">
        Budget: {remaining}/{SETUP_BUDGET} credits remaining
      </div>

      <h3>Your build</h3>
      <div className="slot-grid">
        {equipped.map((partId, i) => (
          <PartCard key={`${partId}-${i}`} part={getPart(partId)} onClick={() => onRemovePart(partId)} />
        ))}
        {equipped.length === 0 && <p className="hint">No parts fitted yet.</p>}
      </div>

      <div className="setup-screen__stats">
        HP {stats.hp} · Init {stats.initiative} · Comp {stats.computer} · Shield {stats.shield}
      </div>

      <h3>Available parts</h3>
      <div className="inventory-grid">
        {SETUP_ALLOWED_PARTS.map((partId) => {
          const part = getPart(partId);
          const affordable = part.cost <= remaining;
          return (
            <PartCard
              key={partId}
              part={part}
              showCost
              onClick={affordable ? () => onAddPart(partId) : undefined}
              disabled={!affordable}
            />
          );
        })}
      </div>

      {!canConfirm && <p className="warning">Fit at least one weapon before launching.</p>}
      <button type="button" className="engage-button" disabled={!canConfirm} onClick={onConfirm}>
        Launch run
      </button>
    </div>
  );
}
