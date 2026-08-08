import { FUSABLE_PARTS, FUSION_STAT_ABBR, FUSION_STAT_BASE, FUSION_STAT_ORDER, fusionCost } from '../game/ship';
import { getPart } from '../game/parts';
import { SHIPYARD_UPGRADE_COST } from '../game/reducer';
import type { PartId, PlayerShipState } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';
import { ShipPickRow } from './ShipPickRow';

// 47.4.2: extracted from ShopScreen — the shipyard-only sections (upgrade
// bay, Foundry). Iteration 33: a store stocks neither — it sells
// permanence, not consumables — so these two sections and ShopScreen's
// StoreSections counterpart never render together.
interface ShipyardSectionsProps {
  upgradeOffer?: UpgradeId;
  fleet: PlayerShipState[];
  credits: number;
  onBuyUpgrade: (shipIndex: number) => void;
  fusableInInventory: PartId[];
  selectedFusionPart: PartId | null;
  onSelectFusionPart: (partId: PartId) => void;
  onFuseStat: (shipIndex: number, partId: PartId) => void;
}

export function ShipyardSections({
  upgradeOffer,
  fleet,
  credits,
  onBuyUpgrade,
  fusableInInventory,
  selectedFusionPart,
  onSelectFusionPart,
  onFuseStat,
}: ShipyardSectionsProps) {
  return (
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

      {/* Iteration 31: the Foundry — fuse a part's worth of power directly
          into a hull. Permanent, slotless; the late-run credit sink for a
          fleet with full slots and nowhere else to spend. 2026-08-07:
          fuses an OWNED stat-ladder part from inventory (consumed on
          fuse), not a straight credit-only upgrade — the escalating
          credit cost is shown as soon as a part and a ship are picked,
          same as it always was, just one step earlier in the flow now
          that there's a part to pick first. */}
      <h3>Foundry</h3>
      <p className="hint">
        Fuse an owned stat part into a hull — permanent, no slot, and the part is consumed. Credit cost still
        escalates per fusion, any stat, per ship.
      </p>
      {fusableInInventory.length === 0 ? (
        <p className="hint">
          No fusable parts in inventory — buy a stat item first (Hull plating, Gauss coils, Electron computer, Ion
          thruster, or one of their +2/+3 upgrades). Base fuse price, before any prior fusions on that ship:{' '}
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
                onClick={() => onSelectFusionPart(partId)}
              >
                <span className="card-tile__name">{part.name}</span>
                <span className="card-tile__desc">{part.description}, permanent, consumed on fuse.</span>
              </button>
            );
          })}
        </div>
      )}
      {/* fusableInInventory.includes(...), not just FUSABLE_PARTS[...] — once
          the last copy is consumed, this step disappears instead of showing
          a stale, silently-refused ship-pick (the exact "UI shows it as
          usable, reducer quietly refuses" bug class fixed elsewhere this
          session for Lone flagship's slots). */}
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
  );
}
