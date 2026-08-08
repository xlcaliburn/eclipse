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
  MERCENARY_FIT,
  partCost,
  RARITY_ORDER,
  SHIPYARD_UPGRADE_COST,
  STARTING_FIT,
} from '../game/reducer';
import { FUSABLE_PARTS, FUSION_STAT_ABBR, FUSION_STAT_BASE, FUSION_STAT_ORDER, fusionCost } from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';
import { FitChips } from './FitChips';
import { FleetPanel } from './FleetPanel';
import { PartCard } from './PartCard';
import { ShipPickRow } from './ShipPickRow';
import { FrameSilhouette } from './ShipSilhouette';

// Iteration 31 (the Foundry): fuse it into the hull — permanent, no slot.
// 2026-08-07: fusing now consumes an owned stat-ladder part (see
// ship.ts's FUSABLE_PARTS) instead of picking an abstract stat category —
// the part's own name/description already says what it grants, so no
// separate label/desc table is needed any more.

interface ShopScreenProps {
  credits: number;
  offers: PartId[];
  // Iteration 22.x: which ships this visit's "Expand your fleet" section
  // offers — a random subset of the purchasable roster, drawn per visit
  // (see reducer.ts's drawFrameOffers). Undefined only for a save from
  // before this field existed; treated as "nothing to offer."
  frameOffers?: Exclude<FrameId, 'cruiser'>[];
  // 2026-08-07: each shipyard offer's pre-rolled rarity bonus — lets the
  // card show the actual upgrade(s) a purchase grants instead of just a
  // count. Undefined for a store visit (always common, no bonus).
  frameBonusPreview?: Partial<Record<FrameId, { hp: number; upgrades: UpgradeId[] }>>;
  // Iteration 33 (2026-08-07): which trade-station flavor this is —
  // 'store' (parts + war assets + 2 hulls, common/rare only, no upgrade
  // bay) or 'shipyard' (5 pristine hulls of any rarity + the upgrade bay,
  // no parts/war assets). Defaults to 'store' for a save from before this
  // field existed (that's what every shop visit was, back then).
  kind?: 'store' | 'shipyard';
  // The shipyard's one purchasable upgrade this visit — only meaningful
  // when kind === 'shipyard'.
  upgradeOffer?: UpgradeId;
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
  onBuyUpgrade: (shipIndex: number) => void; // 2026-08-07: shipyard only
  onFuseStat: (shipIndex: number, partId: PartId) => void; // iteration 31, reworked 2026-08-07: consumes an owned part
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
  upgradeOffer,
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
  onBuyUpgrade,
  onFuseStat,
  onLeave,
  onViewMap,
  onEquip,
  onUnequip,
}: ShopScreenProps) {
  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const [selectedFusionPart, setSelectedFusionPart] = useState<PartId | null>(null);
  const safeSelectedIndex = Math.min(selectedShipIndex, fleet.length - 1);
  const currentFleetCap = fleetCap(commanderId, protocols);
  const fleetFull = fleet.length >= currentFleetCap;
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
  // 2026-08-07 (Foundry rework): the Foundry can only fuse a stat-ladder
  // part the player actually owns — unique ids only (owning 2 Gauss coils
  // doesn't offer the same tile twice, picking it just consumes one).
  const fusableInInventory = Array.from(new Set(inventory.filter((id) => FUSABLE_PARTS[id])));

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

      {/* Iteration 33: a shipyard sells no parts — its whole identity is
          hulls + the upgrade bay below. */}
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
            // A shipyard's arrive pristine AND fused/upgraded to match the
            // frame's real rarity. 2026-08-07: the actual upgrade(s) are now
            // pre-rolled at PICK_NODE time and shown by name
            // (frameBonusPreview) — no longer just a count with the specific
            // upgrade a surprise until bought. bonusLevel stays as a
            // fallback for the rare case the preview is unavailable (an old
            // save resuming mid-shop-visit).
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
                {preview && preview.hp > 0 && (
                  <span className="frame-card__bonus">
                    Arrives fused +{preview.hp} HP with {preview.upgrades.map((id) => getUpgrade(id).name).join(', ')}.
                  </span>
                )}
                {!preview && bonusLevel > 0 && (
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
                <ShipPickRow
                  fleet={fleet}
                  onPick={onBuyUpgrade}
                  disabledFor={(ship) => credits < SHIPYARD_UPGRADE_COST || !!ship.mercenary}
                  titleFor={(ship) =>
                    ship.mercenary ? "A mercenary won't carry a permanent upgrade past its one fight." : undefined
                  }
                />
                <span className="frame-card__cost">{SHIPYARD_UPGRADE_COST} cr</span>
              </div>
            </div>
          ) : (
            <p className="hint">Already fitted this visit.</p>
          )}

          {/* Iteration 31: the Foundry — fuse a part's worth of power
              directly into a hull. Permanent, slotless; the late-run
              credit sink for a fleet with full slots and nowhere else to
              spend. 2026-08-07: fuses an OWNED stat-ladder part from
              inventory (consumed on fuse), not a straight credit-only
              upgrade — the escalating credit cost is shown as soon as a
              part and a ship are picked, same as it always was, just one
              step earlier in the flow now that there's a part to pick first. */}
          <h3>Foundry</h3>
          <p className="hint">
            Fuse an owned stat part into a hull — permanent, no slot, and the part is consumed. Credit cost still
            escalates per fusion, any stat, per ship.
          </p>
          {fusableInInventory.length === 0 ? (
            <p className="hint">
              No fusable parts in inventory — buy a stat item first (Hull plating, Gauss coils, Electron computer,
              Ion thruster, or one of their +2/+3 upgrades). Base fuse price, before any prior fusions on that ship:{' '}
              {FUSION_STAT_ORDER.map((stat, i) => (
                <span key={stat}>
                  {i > 0 && ' · '}
                  {FUSION_STAT_BASE[stat]}cr {FUSION_STAT_ABBR[stat]}
                </span>
              ))}
              .
            </p>
          ) : (
            <div className="shop-screen__offers">
              {fusableInInventory.map((partId) => {
                const part = getPart(partId);
                return (
                  <button
                    key={partId}
                    type="button"
                    className={`card-tile card-tile--deep-scan${selectedFusionPart === partId ? ' card-tile--selected' : ''}`}
                    onClick={() => setSelectedFusionPart(partId)}
                  >
                    <span className="card-tile__name">{part.name}</span>
                    <span className="card-tile__desc">{part.description}, permanent, consumed on fuse.</span>
                  </button>
                );
              })}
            </div>
          )}
          {/* fusableInInventory.includes(...), not just FUSABLE_PARTS[...] —
              once the last copy is consumed, this step disappears instead
              of showing a stale, silently-refused ship-pick (the exact
              "UI shows it as usable, reducer quietly refuses" bug class
              fixed elsewhere this session for Lone flagship's slots). */}
          {selectedFusionPart && fusableInInventory.includes(selectedFusionPart) && (
            <>
              <p className="hint">Fuse into which ship?</p>
              <ShipPickRow
                fleet={fleet}
                onPick={(i) => onFuseStat(i, selectedFusionPart)}
                noteFor={(ship) => {
                  const fusable = FUSABLE_PARTS[selectedFusionPart]!;
                  return `${fusionCost(fusable.stat, ship, fusable.amount)} cr`;
                }}
                disabledFor={(ship) => {
                  const fusable = FUSABLE_PARTS[selectedFusionPart]!;
                  return credits < fusionCost(fusable.stat, ship, fusable.amount) || !!ship.mercenary;
                }}
                titleFor={(ship) =>
                  ship.mercenary ? "A mercenary won't carry a permanent fusion past its one fight." : undefined
                }
              />
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
          Leave shop
        </button>
      </div>
    </div>
  );
}
