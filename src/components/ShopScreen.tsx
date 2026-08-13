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
  STARTING_FIT,
} from '../game/reducer';
import { commissionedFleetSize, equippedPower, powerBudget } from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { FitChips } from './FitChips';
import { FleetPanel } from './FleetPanel';
import { PowerPipRow } from './PowerPipRow';
import { ShipyardMarkSection } from './ShipyardMarkSection';
import { FrameSilhouette } from './ShipSilhouette';
import { SlotRow } from './SlotRow';
import { StoreSections } from './StoreSections';

interface ShopScreenProps {
  credits: number;
  offers: PartId[];
  // Iteration 22.x: which ships this visit's "Expand your fleet" section
  // offers — a random subset of the purchasable roster, drawn per visit
  // (see reducer.ts's drawFrameOffers). Undefined only for a save from
  // before this field existed; treated as "nothing to offer."
  frameOffers?: Exclude<FrameId, 'cruiser'>[];
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
  // Iteration 56.1: RunState.bonusFleetBerths — folded into the displayed
  // fleet cap below, same as the Admiral base / Armada mandate already are.
  bonusFleetBerths?: number;
  // Iteration 20 (commodity runs): whether the fleet's currently-carried lot
  // (if any) was bought at an earlier station than this one — the shop
  // itself doesn't know the global column math, so App.tsx precomputes it.
  commodityLotSellable: boolean;
  onBuyPart: (offerIndex: number) => void;
  onSellPart: (partId: PartId) => void;
  onBuyShip: (frameId: Exclude<FrameId, 'cruiser'>) => void;
  onUpgradeMark: (shipIndex: number) => void;
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
  kind = 'store',
  fleet,
  inventory,
  commanderId,
  protocols,
  counterProtocol,
  bonusFleetBerths,
  commodityLotSellable,
  onBuyPart,
  onSellPart,
  onBuyShip,
  onUpgradeMark,
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
  const currentFleetCap = fleetCap(commanderId, protocols, bonusFleetBerths ?? 0);
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
      {/* Iteration 56.1: the one visible marker for a bought/unlocked bonus
          berth — the cap warning below already reflects it via
          currentFleetCap, but that only ever shows once the fleet is
          actually full; this confirms the charter change any time it's
          relevant, full fleet or not. */}
      {!!bonusFleetBerths && (
        <p className="hint">Fleet charter carries a bonus berth — max fleet size is {currentFleetCap}.</p>
      )}
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
            // common tier — 2026-08-08: no longer framed as "second-hand"
            // (the store's real distinction is now that it never stocks
            // epic/legendary hulls at all, see drawFrameOffers). 61.1: the
            // shipyard's pristine-arrival bonus item(s) are gone — every
            // purchase, store or shipyard, arrives with exactly
            // STARTING_FIT and nothing else; the rarity label below is now
            // purely a tier indicator, not a promise of bonus gear.
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
                {/* Iteration 52.2: the hull's shape, visible BEFORE buying —
                    with 17 hulls this is where distinguishing "weapon-only"
                    from "systems-only" from "flexible" matters most. No
                    `equipped` — every slot renders empty, previewing the
                    bare layout, not the starting fit (that's FitChips
                    below). */}
                <SlotRow layout={frame.slotLayout} />
                {/* Iteration 57.3: the budget alongside the slot layout —
                    "used" is what this hull will actually arrive carrying
                    (STARTING_FIT — 61.1 removed the bonus items that used
                    to sit alongside it), the same thing FitChips below
                    previews, so the meter and the chips never disagree
                    about what's included. */}
                <PowerPipRow
                  used={equippedPower(startingFit)}
                  budget={powerBudget(frameId, startingFit)}
                />
                {startingFit.length > 0 && <FitChips partIds={startingFit} />}
                <span className="frame-card__cost">{cost} cr</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Iteration 59.3/59.4: shipyard-only (canUpgradeMark itself enforces
          this) — renders nothing if no ship is currently eligible. */}
      {isShipyard && (
        <ShipyardMarkSection
          fleet={fleet}
          credits={credits}
          shopKind={kind}
          protocols={protocols}
          commanderId={commanderId}
          onUpgradeMark={onUpgradeMark}
        />
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
