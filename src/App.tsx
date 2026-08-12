import { useEffect, useReducer, useRef, useState } from 'react';
import { globalColumn } from './game/map';
import { initialRunState, runReducer } from './game/reducer';
import type { RunAction } from './game/reducer';
import { clearRun, loadDailyRecord, loadRun, saveDailyRecord, saveRun } from './game/persistence';
import { dailySeed, dailyShareText } from './game/daily';
import { playerShipLabel } from './game/ship';
import './styles.css';
import { CombatScreen } from './components/CombatScreen';
import { CommanderSelectScreen } from './components/CommanderSelectScreen';
import { EndScreen } from './components/EndScreen';
import { EventScreen } from './components/EventScreen';
import { FlagshipRecoveryScreen } from './components/FlagshipRecoveryScreen';
import { FleetOverlay } from './components/FleetOverlay';
import { InterludeScreen } from './components/InterludeScreen';
import { LandingScreen } from './components/LandingScreen';
import { MapScreen } from './components/MapScreen';
import { PrepScreen } from './components/PrepScreen';
import { ProtocolDraftScreen } from './components/ProtocolDraftScreen';
import { RepairScreen } from './components/RepairScreen';
import { RewardScreen } from './components/RewardScreen';
import { shopToastText } from './components/shopToastText';
import { ShopScreen } from './components/ShopScreen';
import { Starfield } from './components/Starfield';
import { HudBar } from './components/HudBar';
import { SettingsScreen } from './components/SettingsScreen';
import { TabBar } from './components/TabBar';
import { Toast } from './components/Toast';
import type { ToastMessage } from './components/Toast';
import { TutorialOverlay } from './components/TutorialOverlay';
import type { Surface } from './components/TabBar';
import { useIsCompact } from './components/useIsCompact';
import { usePrefersReducedMotion } from './components/useReducedMotion';

// The one Date call in the app (src/game/ is Date-free by test): the LOCAL
// date, so "today's daily" matches the player's own calendar.
function todayDateString(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function App() {
  // The lazy initializer runs once at mount: resume the saved run if one
  // exists (mid-combat, hand, used actives — all of it), otherwise start
  // fresh. The state itself is already loaded either way (iteration 9.2);
  // the intro screen below gates *showing* it, every boot, whether or not
  // there's a save — a first-time player used to land straight on commander
  // pick with zero context, so `hasSave` now only decides which buttons the
  // intro offers, not whether it appears at all.
  const [state, dispatch] = useReducer(runReducer, undefined, () => loadRun() ?? initialRunState());
  const [hasSave] = useState(() => loadRun() !== null);
  const [awaitingBootChoice, setAwaitingBootChoice] = useState(true);
  const [savingUnavailable, setSavingUnavailable] = useState(false);

  // Iteration 18: the daily run. All read once at boot — the landing screen
  // is the only consumer, and it only shows at boot.
  const [today] = useState(() => todayDateString());
  const [dailyBoot] = useState(() => ({
    record: loadDailyRecord(),
    save: loadRun(undefined, 'daily'),
  }));
  const todayRecord = dailyBoot.record?.date === today ? dailyBoot.record : null;
  // Resumable only if today's attempt is unfinished AND its save is really
  // today's (a stale yesterday-save is ignored, not resumed).
  const dailyResumable = !!todayRecord && !todayRecord.outcome && dailyBoot.save?.dailyDate === today;
  const dailyPlayable = !todayRecord;

  // Pure view state — no gameplay effect, so it lives outside the reducer.
  // Iteration 16.1: the old viewingMap/viewingFleet booleans are unified
  // into one `surface` state. Desktop renders it as the peek/modal it
  // always was; mobile (≤720px) renders it as fixed bottom tabs — one state
  // machine, two skins. Reset on every phase change so a stale peek/tab
  // never survives into an unrelated screen (e.g. mid-combat) — this also
  // covers the one off-Mission dispatch that matters (PICK_NODE from the
  // Chart tab): the phase change it causes snaps back to Mission for the
  // resulting prep/shop/event, so there's no "unseen input" case and no
  // badge system is needed.
  const [surface, setSurface] = useState<Surface>('mission');
  useEffect(() => {
    setSurface('mission');
  }, [state.phase]);
  const isCompact = useIsCompact();

  // Iteration 25: the "How to play" overlay. Deliberately NOT part of
  // `surface` — it's a dismiss-and-forget reference, not a persistent tab,
  // and it needs to be reachable from the landing screen too (before the
  // phase machine / HUD even exist), so a plain boolean that overlays
  // whatever's currently rendered is simpler than routing it through the
  // surface state machine.
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // 2026-08-08: purchase/install feedback — "Bought X", "Installed Y onto
  // Z". Local view state, same reasoning as `surface` above: a toast is
  // presentation, not something a save/reload or a determinism test should
  // ever need to reason about. `toastIdRef` (not just the text) keys the
  // Toast component's dismiss timer, so firing the exact same message twice
  // in a row (two Ion cannon buys back to back) still resets the animation.
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastIdRef = useRef(0);
  function showToast(text: string) {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, text });
  }

  // 47.3j: replaces 8 copy-pasted `showToast(...); dispatch(...)` shop
  // callbacks — shopToastText derives the message (or null, for actions
  // that don't toast) from the action + current state, purely.
  function dispatchWithToast(action: RunAction) {
    const text = shopToastText(action, state);
    if (text) showToast(text);
    dispatch(action);
  }

  // Autosave after every reducer action, once the landing screen (if any)
  // has been resolved — never while it's still deciding, so a "New run"
  // pick doesn't race a save of the run being abandoned. Dailies write to
  // their own slot so a standard run can coexist.
  useEffect(() => {
    if (awaitingBootChoice) return;
    if (!saveRun(state, undefined, state.mode === 'daily' ? 'daily' : 'standard')) setSavingUnavailable(true);
  }, [state, awaitingBootChoice]);

  // Victory/defeat are terminal — the save has nothing left to resume, and
  // a daily's attempt record gets its final outcome + share text.
  useEffect(() => {
    if (state.phase !== 'victory' && state.phase !== 'defeat') return;
    if (state.mode === 'daily') {
      clearRun(undefined, 'daily');
      saveDailyRecord({
        date: state.dailyDate ?? today,
        outcome: state.phase,
        shareText: dailyShareText(state, state.phase),
      });
    } else {
      clearRun();
    }
  }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps -- fires exactly once per terminal transition

  // Warp-streak wipe between phases (iteration 10.6) — a brief overlay
  // flash on every phase change; skipped entirely under reduced motion.
  const reducedMotion = usePrefersReducedMotion();
  const [warping, setWarping] = useState(false);
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    if (prevPhaseRef.current === state.phase) return;
    prevPhaseRef.current = state.phase;
    if (reducedMotion) return;
    setWarping(true);
    const t = window.setTimeout(() => setWarping(false), 250);
    return () => window.clearTimeout(t);
  }, [state.phase, reducedMotion]);

  // Nothing to confirm away when there was never a save to lose. Shared by
  // both new-run entry points below — a seeded run (iteration 26) is still
  // a new run, just with a chosen sector, and abandons a save the same way.
  function confirmAbandonSaveIfAny(): boolean {
    return !hasSave || window.confirm('Start a new run? This abandons your saved run.');
  }

  function handleNewRun() {
    if (!confirmAbandonSaveIfAny()) return;
    clearRun();
    dispatch({ type: 'NEW_RUN' });
    setAwaitingBootChoice(false);
  }

  function handleNewRunFromSeed(seed: number) {
    if (!confirmAbandonSaveIfAny()) return;
    clearRun();
    dispatch({ type: 'NEW_RUN', seed });
    setAwaitingBootChoice(false);
  }

  // Iteration 18: starting the daily consumes today's attempt (recorded
  // immediately), then boots a run from today's deterministic seed.
  function handleStartDaily() {
    saveDailyRecord({ date: today });
    dispatch({ type: 'NEW_RUN', seed: dailySeed(today), mode: 'daily', dailyDate: today });
    setAwaitingBootChoice(false);
  }

  function handleContinueDaily() {
    if (dailyBoot.save) dispatch({ type: 'LOAD_STATE', state: dailyBoot.save });
    setAwaitingBootChoice(false);
  }

  function handleAbandon() {
    if (!window.confirm('Abandon this run? This cannot be undone.')) return;
    if (state.mode === 'daily') {
      // Abandoning a daily finalizes today's attempt — no second try.
      clearRun(undefined, 'daily');
      saveDailyRecord({
        date: state.dailyDate ?? today,
        outcome: 'abandoned',
        shareText: dailyShareText(state, 'abandoned'),
      });
    } else {
      clearRun();
    }
    dispatch({ type: 'NEW_RUN' });
  }

  if (awaitingBootChoice) {
    return (
      <>
        <Starfield />
        <div className="app">
          <LandingScreen
            hasSave={hasSave}
            onContinue={() => setAwaitingBootChoice(false)}
            onNewRun={handleNewRun}
            dailyDate={today}
            dailyPlayable={dailyPlayable}
            dailyResumable={dailyResumable}
            dailyResult={todayRecord?.outcome ? todayRecord : null}
            onStartDaily={handleStartDaily}
            onContinueDaily={handleContinueDaily}
            onNewRunFromSeed={handleNewRunFromSeed}
          />
        </div>
        {tutorialOpen && <TutorialOverlay onClose={() => setTutorialOpen(false)} />}
      </>
    );
  }

  const showHud = state.phase !== 'commander';
  // Iteration 27: the Settings "Run seed" readout hides itself during the
  // daily — today's seed is the same for every player attempting it today
  // (daily.ts's dailySeed), so showing it here would let a player look it
  // up mid-attempt and pre-scout the one sector everyone's meant to see
  // cold. A standard run has nothing to hide it from.
  const settingsSeed = state.mode === 'daily' ? null : state.map.seed;
  // Peeking at the chart is safe from anywhere mid-run: PICK_NODE is guarded
  // to the 'map' phase, so a peek can never move the fleet by accident.
  const canPeekMap =
    showHud && state.phase !== 'map' && state.phase !== 'victory' && state.phase !== 'defeat';

  // Shared by both <MapScreen> instantiations below (47.3k) — the desktop
  // peek and the live map phase render identical map data, differing only
  // in which of onClose/interactive vs onViewFleet/onAbandon apply.
  const mapProps = {
    map: state.map,
    act: state.act,
    position: state.position,
    visited: state.visited,
    fled: state.fled,
    revealedNodes: state.revealedNodes,
    visionCol: state.visionCol,
    escalations: state.escalations,
    bossRevealed: state.bossRevealed,
    onPickNode: (row: number, col: number) => dispatch({ type: 'PICK_NODE', row, col }),
  };

  // The Map surface, shared between desktop's peek (early-return below) and
  // mobile's tab (rendered inline further down). Both keep a real Close/Back
  // button now (iteration 35 dropped the Mission tab that used to be
  // mobile's only way off this screen); mobile stays read-only outside the
  // live map phase, so a read-only tab doesn't show pick affordances it
  // can't act on.
  const chartSurface = (
    <MapScreen {...mapProps} onClose={() => setSurface('mission')} interactive={isCompact ? state.phase === 'map' : true} />
  );

  if (!isCompact && surface === 'chart' && canPeekMap) {
    return (
      <>
        <Starfield act={state.act} />
        <div className="app">
          <HudBar credits={state.credits} heat={state.heat} daily={state.mode === 'daily'} />
          {chartSurface}
        </div>
        {tutorialOpen && <TutorialOverlay onClose={() => setTutorialOpen(false)} />}
      </>
    );
  }

  // Mobile shows exactly one surface at a time (the tab bar picks which);
  // desktop always shows Mission underneath, with Chart as the early-return
  // peek above and Fleet as an additive modal — both unchanged from before.
  const showMission = !isCompact || surface === 'mission';

  // Iteration 20 (commodity runs), per-ship since iteration 21 (the
  // Merchant can carry 2 at once — see PlayerShipState.commodityLotBought-
  // AtGlobalColumn): a lot is sellable only at a station reached AFTER the
  // one it was bought at. True if ANY carried lot qualifies; ShopScreen's
  // sell action itself sweeps every eligible one, not just one.
  const commodityLotSellable =
    state.position !== null &&
    state.fleet.some(
      (s) =>
        s.commodityLotBoughtAtGlobalColumn !== undefined &&
        globalColumn(state.act, state.position!.col) > s.commodityLotBoughtAtGlobalColumn,
    );

  return (
    <>
    <Starfield act={state.act} />
    <div className={`app${isCompact && showHud ? ' app--tabbed' : ''}`}>
      {warping && <div className="warp-transition" aria-hidden="true" />}
      {showHud && (
        <HudBar
          credits={state.credits}
          heat={state.heat}
          commanderId={state.commanderId}
          daily={state.mode === 'daily'}
          onViewMap={canPeekMap ? () => setSurface('chart') : undefined}
          onOpenSettings={() => setSurface('settings')}
          onOpenTutorial={() => setTutorialOpen(true)}
        />
      )}
      {savingUnavailable && <p className="warning">Saving unavailable — this run won't be saved if you close the tab.</p>}

      {showMission && (
        <>
          {state.phase === 'commander' && (
            <CommanderSelectScreen
              choices={state.commanderChoices}
              startingEquipped={state.fleet[0]?.equipped ?? []}
              onChoose={(commanderId) => dispatch({ type: 'CHOOSE_COMMANDER', commanderId })}
            />
          )}

          {state.phase === 'map' && (
            <MapScreen {...mapProps} onViewFleet={() => setSurface('fleet')} onAbandon={handleAbandon} />
          )}

          {state.phase === 'prep' && <PrepScreen state={state} dispatch={dispatch} />}

          {state.phase === 'combat' && state.combat && state.currentEnemy && (
            <CombatScreen
              combat={state.combat}
              enemy={state.currentEnemy}
              playerLabels={state.fleet.map((_, i) => playerShipLabel(state.fleet, i))}
              playerFrameIds={state.fleet.map((ship) => ship.frameId)}
              onAdvanceRound={() => dispatch({ type: 'ADVANCE_ROUND' })}
              onContinue={() => dispatch({ type: 'CONTINUE' })}
              onUseActive={(shipIndex, abilityIndex) => dispatch({ type: 'USE_ACTIVE', shipIndex, abilityIndex })}
              onSelectEnemy={(index) => dispatch({ type: 'SET_PRIORITY_TARGET', index })}
              onIssueOrder={(order, targetIndex) => dispatch({ type: 'ISSUE_ORDER', order, targetIndex })}
            />
          )}

          {state.phase === 'reward' && state.pendingReward && (
            <RewardScreen
              reward={state.pendingReward}
              fleet={state.fleet}
              onPickUpgrade={(upgradeId, shipIndex) => dispatch({ type: 'PICK_UPGRADE', upgradeId, shipIndex })}
              onLeave={() => dispatch({ type: 'LEAVE_REWARD' })}
            />
          )}

          {state.phase === 'shop' && state.shopOffers && (
            <ShopScreen
              credits={state.credits}
              offers={state.shopOffers}
              frameOffers={state.shopFrameOffers}
              kind={state.shopKind}
              fleet={state.fleet}
              inventory={state.inventory}
              commanderId={state.commanderId}
              protocols={state.protocols}
              counterProtocol={state.counterProtocol}
              commodityLotSellable={commodityLotSellable}
              onBuyPart={(offerIndex) => dispatchWithToast({ type: 'BUY_PART', offerIndex })}
              onSellPart={(partId) => dispatch({ type: 'SELL_PART', partId })}
              onBuyShip={(frameId) => dispatchWithToast({ type: 'BUY_SHIP', frameId })}
              onUpgradeMark={(shipIndex) => dispatchWithToast({ type: 'UPGRADE_MARK', shipIndex })}
              onScuttle={(shipIndex) => dispatch({ type: 'SCUTTLE_SHIP', shipIndex })}
              onBuyCommodityLot={() => dispatchWithToast({ type: 'BUY_COMMODITY_LOT' })}
              onSellCommodityLot={() => dispatch({ type: 'SELL_COMMODITY_LOT' })}
              onBuyMercenary={() => dispatchWithToast({ type: 'BUY_MERCENARY' })}
              onBuyRepair={(shipIndex) => dispatchWithToast({ type: 'BUY_REPAIR', shipIndex })}
              onLeave={() => dispatch({ type: 'LEAVE_SHOP' })}
              onViewMap={() => setSurface('chart')}
              onEquip={(shipIndex, partId) => dispatch({ type: 'EQUIP', shipIndex, partId })}
              onUnequip={(shipIndex, partId) => dispatch({ type: 'UNEQUIP', shipIndex, partId })}
            />
          )}

          {state.phase === 'interlude' && (
            <InterludeScreen
              fleet={state.fleet}
              onChoose={(shipIndex) => dispatch({ type: 'INTERLUDE_CHOOSE', shipIndex })}
            />
          )}

          {state.phase === 'protocol-draft' && state.protocolOffers && (
            <ProtocolDraftScreen
              offers={state.protocolOffers}
              counterOffers={state.protocolCounterOffers}
              onChoose={(index) => dispatch({ type: 'PROTOCOL_CHOOSE', index })}
            />
          )}

          {state.phase === 'flagship-recovery' && state.pendingFlagshipRecovery && (
            <FlagshipRecoveryScreen
              shipName={state.pendingFlagshipRecovery.shipName}
              cost={state.pendingFlagshipRecovery.cost}
              credits={state.credits}
              onResolve={(recover) => dispatch({ type: 'RESOLVE_FLAGSHIP_RECOVERY', recover })}
            />
          )}

          {state.phase === 'repair' && state.repairUpgradeOptions && (
            <RepairScreen
              fleet={state.fleet}
              upgradeOptions={state.repairUpgradeOptions}
              summary={state.repairSummary}
              onChooseFull={() => dispatch({ type: 'REPAIR_CHOOSE', choice: 'full' })}
              onChooseOverhaul={(upgradeId, shipIndex) =>
                dispatch({ type: 'REPAIR_CHOOSE', choice: 'overhaul', shipIndex, upgradeId })
              }
              onContinue={() => dispatch({ type: 'LEAVE_REPAIR' })}
            />
          )}

          {state.phase === 'event' && state.currentEvent && (
            <EventScreen
              state={state}
              onChoose={(choiceIndex, shipIndex, partId) => dispatch({ type: 'EVENT_CHOOSE', choiceIndex, shipIndex, partId })}
              onContinue={() => dispatch({ type: 'EVENT_CONTINUE' })}
              onViewMap={() => setSurface('chart')}
              onViewFleet={() => setSurface('fleet')}
            />
          )}

          {(state.phase === 'victory' || state.phase === 'defeat') && (
            <EndScreen
              outcome={state.phase}
              column={state.position?.col ?? 0}
              act={state.act}
              credits={state.credits}
              visitedCount={state.visited.length}
              fleet={state.fleet}
              runStats={state.runStats}
              dailyShare={state.mode === 'daily' ? dailyShareText(state, state.phase) : undefined}
              seed={settingsSeed}
              onNewRun={() => dispatch({ type: 'NEW_RUN' })}
            />
          )}
        </>
      )}

      {isCompact && surface === 'chart' && chartSurface}

      {surface === 'fleet' && (
        <FleetOverlay
          fleet={state.fleet}
          inventory={state.inventory}
          commanderId={state.commanderId}
          protocols={state.protocols}
          counterProtocol={state.counterProtocol}
          isCompact={isCompact}
          onClose={() => setSurface('mission')}
        />
      )}

      {surface === 'settings' && (
        <SettingsScreen
          seed={settingsSeed}
          protocols={state.protocols}
          counterProtocol={state.counterProtocol}
          isCompact={isCompact}
          onClose={() => setSurface('mission')}
        />
      )}
    </div>
    {isCompact && showHud && <TabBar surface={surface} onSelect={setSurface} />}
    {tutorialOpen && <TutorialOverlay onClose={() => setTutorialOpen(false)} />}
    <Toast toast={toast} />
    </>
  );
}

export default App;
