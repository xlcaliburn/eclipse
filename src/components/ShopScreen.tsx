import { useState } from 'react';
import type { CommanderId } from '../game/commanders';
import { FRAMES } from '../game/frames';
import type { FrameId } from '../game/frames';
import type { CounterProtocolId } from '../game/counterProtocols';
import { COMMODITY_LOT_PART_ID, getPart } from '../game/parts';
import type { ProtocolId } from '../game/protocols';
import {
  commodityLotBuyCost,
  commodityLotCap,
  COMMODITY_LOT_SELL_PRICE,
  fleetCap,
  frameCost,
  mercenaryCost,
  partCost,
  RARITY_ORDER,
  rerollCost,
  SHIPYARD_UPGRADE_COST,
  STARTING_FIT,
} from '../game/reducer';
import { fusionCost, playerShipLabel } from '../game/ship';
import type { FusionStat } from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';
import { WeaponDie } from './Die';
import { FleetPanel } from './FleetPanel';
import { PartCard } from './PartCard';
import { FrameSilhouette } from './ShipSilhouette';

// Iteration 31 (the Foundry): fuse it into the hull — permanent, no slot.
const FUSION_STATS: FusionStat[] = ['hp', 'computer', 'shield', 'initiative'];
const FUSION_STAT_LABEL: Record<FusionStat, string> = {
  hp: 'Max HP',
  computer: 'Computer',
  shield: 'Piloting',
  initiative: 'Initiative',
};
const FUSION_STAT_DESC: Record<FusionStat, string> = {
  hp: '+1 max HP, permanent.',
  computer: '+1 computer, permanent.',
  shield: '+1 piloting, permanent.',
  initiative: '+1 initiative, permanent.',
};

interface ShopScreenProps {
  credits: number;
  offers: PartId[];
  // Iteration 22.x: which ships this visit's "Expand your fleet" section
  // offers — a random subset of the purchasable roster, drawn per visit
  // (see reducer.ts's drawFrameOffers). Undefined only for a save from
  // before this field existed; treated as "nothing to offer."
  frameOffers?: Exclude<FrameId, 'cruiser'>[];
  // Iteration 33 (2026-08-07): which trade-station flavor this is —
  // 'store' (parts + war assets + 2 second-hand hulls, no upgrade bay) or
  // 'shipyard' (4 pristine hulls + the upgrade bay, no parts/war assets/
  // reroll). Defaults to 'store' for a save from before this field existed
  // (that's what every shop visit was, back then).
  kind?: 'store' | 'shipyard';
  // The shipyard's one purchasable upgrade this visit — only meaningful
  // when kind === 'shipyard'.
  upgradeOffer?: UpgradeId;
  fleet: PlayerShipState[];
  inventory: PartId[];
  commanderId?: CommanderId;
  protocols?: ProtocolId[];
  counterProtocol?: CounterProtocolId;
  // 2026-08-06: how many rerolls this shop visit has already used — the
  // Nth reroll costs N credits (half that, rounded up, for the Merchant),
  // so this is what the "Reroll stock" button's displayed price derives
  // from. Reset to undefined on every fresh shop visit (reducer.ts).
  rerollsUsed?: number;
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
  onBuyUpgrade: (shipIndex: number) => void; // 2026-08-07: shipyard only
  onFuseStat: (shipIndex: number, stat: FusionStat) => void; // 2026-08-07 (iteration 31): shipyard only
  onReroll: () => void;
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
  upgradeOffer,
  fleet,
  inventory,
  commanderId,
  protocols,
  counterProtocol,
  rerollsUsed,
  commodityLotSellable,
  onBuyPart,
  onSellPart,
  onBuyShip,
  onScuttle,
  onBuyCommodityLot,
  onSellCommodityLot,
  onBuyMercenary,
  onBuyRepair,
  onBuyUpgrade,
  onFuseStat,
  onReroll,
  onLeave,
  onViewMap,
  onEquip,
  onUnequip,
}: ShopScreenProps) {
  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const [selectedFusionStat, setSelectedFusionStat] = useState<FusionStat | null>(null);
  const safeSelectedIndex = Math.min(selectedShipIndex, fleet.length - 1);
  const currentFleetCap = fleetCap(commanderId, protocols);
  const fleetFull = fleet.length >= currentFleetCap;
  const effectiveRerollCost = rerollCost(commanderId, rerollsUsed ?? 0);
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
          ? 'Pristine hulls, priced to match, plus one upgrade worth fusing in — no parts stocked here.'
          : 'Spend credits on parts and ships — or bank them for the next station.'}
      </p>

      {/* Iteration 33: a shipyard sells no parts and runs no reroll — its
          whole identity is hulls + the upgrade bay below. */}
      {!isShipyard && (
        <>
          <h3>Parts for sale</h3>
          {offers.length === 0 ? (
            <p className="hint">Sold out.</p>
          ) : (
            <div className="shop-screen__offers">
              {offers.map((partId, i) => {
                // A commander's signature part (always in stock — see
                // reducer.ts's drawShopOffers) shows its discounted price
                // here; everyone else's offers are unaffected. Overriding
                // just the displayed cost on a copy of the Part reuses
                // PartCard's existing rendering/disabled logic untouched.
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
          )}
          <button type="button" className="shop-button" onClick={onReroll} disabled={credits < effectiveRerollCost}>
            Reroll stock ({effectiveRerollCost} cr)
          </button>
        </>
      )}

      {/* Iteration 20 (the economy floor): two ways to spend credits that
          aren't parts or hulls — a trade lot and a one-fight hire. Both are
          about giving late-run wealth somewhere to go. Iteration 33: the
          shipyard doesn't stock these either — it sells permanence, not
          consumables. */}
      {!isShipyard && (
        <>
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
              <button type="button" className="shop-button" onClick={onBuyMercenary} disabled={credits < mercCost}>
                Hire ({mercCost} cr)
              </button>
              <span className="frame-card__cost">{mercCost} cr</span>
            </div>
          </div>
        </>
      )}

      <h3>{isShipyard ? 'Hulls in dock' : 'Expand your fleet'}</h3>
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
            // Iteration 39: a store's rack is second-hand — cheaper, but
            // always treated as common tier (no bonus). A shipyard's arrive
            // pristine AND fused/upgraded to match the frame's real rarity —
            // this level count is the same one BUY_SHIP's hullRarityBonus
            // uses, so the preview can't drift from what purchase actually
            // grants (WHICH upgrade(s) stays a surprise until bought, same
            // as an elite reward).
            const bonusLevel = isShipyard ? RARITY_ORDER.indexOf(frame.rarity) : 0;
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
                {!isShipyard && <span className="frame-card__badge">Second-hand</span>}
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
                {startingFit.length > 0 && (
                  <div className="frame-card__fit">
                    {startingFit.map((partId, i) => {
                      const part = getPart(partId);
                      return (
                        <span key={`${partId}-${i}`} className="frame-card__fit-item" title={part.description}>
                          {part.weapon && <WeaponDie damage={part.weapon.damage} kind={part.weapon.kind} size={16} />}
                          {part.name}
                        </span>
                      );
                    })}
                  </div>
                )}
                {bonusLevel > 0 && (
                  <span className="frame-card__bonus">
                    Arrives fused +{bonusLevel} HP with {bonusLevel} bonus upgrade{bonusLevel > 1 ? 's' : ''}.
                  </span>
                )}
                <span className="frame-card__cost">{cost} cr</span>
              </button>
            );
          })}
        </div>
      )}

      {isShipyard && (
        <>
          <h3>Upgrade bay</h3>
          {upgradeOffer ? (
            <div className="shop-screen__offers">
              <div className="card-tile card-tile--deep-scan">
                <span className="card-tile__name">{getUpgrade(upgradeOffer).name}</span>
                <span className="card-tile__desc">{getUpgrade(upgradeOffer).description}</span>
                <span className="card-tile__desc">Slotless and permanent — pick which ship carries it.</span>
                <div className="reward-screen__ship-picks">
                  {fleet.map((ship, i) => {
                    const merc = ship.mercenary;
                    return (
                      <button
                        key={i}
                        type="button"
                        className="shop-button"
                        onClick={() => onBuyUpgrade(i)}
                        disabled={credits < SHIPYARD_UPGRADE_COST || merc}
                        title={merc ? "A mercenary won't carry a permanent upgrade past its one fight." : undefined}
                      >
                        <FrameSilhouette frameId={ship.frameId} size={24} />
                        {playerShipLabel(fleet, i)}
                      </button>
                    );
                  })}
                </div>
                <span className="frame-card__cost">{SHIPYARD_UPGRADE_COST} cr</span>
              </div>
            </div>
          ) : (
            <p className="hint">Already fitted this visit.</p>
          )}

          {/* Iteration 31: the Foundry — fuse a part's worth of power
              directly into a hull. Permanent, slotless, escalating price;
              the late-run credit sink for a fleet with full slots and
              nowhere else to spend. */}
          <h3>Foundry</h3>
          <p className="hint">Fuse it into the hull — permanent, no slot. Price escalates per fusion, any stat, per ship.</p>
          <div className="shop-screen__offers">
            {FUSION_STATS.map((stat) => (
              <button
                key={stat}
                type="button"
                className={`card-tile card-tile--deep-scan${selectedFusionStat === stat ? ' card-tile--selected' : ''}`}
                onClick={() => setSelectedFusionStat(stat)}
              >
                <span className="card-tile__name">{FUSION_STAT_LABEL[stat]}</span>
                <span className="card-tile__desc">{FUSION_STAT_DESC[stat]}</span>
              </button>
            ))}
          </div>
          {selectedFusionStat && (
            <>
              <p className="hint">Fuse into which ship?</p>
              <div className="reward-screen__ship-picks">
                {fleet.map((ship, i) => {
                  const cost = fusionCost(selectedFusionStat, ship);
                  const merc = ship.mercenary;
                  return (
                    <button
                      key={i}
                      type="button"
                      className="shop-button"
                      onClick={() => onFuseStat(i, selectedFusionStat)}
                      disabled={credits < cost || merc}
                      title={merc ? "A mercenary won't carry a permanent fusion past its one fight." : undefined}
                    >
                      <FrameSilhouette frameId={ship.frameId} size={24} />
                      {playerShipLabel(fleet, i)} ({cost} cr)
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
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
          Back to map
        </button>
      </div>
    </div>
  );
}
