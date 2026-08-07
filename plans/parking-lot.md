## Parking lot (discussed, deliberately deferred)

- **Per-hull innate base quirks** (parked from iteration 36, 2026-08-07):
  once the signature-part bundles are stripped, each surviving hull could
  gain a jink-style innate quirk (something a part can't replicate) so
  bases differentiate on more than slots/HP/caps. Deliberately NOT part of
  36 — that iteration opens the design space, a later content pass fills
  it.
- **More legendary parts** (parked from iteration 36): the legendary tier
  launches with only the shield harmonic. Seed 1–2 genuinely
  legendary-grade effects (fleet-wide or rule-bending, not bigger stat
  sticks) once the rarity system has been felt in play.
- **Carrier frame** (launches free drone dice/ships mid-combat): needs new
  resolver machinery (mid-combat ship spawning). Belongs in a "bigger
  fights" iteration alongside any move to more rounds / larger fleets.
- **Spread-fire doctrine stance**: iteration 9 ships focus-weakest /
  focus-strongest; add a third "spread" stance only when a fight exists
  that wants it.
- **Capacitor lance** (1 die, 4 dmg, fires every other round) and **Burst
  capacitor** (active: +1 dmg on this ship's cannon dice for a round):
  cut from iteration 7 for overlap with antimatter and Targeting uplink;
  revisit if the arsenal wants more timing texture.
- **Trader mini-shop rework** (`wandering-trader` still retired from the
  event pool). Partially superseded by iteration 20's commodity runs —
  revisit only if shops still feel flat after 20 ships.
- **Shops selling reaction cards: decided against (2026-08-04).** Proposed
  in iteration 20's spec as a war-asset sink, but `cards.ts` already has a
  standing law from iteration 7: "cards are found, never bought — the shop
  no longer sells them." The spec was written without knowing that law
  existed; implementation caught the conflict and dropped the feature
  rather than silently reversing iteration 7. The mercenary escort (20.5,
  shipped) covers the same "give late wealth a mouth" goal without it. Do
  not re-propose card sales without deliberately revisiting the iteration-7
  decision first.
- **Audio pass** (deliberately not a rider on iteration 10's visual
  overhaul): a small set of synthesized/bundled SFX for the combat
  theater's event replay (shots, hits, destruction, warp), mute by
  default, volume in a settings corner. Music optional and last.
- **Hazard tags on combat nodes** (nebula, solar flare): was "hold until
  escalation has been play-tested." As of iteration 15's planning
  (2026-08-02), the heat/pursuit track now occupies the second
  map-pressure slot these were held for — parked indefinitely; do not
  revisit without retiring or merging with heat.
- **Energy/reactor system: decided against.** Slots + credits + weapon caps
  already generate the tension; a third constraint isn't worth its UI.
- **Further random-outcome dice: decided against** beyond the rift cannon.
  The forecast bar is the game's core instrument; too much variance
  undermines it.
- **Re-arm the balance gate** once the feature pace slows: refresh the
  reference fleets (add a taunt-turtle build), re-derive target bands per
  boss, and reinstate the script as a milestone gate.
- **Veterancy scaling by percentage, not flat HP (found 2026-08-04, iteration
  22.3):** `applyVeterancy`'s flat `+1`/`+2` HP is a 100% toughness increase
  for a 1-HP squadron ship (Interceptor swarm) but only 33-50% for a
  single-hull enemy at HP 3-4 — the same bonus hits low-HP-per-ship
  formations far harder than the design likely intended. Interceptor swarm
  was measurably the single deadliest enemy in the roster post-22.1 because
  of this; partially mitigated by cutting its ship count 4→3, not fixed at
  the mechanic level. A proper fix (percentage-based bonus, or excluding
  sub-2-HP ships from flat bonuses) touches every pool and every other
  iteration that assumes flat veterancy math — needs its own scoped pass,
  not a drive-by.

- **Risk-economy bundle: combat wagers, elite contracts, "stakes raise
  the draft tier" (deferred by scope choice 2026-08-06, iteration 28):**
  the other half of the augment design discussion. Wagers = stake credits
  before a fight on a declared condition (win without losing a ship,
  clear in ≤N rounds), legible because the dice math is transparent.
  Elite contracts = opt-in to add a named escalation to a known upcoming
  fight for a reward-tier bump. The unifying model — accepting stakes
  upgrades a protocol draft's tier — was the recommended design; the user
  chose the smaller boss-rewards-only scope for iteration 28 instead.
  Deferred, not rejected: this is the natural iteration 29 if protocols
  land well, and it reuses 28's tier machinery. Other risk mechanics from
  the same discussion, unscheduled: debt broker (borrow now, scheduled
  bounty-hunter ambush at a known column unless repaid), prototype parts
  with deterministic wear/burnout, irreversible overhaul-yard frame
  mutations, survival streaks (perks for going unrepaired — note the
  Admiral-ace identity overlap), volatile cargo (artifact pays out iff
  the carrying ship reaches the boss alive).
- **Vanity/phrase seeds (parked 2026-08-06, iteration 27):** hashing an
  arbitrary typed phrase into a seed (Slay-the-Spire style, via `daily.ts`'s
  existing FNV-1a hash) instead of requiring a strict Crockford code.
  Rejected as a *replacement* because a hash always "succeeds" — a
  genuinely mistyped strict code would silently resolve to a different,
  valid-looking sector instead of failing loudly (see `seedCode.ts`'s
  wrap-around bug, iteration 27's whole reason for existing). Could return
  as an *additional*, clearly-distinguished input mode later, not a
  replacement for the validated 7-character code.
- **Combat-interaction bundle (pitched 2026-07-27, user passed):**
  click-targeted actives (disruptor pulse / tractor snare / painter),
  cooldown-or-charge active economy, per-fight battle-plan drafts, and
  interaction-hooked weapons (ramp laser, suppressor, disruptor beam,
  ammo-limited heavy driver). The user chose the iteration-17 Outspeed
  initiative rework instead — don't re-pitch this bundle wholesale,
  though individual weapons may return with a future arsenal pass.
  *Enemy intent telegraphs were revived by the user on 2026-08-03 and
  shipped as iteration 19.*

### New-dimension candidates (discussed 2026-07-26, unscheduled)

- **Combat objectives** — fights won by something other than "kill
  everything": survive N rounds (convoy escapes), assassinate the flagship
  (escorts flee when it dies), protect a friendly hulk. Reuses the whole
  engine; needs win-condition hooks. Strongest candidate for the next
  combat-variety iteration.
- **Meta-unlocks + ascension dial** — the rest of the persistence bundle
  (save/resume itself is iteration 9): commanders/parts earned across
  runs, difficulty tiers after a win. Cheap once iteration 9's storage
  layer exists; needs its own content design first.
- **Faction reputation** — 2–3 enemy factions owning different nodes;
  farming one raises its heat (faster veterancy, hunting elites) while
  others' shops warm to you. "Who do you farm" becomes a routing dial.
- **Enemy doctrines** — per-enemy targeting behaviors (focus the flagship,
  spread fire, retreat when losing — giving the *enemy* the retreat verb).
  Cheap texture once mixed formations land.
- **Officers** — a named officer per ship granting a perk, ranking up with
  kills. Overlaps the one-upgrade-per-ship identity; if ever done,
  consider reflavoring upgrades *as* officers rather than adding a second
  attachment system. Iteration 21's Admiral ace-pilots (+1 init at 3
  kills) is the cheap version of this — full officers stay parked unless
  aces prove the appetite.
