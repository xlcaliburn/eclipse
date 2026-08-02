import { useState } from 'react';
import type { CardId } from '../game/cards';
import { getCard } from '../game/cards';
import { getEvent, meetsRequirement } from '../game/events';
import { playerShipLabel } from '../game/ship';
import type { RunState } from '../game/types';
import { FrameSilhouette } from './ShipSilhouette';

interface EventScreenProps {
  state: RunState;
  onChoose: (choiceIndex: number, shipIndex?: number, cardId?: CardId) => void;
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
                  {option.reqText && <span className="event-screen__reqtext">{option.reqText}</span>}
                </div>
              );
            }

            if (pickingIndex === i && option.chooseShip) {
              return (
                <div key={i} className="event-screen__option event-screen__picker">
                  <p className="hint">Pick a ship:</p>
                  <div className="reward-screen__ship-picks">
                    {state.fleet.map((ship, shipIndex) => (
                      <button
                        key={shipIndex}
                        type="button"
                        className="shop-button"
                        onClick={() => onChoose(i, shipIndex)}
                      >
                        <FrameSilhouette frameId={ship.frameId} size={24} />
                        {playerShipLabel(state.fleet, shipIndex)}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="shop-button" onClick={() => setPickingIndex(null)}>
                    Back
                  </button>
                </div>
              );
            }

            if (pickingIndex === i && option.chooseCard) {
              return (
                <div key={i} className="event-screen__option event-screen__picker">
                  <p className="hint">Pick a card:</p>
                  <div className="combat-hand__cards">
                    {state.hand.map((cardId, cardIndex) => {
                      const card = getCard(cardId);
                      return (
                        <button
                          key={`${cardId}-${cardIndex}`}
                          type="button"
                          className="card-tile"
                          onClick={() => onChoose(i, undefined, cardId)}
                          title={card.description}
                        >
                          <span className="card-tile__kind">Consumable</span>
                          <span className="card-tile__name">{card.name}</span>
                          <span className="card-tile__desc">{card.description}</span>
                        </button>
                      );
                    })}
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
                  onClick={() => (option.chooseShip || option.chooseCard ? setPickingIndex(i) : onChoose(i))}
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
