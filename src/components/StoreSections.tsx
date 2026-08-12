import type { CommanderId } from '../game/commanders';
import { getPart } from '../game/parts';
import type { ProtocolId } from '../game/protocols';
import { COMMODITY_LOT_SELL_PRICE, MERCENARY_FIT, partCost } from '../game/reducer';
import { slotKindForPartType } from '../game/ship';
import type { PartId } from '../game/types';
import { FitChips } from './FitChips';
import { PartCard } from './PartCard';

// 2026-08-12: offers grouped by the same weapon/defense/systems vocabulary
// the blueprint UI already teaches (ship.ts's slotKindForPartType) — a flat
// grid of 8 mixed cards made "what am I even comparing" harder to answer
// than it needed to be. 'universal' is omitted: no PartType a shop can
// actually offer maps there (only the commodity lot does, and that's its
// own section below, never mixed into `offers`).
const CATEGORY_LABEL: Record<'weapon' | 'defense' | 'systems', string> = {
  weapon: 'Weapons',
  defense: 'Defense',
  systems: 'Systems',
};
const CATEGORY_ORDER: Array<'weapon' | 'defense' | 'systems'> = ['weapon', 'defense', 'systems'];

// 47.4.2: extracted from ShopScreen — the store-only sections (parts for
// sale, war assets). Iteration 33: a shipyard sells no parts or war
// assets at all — its whole identity is hulls + the upgrade bay, so
// these two sections and ShopScreen's ShipyardSections counterpart never
// render together.
interface StoreSectionsProps {
  offers: PartId[];
  credits: number;
  commanderId?: CommanderId;
  protocols?: ProtocolId[];
  onBuyPart: (offerIndex: number) => void;
  lotsCarried: number;
  lotCap: number;
  commodityLotSellable: boolean;
  onSellCommodityLot: () => void;
  canBuyMoreLots: boolean;
  lotBuyCost: number;
  onBuyCommodityLot: () => void;
  mercCost: number;
  onBuyMercenary: () => void;
}

export function StoreSections({
  offers,
  credits,
  commanderId,
  protocols,
  onBuyPart,
  lotsCarried,
  lotCap,
  commodityLotSellable,
  onSellCommodityLot,
  canBuyMoreLots,
  lotBuyCost,
  onBuyCommodityLot,
  mercCost,
  onBuyMercenary,
}: StoreSectionsProps) {
  return (
    <>
      <h3>Parts for sale</h3>
      {offers.length === 0 ? (
        <p className="hint">Sold out.</p>
      ) : (
        CATEGORY_ORDER.map((category) => {
          // Offer index `i` (not position-within-category) is what
          // onBuyPart needs — it identifies the offer slot in the
          // reducer's own offers array, so it's captured per-item before
          // filtering, not recomputed from the filtered list's position.
          const items = offers
            .map((partId, i) => ({ partId, i }))
            .filter(({ partId }) => slotKindForPartType(getPart(partId).type) === category);
          if (items.length === 0) return null;
          return (
            <div key={category}>
              <h4 className="panel-subtitle">{CATEGORY_LABEL[category]}</h4>
              <div className="shop-screen__offers">
                {items.map(({ partId, i }) => {
                  // A commander's signature part (always in stock — see
                  // reducer.ts's drawShopOffers) shows its discounted
                  // price here; everyone else's offers are unaffected.
                  // Overriding just the displayed cost on a copy of the
                  // Part reuses PartCard's existing rendering/disabled
                  // logic untouched.
                  const cost = partCost(partId, commanderId, protocols);
                  const part = { ...getPart(partId), cost };
                  return (
                    <PartCard
                      key={`${partId}-${i}`}
                      part={part}
                      showCost
                      onClick={credits >= cost ? () => onBuyPart(i) : undefined}
                      disabled={credits < cost}
                    />
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Iteration 20 (the economy floor): two ways to spend credits that
          aren't parts or hulls — a trade lot and a one-fight hire. Both are
          about giving late-run wealth somewhere to go. */}
      <h3>War assets</h3>
      <div className="shop-screen__offers">
        <div className="card-tile card-tile--deep-scan">
          <span className="card-tile__name">Commodity lot</span>
          {lotsCarried > 0 && (
            <span className="card-tile__desc">
              {lotsCarried} of {lotCap} lot{lotCap === 1 ? '' : 's'} carried.{' '}
              {commodityLotSellable
                ? `This station will pay ${COMMODITY_LOT_SELL_PRICE} credits each for whichever are old enough to sell.`
                : 'Not sellable until a later station.'}
            </span>
          )}
          {commodityLotSellable && (
            <button type="button" className="shop-button" onClick={onSellCommodityLot}>
              Sell eligible lot{lotsCarried > 1 ? 's' : ''} (+{COMMODITY_LOT_SELL_PRICE} cr each)
            </button>
          )}
          {canBuyMoreLots && (
            <>
              <span className="card-tile__desc">
                Equip it like a part. Sell for a profit at a later station — lost if the ship carrying it is.
              </span>
              <button type="button" className="shop-button" onClick={onBuyCommodityLot} disabled={credits < lotBuyCost}>
                Buy ({lotBuyCost} cr)
              </button>
            </>
          )}
          <span className="frame-card__cost">
            {canBuyMoreLots ? `${lotBuyCost} cr` : `${lotsCarried}/${lotCap} owned`}
          </span>
        </div>

        <div className="card-tile card-tile--deep-scan">
          <span className="card-tile__name">Mercenary escort</span>
          <span className="card-tile__desc">
            An Interceptor for hire, one fight only — no salvage if it falls. Works even at fleet capacity.
          </span>
          {/* 2026-08-08: show the weapon it actually arrives fitted with —
              same "always show the weapon with its dice" rule the frame
              cards' starting-fit preview already follows. */}
          <FitChips partIds={MERCENARY_FIT} />
          <button type="button" className="shop-button" onClick={onBuyMercenary} disabled={credits < mercCost}>
            Hire ({mercCost} cr)
          </button>
          <span className="frame-card__cost">{mercCost} cr</span>
        </div>
      </div>
    </>
  );
}
