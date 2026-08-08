// Iteration 47.2b: this file used to be resolver.ts, home to both
// resolveHit AND a full one-shot combat engine (resolveCombat) — the
// pre-dice-rework engine, superseded by combatEngine.ts's initCombat/
// runToEnd (which is turn-by-turn, reaction-card-aware, and has its own
// CombatShip/pickTarget with taunt/cloak/random-targeting rules this
// old copy never had). resolveCombat had zero production callers left
// (only its own test file) and its private CombatShip type silently
// diverged from combatEngine's real one — actively misleading to anyone
// reading it as documentation. Deleted along with resolveCombat,
// pickTarget, remainingHp, isAlive, and CombatResult (types.ts); only
// resolveHit — the shared hit-math primitive both combatEngine.ts and
// (previously) resolver.ts's own engine called — survives, renamed to
// match its shrunken scope.

// `chaffActive` (iteration 8, addendum A.3): while the chaff launcher active
// is armed for the defending ship this round, a natural 6 (or `maxRoll`,
// iteration 40) is no longer an automatic hit — it resolves as a normal
// roll instead. `maxRoll` defaults to 6; an overcharged die rolls on 7
// faces, and its top face (7) is the one that always hits, not 6.
export function resolveHit(
  raw: number,
  attackerComputer: number,
  defenderShield: number,
  chaffActive = false,
  maxRoll = 6,
): boolean {
  if (raw === maxRoll && !chaffActive) return true;
  if (raw === 1) return false;
  return raw + attackerComputer - defenderShield >= 6;
}
