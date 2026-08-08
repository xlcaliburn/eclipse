import { shipUpgradeNote } from '../game/ship';
import type { PlayerShipState } from '../game/types';
import { ShipPickRow } from './ShipPickRow';

interface InterludeScreenProps {
  fleet: PlayerShipState[];
  onChoose: (shipIndex: number) => void;
}

// 2026-08-04: the boss's real reward — the fleet is already fully healed
// and the credits already banked by the time this screen shows (CONTINUE
// does both before entering the interlude phase). The only thing left
// pending is which ship banks the guaranteed upgrade; this used to be one
// of three competing choices (Refit / War chest / Field promotion), which
// meant a boss kill could net nothing more than a slightly bigger paycheck.
export function InterludeScreen({ fleet, onChoose }: InterludeScreenProps) {
  return (
    <div className="interlude-screen">
      <h2>The long war continues</h2>
      <p className="hint">
        Act one is behind you. The fleet is fully repaired — pick a ship to carry a field promotion into act two.
      </p>

      <div className="interlude-screen__ship-picks">
        <ShipPickRow
          fleet={fleet}
          onPick={onChoose}
          noteFor={shipUpgradeNote}
          titleFor={(ship) => shipUpgradeNote(ship) ?? undefined}
        />
      </div>
    </div>
  );
}
