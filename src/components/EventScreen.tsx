import { useState } from 'react';
import { getEvent, meetsRequirement, reqTextFor } from '../game/events';
import { getPart } from '../game/parts';
import type { PartId, RunState } from '../game/types';
import { PartCard } from './PartCard';
import { ShipPickRow } from './ShipPickRow';

interface EventScreenProps {
  state: RunState;
  onChoose: (choiceIndex: number, shipIndex?: number, partId?: PartId) => void;
  onContinue: () => void;
  onViewMap: () => void;
  onViewFleet: () => void;
}

export function EventScreen({ state, onChoose, onContinue, onViewMap, onViewFleet }: EventScreenProps) {
  const event = state.currentEvent!;
  const def = getEvent(event.eventId);
  const decided = event.outcomeText !== undefined;
  // Index of the option currently expanding an inline ship/card picker, if
  // any — reset whenever the event itself changes (map -> new event node).
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);

  return (
    <div className="event-screen">
      <div className="map-screen__header">
        <button type="button" className="shop-button" onClick={onViewMap}>
          View map
        </button>
        <button type="button" className="shop-button" onClick={onViewFleet}>
          View fleet
        </button>
      </div>
      <h2>{def.title}</h2>
      <p className="event-screen__flavor">{def.flavor}</p>

      {!decided && (
        <div className="event-screen__choices">
          {def.options.map((option, i) => {
            const locked = option.requirement !== undefined && !meetsRequirement(option.requirement, state);
            if (locked) {
              return (
                <div key={i} className="event-screen__option event-screen__option--locked">
                  <button type="button" className="shop-button" disabled>
                    {option.label}
                  </button>
                  {reqTextFor(option) && <span className="event-screen__reqtext">{reqTextFor(option)}</span>}
                </div>
              );
            }

            if (pickingIndex === i && option.chooseShip) {
              return (
                <div key={i} className="event-screen__option event-screen__picker">
                  <p className="hint">Pick a ship:</p>
                  <ShipPickRow fleet={state.fleet} onPick={(shipIndex) => onChoose(i, shipIndex)} />
                  <button type="button" className="shop-button" onClick={() => setPickingIndex(null)}>
                    Back
                  </button>
                </div>
              );
            }

            if (pickingIndex === i && option.choosePart) {
              return (
                <div key={i} className="event-screen__option event-screen__picker">
                  <p className="hint">Pick a part:</p>
                  <div className="ship-picks">
                    {state.inventory.map((partId, partIndex) => (
                      <PartCard
                        key={`${partId}-${partIndex}`}
                        part={getPart(partId)}
                        onClick={() => onChoose(i, undefined, partId)}
                      />
                    ))}
                  </div>
                  <button type="button" className="shop-button" onClick={() => setPickingIndex(null)}>
                    Back
                  </button>
                </div>
              );
            }

            return (
              <div key={i} className="event-screen__option">
                <button
                  type="button"
                  className="shop-button"
                  onClick={() => (option.chooseShip || option.choosePart ? setPickingIndex(i) : onChoose(i))}
                >
                  {option.label}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {decided && (
        <>
          <p className="event-screen__outcome">{event.outcomeText}</p>
          <button type="button" className="continue-button" onClick={onContinue}>
            {event.ambushEnemy ? 'Face the ambush' : 'Back to map'}
          </button>
        </>
      )}
    </div>
  );
}
