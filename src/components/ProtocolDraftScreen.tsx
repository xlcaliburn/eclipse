import { getCounterProtocol } from '../game/counterProtocols';
import type { CounterProtocolId } from '../game/counterProtocols';
import { getProtocol } from '../game/protocols';
import type { ProtocolId } from '../game/protocols';

interface ProtocolDraftScreenProps {
  offers: ProtocolId[]; // always exactly [silver, gold, prismatic] — see reducer.ts's drawProtocolOffers
  // Iteration 30: index-paired with offers — counterOffers[i] answers
  // offers[i]'s tier. Undefined on a legacy save mid-draft from before
  // counter-protocols existed; every card simply shows no enemy-answer line.
  counterOffers?: CounterProtocolId[];
  onChoose: (index: 0 | 1 | 2) => void;
}

const TIER_LABEL: Record<string, string> = {
  silver: 'Silver',
  gold: 'Gold',
  prismatic: 'Prismatic',
};

// Iteration 28: the act-1 boss's second reward, right after the guaranteed
// upgrade pick (InterludeScreen) — once per run, since act 2 ends the run.
// Always one offer per tier, so this is a real tier choice every time, not
// a chance at one. Transparency law: a prismatic's cost is on the card,
// in the same warning color the rest of the app already uses for
// consequential text, always visible before the click — never a surprise
// discovered after picking.
//
// Iteration 30: every card also states its enemy answer — whatever tier is
// picked, act 2's enemies gain a same-tier counter for the rest of the run.
// The prismatic card now shows BOTH its own cost line and its counter —
// that's the point: the biggest number comes with the biggest answer.
export function ProtocolDraftScreen({ offers, counterOffers, onChoose }: ProtocolDraftScreenProps) {
  return (
    <div className="protocol-draft-screen">
      <h2>Field protocols</h2>
      <p className="hint">
        The boss's defeat unlocks a fleet-wide protocol for the rest of the run — one pick, spanning every tier. It
        carries into act two and stays for good. Whatever tier you pick, act 2's enemies gain a same-tier answer.
      </p>

      <div className="protocol-draft-screen__offers">
        {offers.map((protocolId, i) => {
          const protocol = getProtocol(protocolId);
          const counterId = counterOffers?.[i];
          const counter = counterId ? getCounterProtocol(counterId) : undefined;
          return (
            <button
              key={protocolId}
              type="button"
              className={`protocol-card protocol-card--${protocol.tier}`}
              onClick={() => onChoose(i as 0 | 1 | 2)}
            >
              <span className="protocol-card__tier">{TIER_LABEL[protocol.tier]}</span>
              <span className="protocol-card__name">{protocol.name}</span>
              <span className="protocol-card__desc">{protocol.blurb}</span>
              {protocol.cost && <span className="protocol-card__cost">Cost: {protocol.cost}</span>}
              {counter && (
                <span className="protocol-card__counter">
                  The enemy adapts: {counter.name} — {counter.blurb}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
