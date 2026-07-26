import { getEvent } from '../game/events';
import type { CurrentEventState } from '../game/types';

interface EventScreenProps {
  event: CurrentEventState;
  onChoose: (choiceIndex: 0 | 1) => void;
  onContinue: () => void;
  onViewMap: () => void;
  onViewFleet: () => void;
}

export function EventScreen({ event, onChoose, onContinue, onViewMap, onViewFleet }: EventScreenProps) {
  const def = getEvent(event.eventId);
  const decided = event.outcomeText !== undefined;

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
          <button type="button" className="shop-button" onClick={() => onChoose(0)}>
            {def.choiceALabel}
          </button>
          <button type="button" className="shop-button" onClick={() => onChoose(1)}>
            {def.choiceBLabel}
          </button>
        </div>
      )}

      {decided && (
        <>
          <p className="event-screen__outcome">{event.outcomeText}</p>
          <button type="button" className="continue-button" onClick={onContinue}>
            {event.ambushEnemy ? 'Face the patrol' : 'Back to map'}
          </button>
        </>
      )}
    </div>
  );
}
