import { useState } from 'react';
import type { CommanderId } from '../game/commanders';
import { FRAMES } from '../game/frames';
import type { FrameId } from '../game/frames';
import type { CounterProtocolId } from '../game/counterProtocols';
import { COMMODITY_LOT_PART_ID } from '../game/parts';
import type { ProtocolId } from '../game/protocols';
import {
  commodityLotBuyCost,
  commodityLotCap,
  fleetCap,
  frameCost,
  mercenaryCost,
  RARITY_ORDER,
  STARTING_FIT,
} from '../game/reducer';
import { commissionedFleetSize } from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { FitChips } from './FitChips';
import { FleetPanel } from './FleetPanel';
import { FrameSilhouette } from './ShipSilhouette';
import { StoreSections } from './StoreSections';

interface ShopScreenProps {
  credits: number;
  offers: PartId[];
  // Iteration 22.x: which ships this visit's "Expand your fleet" section
  // offers — a random subset of the purchasable roster, drawn per visit
  // (see reducer.ts's drawFrameOffers). Undefined only for a save from
  // before this field existed; treated as "nothing to offer."
  frameOffers?: Exclude<FrameId, 'cruiser'>[];
  // 2026-08-07: each shipyard offer's pre-rolled rarity bonus — lets the
  // card show the actual item(s) a purchase grants instead of just a
  // count. Undefined for a store visit (always common, no bonus).
  frameBonusPreview?: Partial<Record<FrameId, { items: PartId[] }>>;
  // Iteration 33 (2026-08-07): which trade-station flavor this is —
  // 'store' (parts + war assets + 2 hulls, common/rare only) or 'shipyard'
  // (5 pristine hulls of any rarity, no parts/war assets). Defaults to
  // 'store' for a save from before this field existed (that's what every
  // shop visit was, back then).
  kind?: 'store' | 'shipyard';
  fleet: PlayerShipState[];
  inventory: PartId[];
  commanderId?: CommanderId;
  protocols?: ProtocolId[];
  counterProtocol?: CounterProtocolId;
  // Iteration 20 (commodity runs): whether the fleet's currently-carried lot
  // (if any) was bought at an earlier station than this one — the shop
  // itself doesn't know the global column math, so App.tsx precomputes it.
  commodityLotSellable: boolean;
  onBuyPart: (offerIndex: number) => void;
  onSellPart: (partId: PartId) => void;
  onBuyShip: (frameId: Exclude<FrameId, 'cruiser'>) => void;
  onScuttle: (shipIndex: number) => void;
  // 2026-08-06: no longer takes a shipIndex — buys to inventory like any
  // other part; equipping it onto a ship is the normal EQUIP flow below.
  onBuyCommodityLot: () => void;
  onSellCommodityLot: () => void;
  onBuyMercenary: () => void;
  onBuyRepair: (shipIndex: number) => void; // 2026-08-06: pay to fully heal one ship
  onLeave: () => void;
  onViewMap: () => void;
  onEquip: (shipIndex: number, partId: PartId) => void;
  onUnequip: (shipIndex: number, partId: PartId) => void;
}

export function ShopScreen({
  credits,
  offers,
  frameOffers,
  frameBonusPreview,
  kind = 'store',
  fleet,
  inventory,
  commanderId,
  protocols,
  counterProtocol,
  commodityLotSellable,
  onBuyPart,
  onSellPart,
  onBuyShip,
  onScuttle,
  onBuyCommodityLot,
  onSellCommodityLot,
  onBuyMercenary,
  onBuyRepair,
  onLeave,
  onViewMap,
  onEquip,
  onUnequip,
}: ShopScreenProps) {
  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const safeSelectedIndex = Math.min(selectedShipIndex, fleet.length - 1);
  const currentFleetCap = fleetCap(commanderId, protocols);
  // 2026-08-08: mercenary escorts don't count toward the displayed cap —
  // see reducer/shop.ts's BUY_SHIP gate, the same rule applied here.
  const fleetFull = commissionedFleetSize(fleet) >= currentFleetCap;
  const isShipyard = kind === 'shipyard';
  // 2026-08-06: counts inventory copies too, not just equipped ones — a
  // bought-but-not-yet-equipped lot still counts against the cap.
  const lotsCarried =
    fleet.filter((s) => s.equipped.includes(COMMODITY_LOT_PART_ID)).length +
    inventory.filter((id) => id === COMMODITY_LOT_PART_ID).length;
  const lotCap = commodityLotCap(commanderId);
  const canBuyMoreLots = lotsCarried < lotCap;
  const lotBuyCost = commodityLotBuyCost(commanderId);
  const mercCost = mercenaryCost(commanderId);

  return (
    <div className="shop-screen">
      <div className="shop-screen__header">
        <h2>{isShipyard ? 'Shipyard' : 'Trade station'}</h2>
        {/* Credits/intel live in the persistent HUD bar — no per-screen copy. */}
        <button type="button" className="shop-button" onClick={onViewMap}>
          View map
        </button>
      </div>
      <p className="hint">
        {isShipyard
          ? 'Fresh off the line, painted and pressurized — nothing here has seen a fight yet.'
          : 'Spend credits on parts and ships — or bank them for the next station.'}
      </p>

      {/* Iteration 33: a shipyard sells no parts or war assets — its whole
          identity is hulls + the upgrade bay/Foundry below; a store stocks
          neither of those, only parts + war assets + hulls. The two never
          render together. */}
      {!isShipyard && (
        <StoreSections
          offers={offers}
          credits={credits}
          commanderId={commanderId}
          protocols={protocols}
          onBuyPart={onBuyPart}
          lotsCarried={lotsCarried}
          lotCap={lotCap}
          commodityLotSellable={commodityLotSellable}
          onSellCommodityLot={onSellCommodityLot}
          canBuyMoreLots={canBuyMoreLots}
          lotBuyCost={lotBuyCost}
          onBuyCommodityLot={onBuyCommodityLot}
          mercCost={mercCost}
          onBuyMercenary={onBuyMercenary}
        />
      )}

      <h3>{isShipyard ? 'Ships' : 'Expand your fleet'}</h3>
      {/* 2026-08-06: what's for sale used to disappear entirely once the
          fleet hit its cap — a player at cap could never see (let alone
          plan around) what was in dock this visit, even though scuttling
          a ship below would have freed a slot for exactly one of these.
          Offers now always show; only the buy action itself is gated. */}
      {fleetFull && (
        <p className="warning">Fleet is at maximum size ({currentFleetCap} ships) — scuttle one below to make room.</p>
      )}
      {!frameOffers || frameOffers.length === 0 ? (
        <p className="hint">No hulls in dock this visit.</p>
      ) : (
        <div className="shop-screen__frames">
          {frameOffers.map((frameId) => {
            const frame = FRAMES[frameId];
            const cost = frameCost(frame.cost, frameId, commanderId, protocols, kind);
            const disabled = fleetFull || credits < cost;
            // Iteration 39: a store's rack is cheaper but always treated as
            // common tier (no bonus) — 2026-08-08: no longer framed as
            // "second-hand" (the store's real distinction is now that it
            // never stocks epic/legendary hulls at all, see drawFrameOffers).
            // A shipyard's arrive pristine AND fitted with bonus rare-tier
            // gear to match the frame's real rarity. The actual item(s) are
            // pre-rolled at PICK_NODE time and shown by name
            // (frameBonusPreview) — no longer just a count with the specific
            // gear a surprise until bought. bonusLevel stays as a fallback
            // for the rare case the preview is unavailable (an old save
            // resuming mid-shop-visit).
            const bonusLevel = isShipyard ? RARITY_ORDER.indexOf(frame.rarity) : 0;
            const preview = isShipyard ? frameBonusPreview?.[frameId] : undefined;
            // Iteration 41: preview what the hull arrives fitted with — every
            // purchasable frame carries at least one weapon now, and this is
            // the only place that was previously invisible until after buying.
            const startingFit = STARTING_FIT[frameId] ?? [];
            return (
              <button
                key={frame.id}
                type="button"
                className={`frame-card frame-card--rarity-${frame.rarity}`}
                onClick={() => onBuyShip(frameId)}
                disabled={disabled}
                title={fleetFull ? `Fleet is full — scuttle a ship below first.` : undefined}
              >
                <FrameSilhouette frameId={frame.id} size={40} />
                <span className="frame-card__name">
                  {frame.name}
                  {/* store hulls are always treated as common (no bonus) — the rarity label only
                      means something at a shipyard, where it's the tier the fuse/upgrade bonus draws from */}
                  {isShipyard && (
                    <span className={`frame-card__rarity-label frame-card__rarity-label--${frame.rarity}`}>
                      {frame.rarity}
                    </span>
                  )}
                </span>
                <span className="frame-card__desc">{frame.blurb}</span>
                {startingFit.length > 0 && <FitChips partIds={startingFit} />}
                {preview && preview.items.length > 0 && (
                  // 2026-08-08: the actual bonus item(s), same chip row the
                  // starting fit above already uses — one consistent way to
                  // preview "what this hull arrives carrying."
                  <FitChips partIds={preview.items} />
                )}
                {!preview && bonusLevel > 0 && (
                  // No real item ids in this fallback path (see the comment
                  // above) — just say how many.
                  <span className="frame-card__bonus">
                    Arrives with {bonusLevel} bonus rare item{bonusLevel > 1 ? 's' : ''}.
                  </span>
                )}
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
        onScuttle={onScuttle}
        commanderId={commanderId}
        protocols={protocols}
        counterProtocol={counterProtocol}
        credits={credits}
        onBuyRepair={onBuyRepair}
      />

      <div className="shop-screen__footer">
        <button type="button" className="continue-button" onClick={onLeave}>
          Leave shop
        </button>
      </div>
    </div>
  );
}
