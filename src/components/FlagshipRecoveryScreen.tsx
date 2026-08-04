interface FlagshipRecoveryScreenProps {
  shipName: string;
  cost: number;
  credits: number;
  onResolve: (recover: boolean) => void;
}

// Iteration 24: the Flagship is the one hull that can never be rebought —
// losing it in a fight the fleet otherwise survives used to just mean it
// was gone for good. This is the one-time offer that gates whatever the
// fight's normal outcome screen was (reward/interlude/victory/map) until
// the player decides: pay to rebuild the wreck, or let it go.
export function FlagshipRecoveryScreen({ shipName, cost, credits, onResolve }: FlagshipRecoveryScreenProps) {
  const canAfford = credits >= cost;
  return (
    <div className="flagship-recovery-screen">
      <h2>{shipName} is gone</h2>
      <p className="hint">
        The hull didn't survive, but the wreck is still out there. Salvage crews think the frame's core structure is
        intact — rebuilding it strips whatever it was carrying, but it's the same ship, not a replacement.
      </p>

      <div className="flagship-recovery-screen__options">
        <button type="button" className="card-tile" onClick={() => onResolve(true)} disabled={!canAfford}>
          <span className="card-tile__name">Recover the wreck</span>
          <span className="card-tile__desc">
            Rebuilds {shipName} — empty loadout, no upgrade, same name and combat record.
          </span>
          <span className="frame-card__cost">{cost} cr</span>
        </button>
        <button type="button" className="card-tile" onClick={() => onResolve(false)}>
          <span className="card-tile__name">Let her go</span>
          <span className="card-tile__desc">The fleet carries on without her.</span>
        </button>
      </div>

      {!canAfford && <p className="warning">Not enough credits to recover the wreck ({cost} cr needed).</p>}
    </div>
  );
}
