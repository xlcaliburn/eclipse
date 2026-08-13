import { ORDER_RARITY } from '../game/combatEngine';
import type { FleetOrderId } from '../game/combatEngine';
import { ORDER_INFO } from './CombatCommandBar';

interface OrderDraftScreenProps {
  offers: FleetOrderId[]; // 1-3 offers (66.2: a slot can come up empty on a near-complete catalog)
  onChoose: (index: 0 | 1 | 2) => void;
  onDecline: () => void;
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

// Iteration 66 (fleet doctrine progression): the command draft — a
// milestone-win reward (4/8/12 combats won this run), 1-of-3 pick,
// skippable. Mirrors ProtocolDraftScreen's shape (one draft-screen-per-
// reward-tier pattern the game already establishes) but with a Decline
// option — the same courtesy a shop visit or an event choice extends,
// since an earned order is a permanent unlock the player might not want
// to commit a card-tile slot to.
export function OrderDraftScreen({ offers, onChoose, onDecline }: OrderDraftScreenProps) {
  return (
    <div className="protocol-draft-screen order-draft-screen">
      <h2>Command draft</h2>
      <p className="hint">The fleet's experience unlocks a new order — pick one, or pass.</p>

      <div className="protocol-draft-screen__offers">
        {offers.map((orderId, i) => {
          const info = ORDER_INFO[orderId];
          const rarity = ORDER_RARITY[orderId];
          return (
            <button
              key={orderId}
              type="button"
              className={`card-tile order-draft-card part-card--rarity-${rarity}`}
              onClick={() => onChoose(i as 0 | 1 | 2)}
            >
              <span className="card-tile__kind">{RARITY_LABEL[rarity]}</span>
              <span className="card-tile__name">{info.name}</span>
              <span className="card-tile__desc">{info.description}</span>
            </button>
          );
        })}
      </div>

      <button type="button" className="continue-button order-draft-screen__decline" onClick={onDecline}>
        Decline
      </button>
    </div>
  );
}
