import { useState } from 'react';
import type { CommanderId } from '../game/commanders';
import { FRAMES } from '../game/frames';
import { COMMODITY_LOT_PART_ID, getPart } from '../game/parts';
import type { ActiveQuest } from '../game/quests';
import {
  commodityLotBuyCost,
  commodityLotCap,
  COMMODITY_LOT_SELL_PRICE,
  fleetCap,
  frameCost,
  mercenaryCost,
  partCost,
  QUEST_STAKE,
  rerollCost,
} from '../game/reducer';
import { playerShipLabel } from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { FleetPanel } from './FleetPanel';
import { PartCard } from './PartCard';
import { FrameSilhouette } from './ShipSilhouette';

const PURCHASABLE_FRAMES = [FRAMES.interceptor, FRAMES['light-cruiser'], FRAMES.bastion, FRAMES.dreadnought];

const QUEST_ARCHETYPE_LABEL: Record<ActiveQuest['archetype'], string> = {
  bounty: 'Bounty',
  delivery: 'Delivery',
  recon: 'Recon',
};

const QUEST_ARCHETYPE_BLURB: Record<ActiveQuest['archetype'], string> = {
  bounty: 'A named elite waits at that combat node — win it for +18 cr and an upgrade pick.',
  delivery: 'Carry a cargo pod there for +15 cr and a reaction card.',
  recon: 'Visit it for an intelligence haul: +2 columns of vision and two free reveals.',
};

interface ShopScreenProps {
  credits: number;
  offers: PartId[];
  fleet: PlayerShipState[];
  inventory: PartId[];
  shopQuestOffer?: ActiveQuest;
  activeQuest?: ActiveQuest;
  commanderId?: CommanderId;
  // Iteration 20 (commodity runs): whether the fleet's currently-carried lot
  // (if any) was bought at an earlier station than this one — the shop
  // itself doesn't know the global column math, so App.tsx precomputes it.
  commodityLotSellable: boolean;
  onBuyPart: (offerIndex: number) => void;
  onSellPart: (partId: PartId) => void;
  onBuyShip: (frameId: 'interceptor' | 'bastion' | 'dreadnought' | 'light-cruiser') => void;
  onScuttle: (shipIndex: number) => void;
  onAcceptQuest: (carrierShipIndex?: number) => void;
  onMoveCargoPod: (toShipIndex: number) => void;
  onBuyCommodityLot: (shipIndex: number) => void;
  onSellCommodityLot: () => void;
  onBuyMercenary: () => void;
  onReroll: () => void;
  onLeave: () => void;
  onViewMap: () => void;
  onEquip: (shipIndex: number, partId: PartId) => void;
  onUnequip: (shipIndex: number, partId: PartId) => void;
}

export function ShopScreen({
  credits,
  offers,
  fleet,
  inventory,
  shopQuestOffer,
  activeQuest,
  commanderId,
  commodityLotSellable,
  onBuyPart,
  onSellPart,
  onBuyShip,
  onScuttle,
  onAcceptQuest,
  onMoveCargoPod,
  onBuyCommodityLot,
  onSellCommodityLot,
  onBuyMercenary,
  onReroll,
  onLeave,
  onViewMap,
  onEquip,
  onUnequip,
}: ShopScreenProps) {
  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const safeSelectedIndex = Math.min(selectedShipIndex, fleet.length - 1);
  const currentFleetCap = fleetCap(commanderId);
  const fleetFull = fleet.length >= currentFleetCap;
  const effectiveRerollCost = rerollCost(commanderId);
  const lotsCarried = fleet.filter((s) => s.equipped.includes(COMMODITY_LOT_PART_ID)).length;
  const lotCap = commodityLotCap(commanderId);
  const canBuyMoreLots = lotsCarried < lotCap;
  const lotBuyCost = commodityLotBuyCost(commanderId);
  const mercCost = mercenaryCost(commanderId);

  return (
    <div className="shop-screen">
      <div className="shop-screen__header">
        <h2>Trade station</h2>
        {/* Credits/intel live in the persistent HUD bar — no per-screen copy. */}
        <button type="button" className="shop-button" onClick={onViewMap}>
          View map
        </button>
      </div>
      <p className="hint">Spend credits on parts and ships — or bank them for the next station.</p>

      <h3>Parts for sale</h3>
      {offers.length === 0 ? (
        <p className="hint">Sold out.</p>
      ) : (
        <div className="shop-screen__offers">
          {offers.map((partId, i) => {
            // A commander's signature part (always in stock — see
            // reducer.ts's drawShopOffers) shows its discounted price here;
            // everyone else's offers are unaffected. Overriding just the
            // displayed cost on a copy of the Part reuses PartCard's
            // existing rendering/disabled logic untouched.
            const cost = partCost(partId, commanderId);
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
      )}
      <button type="button" className="shop-button" onClick={onReroll} disabled={credits < effectiveRerollCost}>
        Reroll stock ({effectiveRerollCost} cr)
      </button>

      {/* The info broker is gone: intelligence is no longer a currency, it
          is the Spymaster's post-fight perk (and a recon job's payout). */}
      <h3>Jobs</h3>
      <div className="shop-screen__offers">
        <div className="card-tile card-tile--deep-scan">
          <span className="card-tile__name">Job board</span>
          {!shopQuestOffer ? (
            <span className="card-tile__desc">No offer this visit.</span>
          ) : (
            <>
              <span className="card-tile__desc">
                {QUEST_ARCHETYPE_LABEL[shopQuestOffer.archetype]} — target: column {shopQuestOffer.target.col + 1},
                lane {shopQuestOffer.target.row + 1}. {QUEST_ARCHETYPE_BLURB[shopQuestOffer.archetype]} Stake:{' '}
                {QUEST_STAKE[shopQuestOffer.archetype]} cr, forfeit on failure.
              </span>
              {activeQuest ? (
                <span className="card-tile__desc">Already running a quest — only one active at a time.</span>
              ) : credits < QUEST_STAKE[shopQuestOffer.archetype] ? (
                <span className="card-tile__desc warning">Can't afford the stake.</span>
              ) : shopQuestOffer.archetype === 'delivery' ? (
                <div className="card-tile__lane-buttons">
                  {fleet.map((_, i) => (
                    <button key={i} type="button" className="shop-button" onClick={() => onAcceptQuest(i)}>
                      Carry: {playerShipLabel(fleet, i)}
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" className="shop-button" onClick={() => onAcceptQuest()}>
                  Accept
                </button>
              )}
            </>
          )}
          <span className="frame-card__cost">
            {shopQuestOffer ? `${QUEST_STAKE[shopQuestOffer.archetype]} cr stake` : 'Free'}
          </span>
        </div>
      </div>

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
          {canBuyMoreLots &&
            (credits < lotBuyCost ? (
              <span className="card-tile__desc warning">Can't afford a lot ({lotBuyCost} cr).</span>
            ) : (
              <>
                <span className="card-tile__desc">
                  Occupies a hardpoint until you sell it at a later station — and it's lost outright if the ship
                  carrying it is.
                </span>
                <div className="card-tile__lane-buttons">
                  {fleet.map((_, i) => (
                    <button key={i} type="button" className="shop-button" onClick={() => onBuyCommodityLot(i)}>
                      Load: {playerShipLabel(fleet, i)}
                    </button>
                  ))}
                </div>
              </>
            ))}
          <span className="frame-card__cost">
            {canBuyMoreLots ? `${lotBuyCost} cr` : `${lotsCarried}/${lotCap} owned`}
          </span>
        </div>

        <div className="card-tile card-tile--deep-scan">
          <span className="card-tile__name">Mercenary escort</span>
          <span className="card-tile__desc">
            An Interceptor for hire — fights your very next combat, then moves on. No salvage if it falls, no
            wages if it doesn't.
          </span>
          {fleetFull ? (
            <span className="card-tile__desc">Fleet is already at maximum size.</span>
          ) : (
            <button type="button" className="shop-button" onClick={onBuyMercenary} disabled={credits < mercCost}>
              Hire ({mercCost} cr)
            </button>
          )}
          <span className="frame-card__cost">{mercCost} cr</span>
        </div>
      </div>

      <h3>Expand your fleet</h3>
      {fleetFull ? (
        <p className="hint">Fleet is at maximum size ({currentFleetCap} ships).</p>
      ) : (
        <div className="shop-screen__frames">
          {PURCHASABLE_FRAMES.map((frame) => {
            const cost = frameCost(frame.cost, frame.id, commanderId);
            return (
              <button
                key={frame.id}
                type="button"
                className="frame-card"
                onClick={() => onBuyShip(frame.id as 'interceptor' | 'bastion' | 'dreadnought' | 'light-cruiser')}
                disabled={credits < cost}
              >
                <FrameSilhouette frameId={frame.id} size={40} />
                <span className="frame-card__name">{frame.name}</span>
                <span className="frame-card__desc">{frame.blurb}</span>
                <span className="frame-card__cost">{cost} cr</span>
              </button>
            );
          })}
        </div>
      )}

      <h3>Your fleet</h3>
      <FleetPanel
        fleet={fleet}
        inventory={inventory}
        selectedShipIndex={safeSelectedIndex}
        onSelectShip={setSelectedShipIndex}
        onEquip={onEquip}
        onUnequip={onUnequip}
        onSellPart={onSellPart}
        cargoCarrierIndex={activeQuest?.archetype === 'delivery' ? activeQuest.carrierShipIndex : undefined}
        onMoveCargoPod={onMoveCargoPod}
        onScuttle={onScuttle}
        commanderId={commanderId}
      />

      <div className="shop-screen__footer">
        <button type="button" className="continue-button" onClick={onLeave}>
          Back to map
        </button>
      </div>
    </div>
  );
}
