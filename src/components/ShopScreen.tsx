import { useState } from 'react';
import type { CommanderId } from '../game/commanders';
import { FRAMES, MAX_FLEET_SIZE } from '../game/frames';
import { getPart } from '../game/parts';
import type { ActiveQuest } from '../game/quests';
import {
  DEEP_SCAN_INTEL_COST,
  DOSSIER_INTEL_COST,
  ESCALATION_INTERCEPT_INTEL_COST,
  QUEST_STAKE,
  rerollCost,
  SECTOR_SCAN_INTEL_COST,
} from '../game/reducer';
import { playerShipLabel } from '../game/ship';
import type { PartId, PlayerShipState, RunState } from '../game/types';
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
  recon: 'Visit it for an intel bundle: +2 columns of vision, the next escalation, and +3 intel.',
};

interface ShopScreenProps {
  credits: number;
  intel: number;
  offers: PartId[];
  fleet: PlayerShipState[];
  inventory: PartId[];
  bossRevealed: boolean;
  shopIntel: RunState['shopIntel'];
  shopQuestOffer?: ActiveQuest;
  activeQuest?: ActiveQuest;
  commanderId?: CommanderId;
  onBuyPart: (offerIndex: number) => void;
  onSellPart: (partId: PartId) => void;
  onBuyShip: (frameId: 'interceptor' | 'bastion' | 'dreadnought' | 'light-cruiser') => void;
  onScuttle: (shipIndex: number) => void;
  onBuyDossier: () => void;
  onBuySectorScan: () => void;
  onBuyDeepScan: (row: number) => void;
  onBuyEscalationIntercept: () => void;
  onAcceptQuest: (carrierShipIndex?: number) => void;
  onMoveCargoPod: (toShipIndex: number) => void;
  onReroll: () => void;
  onLeave: () => void;
  onViewMap: () => void;
  onEquip: (shipIndex: number, partId: PartId) => void;
  onUnequip: (shipIndex: number, partId: PartId) => void;
}

export function ShopScreen({
  credits,
  intel,
  offers,
  fleet,
  inventory,
  bossRevealed,
  shopIntel,
  shopQuestOffer,
  activeQuest,
  commanderId,
  onBuyPart,
  onSellPart,
  onBuyShip,
  onScuttle,
  onBuyDossier,
  onBuySectorScan,
  onBuyDeepScan,
  onBuyEscalationIntercept,
  onAcceptQuest,
  onMoveCargoPod,
  onReroll,
  onLeave,
  onViewMap,
  onEquip,
  onUnequip,
}: ShopScreenProps) {
  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const safeSelectedIndex = Math.min(selectedShipIndex, fleet.length - 1);
  const fleetFull = fleet.length >= MAX_FLEET_SIZE;
  const effectiveRerollCost = rerollCost(commanderId);

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
            const part = getPart(partId);
            return (
              <PartCard
                key={`${partId}-${i}`}
                part={part}
                showCost
                onClick={credits >= part.cost ? () => onBuyPart(i) : undefined}
                disabled={credits < part.cost}
              />
            );
          })}
        </div>
      )}
      <button type="button" className="shop-button" onClick={onReroll} disabled={credits < effectiveRerollCost}>
        Reroll stock ({effectiveRerollCost} cr)
      </button>

      <h3>Intel</h3>
      <p className="hint">Priced in intel, not credits — earned from combat wins, never bought with guns money.</p>
      <div className="shop-screen__offers">
        <button
          type="button"
          className="card-tile"
          onClick={onBuySectorScan}
          disabled={shopIntel?.sectorScan || intel < SECTOR_SCAN_INTEL_COST}
        >
          <span className="card-tile__name">Sector scan</span>
          <span className="card-tile__desc">
            {shopIntel?.sectorScan
              ? 'Already scanned this visit.'
              : 'Reveal node types in the next 2 columns beyond your current vision.'}
          </span>
          <span className="frame-card__cost">{SECTOR_SCAN_INTEL_COST} intel</span>
        </button>

        <div className="card-tile card-tile--deep-scan">
          <span className="card-tile__name">Deep scan</span>
          <span className="card-tile__desc">
            {shopIntel?.deepScan
              ? 'Already scanned this visit.'
              : 'Pick a lane — reveal every node in that row through column 7.'}
          </span>
          <span className="frame-card__cost">{DEEP_SCAN_INTEL_COST} intel</span>
          <div className="card-tile__lane-buttons">
            {[0, 1, 2].map((row) => (
              <button
                key={row}
                type="button"
                className="shop-button"
                onClick={() => onBuyDeepScan(row)}
                disabled={shopIntel?.deepScan || intel < DEEP_SCAN_INTEL_COST}
              >
                Lane {row + 1}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="card-tile"
          onClick={onBuyEscalationIntercept}
          disabled={shopIntel?.escalationIntercept || intel < ESCALATION_INTERCEPT_INTEL_COST}
        >
          <span className="card-tile__name">Escalation intercept</span>
          <span className="card-tile__desc">
            {shopIntel?.escalationIntercept
              ? 'Already intercepted this visit.'
              : 'Reveal the next unrevealed enemy escalation.'}
          </span>
          <span className="frame-card__cost">{ESCALATION_INTERCEPT_INTEL_COST} intel</span>
        </button>

        <button
          type="button"
          className="card-tile"
          onClick={onBuyDossier}
          disabled={bossRevealed || intel < DOSSIER_INTEL_COST}
        >
          <span className="card-tile__name">Boss dossier</span>
          <span className="card-tile__desc">
            {bossRevealed ? 'Already known — the boss ahead has been identified.' : 'Reveal the identity of the boss waiting at the end of the run.'}
          </span>
          <span className="frame-card__cost">{DOSSIER_INTEL_COST} intel</span>
        </button>

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

      <h3>Expand your fleet</h3>
      {fleetFull ? (
        <p className="hint">Fleet is at maximum size ({MAX_FLEET_SIZE} ships).</p>
      ) : (
        <div className="shop-screen__frames">
          {PURCHASABLE_FRAMES.map((frame) => (
            <button
              key={frame.id}
              type="button"
              className="frame-card"
              onClick={() => onBuyShip(frame.id as 'interceptor' | 'bastion' | 'dreadnought' | 'light-cruiser')}
              disabled={credits < frame.cost}
            >
              <FrameSilhouette frameId={frame.id} size={40} />
              <span className="frame-card__name">{frame.name}</span>
              <span className="frame-card__desc">{frame.blurb}</span>
              <span className="frame-card__cost">{frame.cost} cr</span>
            </button>
          ))}
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
      />

      <div className="shop-screen__footer">
        <button type="button" className="continue-button" onClick={onLeave}>
          Back to map
        </button>
      </div>
    </div>
  );
}
