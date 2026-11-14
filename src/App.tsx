import { useCallback, useEffect, useRef, useState } from 'react';
import { DailyRewardModal } from './components/DailyRewardModal';
import { GameHud } from './components/GameHud';
import { LoadingScreen } from './components/LoadingScreen';
import { PushSmsBanner } from './components/PushSmsBanner';
import { ShopModal } from './components/ShopModal';
import { StatusModals } from './components/StatusModals';
import { TamperLockoutModal } from './components/TamperLockoutModal';
import { TitleScreen } from './components/TitleScreen';
import { TutorialOverlay } from './components/TutorialOverlay';
import {
  type IntegrityViolation,
  triggerSecurityExit,
  verifyGameIntegrity,
} from './game/anticheat';
import { soundEngine } from './game/audio';
import { WEAPONS, createInitialUpgrades } from './game/constants';
import { ZombieForestEngine } from './game/engine';
import { getXpToNextLevel, pickRandomLoadingTip } from './game/rules';
import type { HudSnapshot } from './game/types';

const LAST_TIP_STORAGE_KEY = 'dark_thicket_last_tip_idx';

const INITIAL_HUD: HudSnapshot = {
  screenState: 'title',
  hp: 100,
  maxHp: 100,
  armor: 0,
  maxArmor: 50,
  coins: 0,
  totalCoinsEarned: 0,
  kills: 0,
  playerLevel: 1,
  xp: 0,
  xpToNext: getXpToNextLevel(1),
  roundXpEarned: 0,
  didLevelUpInRound: false,
  newlyUnlockedBiomeName: null,
  isTutorialMatch: false,
  tutorialStep: 'menu_intro',
  tutorialCombatStage: 'move',
  waveNumber: 1,
  totalWaves: 7,
  biomeId: 'pine_forest',
  biomeName: 'Хвойный лес',
  selectedBiomeId: 'pine_forest',
  unlockedBiomes: ['pine_forest'],
  clearedBiomes: [],
  difficulty: 'normal',
  currentSurface: 'gravel',
  surfaceLabel: 'Гравий и листва',
  isBossWave: false,
  bossName: 'ТИТАН ЧАЩИ',
  bossHp: 0,
  bossMaxHp: 0,
  waveRemaining: 0,
  waveTotal: 0,
  activeWeaponId: 'rusty_pistol',
  ownedWeapons: ['rusty_pistol'],
  upgrades: createInitialUpgrades(),
  activeSkinId: 'ranger',
  ownedSkins: ['ranger'],
  vitalityLevel: 0,
  armorLevel: 0,
  ammoInMag: WEAPONS.rusty_pistol.baseMagSize,
  magSize: WEAPONS.rusty_pistol.baseMagSize,
  isReloading: false,
  reloadProgress: 1,
  bannerText: '',
  bannerSubtext: '',
  bestKills: 0,
  trophies: 0,
  roundTrophiesEarned: 0,
  shopOpen: false,
  dailyStreak: 0,
  dailyLastClaimDay: null,
  dailyCanClaim: true,
  dailyNextDayIndex: 0,
  dailyModalOpen: false,
  pushEnabled: true,
  pushPermission: 'default',
  activePushSms: null,
  muted: false,
  musicVolume: 0.72,
  sfxVolume: 0.85,
};

function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.innerHeight > window.innerWidth ||
    Math.max(window.innerWidth, window.innerHeight) <= 900
  );
}

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ZombieForestEngine | null>(null);
  const userToggledTouchRef = useRef(false);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [tamperViolation, setTamperViolation] = useState<IntegrityViolation | null>(null);
  const [securityExited, setSecurityExited] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState<boolean>(detectTouchDevice);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.visualViewport?.width || window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.visualViewport?.height || window.innerHeight : 720,
  }));
  const [showLoading, setShowLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') !== '1';
  });
  const [loadingTip] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LAST_TIP_STORAGE_KEY);
      const parsed = raw !== null ? Number.parseInt(raw, 10) : null;
      const picked = pickRandomLoadingTip(Number.isNaN(parsed) ? null : parsed);
      window.localStorage.setItem(LAST_TIP_STORAGE_KEY, String(picked.index));
      return picked;
    } catch {
      return pickRandomLoadingTip(null);
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    const triggerLockout = (violation: IntegrityViolation, eng?: ZombieForestEngine) => {
      if (disposed) return;
      (eng || engineRef.current)?.haltForSecurityViolation(violation);
      document.body.dataset.state = 'tampered';
      setTamperViolation((prev) => prev || violation);
    };

    const engine = new ZombieForestEngine(
      canvas,
      (snapshot) => {
        setHud(snapshot);
      },
      (violation) => {
        triggerLockout(violation);
      }
    );
    engineRef.current = engine;

    const initialBootViolation = engine.getSecurityViolation();
    if (initialBootViolation) {
      triggerLockout(initialBootViolation, engine);
    } else {
      engine.startLoop();
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        engine.startNewGame(false);
      } else {
        document.body.dataset.state = 'title';
        soundEngine.setMusicMode('menu');
      }
    }

    const runIntegrityAudit = async () => {
      if (disposed) return;
      const violation = await verifyGameIntegrity(import.meta.env.DEV);
      if (violation && !disposed) {
        triggerLockout(violation, engine);
      }
    };
    void runIntegrityAudit();
    const auditIntervalId = window.setInterval(() => {
      void runIntegrityAudit();
    }, 3500);
    const domObserver = new MutationObserver(() => {
      void runIntegrityAudit();
    });
    if (document.body) {
      domObserver.observe(document.body, { childList: true });
    }
    if (document.head) {
      domObserver.observe(document.head, { childList: true });
    }
    const onFocusAudit = () => {
      void runIntegrityAudit();
    };
    window.addEventListener('focus', onFocusAudit);

    const mqCoarse = window.matchMedia('(pointer: coarse)');
    const mqSmall = window.matchMedia('(max-width: 1024px)');
    const mqPortrait = window.matchMedia('(orientation: portrait)');
    const pendingTimers: number[] = [];

    const syncViewport = () => {
      const rootEl = rootRef.current;
      const rect = rootEl?.getBoundingClientRect();
      const nextW =
        rect && rect.width > 0
          ? Math.round(rect.width)
          : Math.round(window.visualViewport?.width || window.innerWidth);
      const nextH =
        rect && rect.height > 0
          ? Math.round(rect.height)
          : Math.round(window.visualViewport?.height || window.innerHeight);

      setViewport((prev) => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));

      if (!userToggledTouchRef.current) {
        const shouldShowTouch =
          mqCoarse.matches ||
          'ontouchstart' in window ||
          navigator.maxTouchPoints > 0 ||
          nextH > nextW ||
          Math.max(nextW, nextH) <= 900;
        setShowTouchControls(shouldShowTouch);
      }
    };

    const onOrientationOrViewportChange = () => {
      syncViewport();
      // Mobile browsers often update innerWidth/clientWidth 1-2 frames after orientationchange fires
      requestAnimationFrame(syncViewport);
      pendingTimers.push(window.setTimeout(syncViewport, 120));
      pendingTimers.push(window.setTimeout(syncViewport, 300));
    };

    syncViewport();

    const rootObserver = rootRef.current ? new ResizeObserver(syncViewport) : null;
    if (rootRef.current && rootObserver) {
      rootObserver.observe(rootRef.current);
    }

    window.addEventListener('resize', onOrientationOrViewportChange);
    window.addEventListener('orientationchange', onOrientationOrViewportChange);
    window.visualViewport?.addEventListener('resize', syncViewport);
    mqSmall.addEventListener('change', onOrientationOrViewportChange);
    mqPortrait.addEventListener('change', onOrientationOrViewportChange);
    const screenOrientation = window.screen?.orientation;
    screenOrientation?.addEventListener?.('change', onOrientationOrViewportChange);

    const unlockAudio = () => {
      soundEngine.unlock(true);
    };
    window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
    window.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignore service worker registration errors in unsupported/sandboxed contexts
      });
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        engine.recordVisitTimestamp();
        engine.scheduleInactivityPushNotification();
      } else {
        engine.cancelInactivityPushNotification();
      }
    };
    const handlePageHide = () => {
      engine.recordVisitTimestamp();
      engine.scheduleInactivityPushNotification();
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(auditIntervalId);
      domObserver.disconnect();
      window.removeEventListener('focus', onFocusAudit);
      pendingTimers.forEach((id) => window.clearTimeout(id));
      rootObserver?.disconnect();
      window.removeEventListener('resize', onOrientationOrViewportChange);
      window.removeEventListener('orientationchange', onOrientationOrViewportChange);
      window.visualViewport?.removeEventListener('resize', syncViewport);
      mqSmall.removeEventListener('change', onOrientationOrViewportChange);
      mqPortrait.removeEventListener('change', onOrientationOrViewportChange);
      screenOrientation?.removeEventListener?.('change', onOrientationOrViewportChange);
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      window.removeEventListener('touchstart', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Natural orientation: let the user rotate their phone/tablet while the app fits the viewport upright
  const isRotated = false;
  void viewport;

  const handlePause = useCallback(() => engineRef.current?.togglePause(), []);
  const handleReload = useCallback(() => engineRef.current?.triggerReload(), []);
  const handleMoveStick = useCallback((x: number, y: number) => engineRef.current?.setMoveStick(x, y), []);
  const handleFireHeld = useCallback((held: boolean) => engineRef.current?.setFireButtonHeld(held), []);
  const handleLoadingFinished = useCallback(() => {
    setShowLoading(false);
    if (!tamperViolation) {
      engineRef.current?.maybeAutoOpenDailyModal();
    }
  }, [tamperViolation]);

  const handleConfirmSecurityExit = useCallback(() => {
    engineRef.current?.destroy();
    engineRef.current = null;
    document.body.dataset.state = 'terminated';
    setSecurityExited(true);
    triggerSecurityExit();
  }, []);

  if (securityExited) {
    return (
      <div
        data-testid="security-exited-screen"
        className="fixed inset-0 bg-black text-[#e4ece3] flex items-center justify-center p-6 text-center select-none"
      >
        <p className="font-mono-num text-xs sm:text-sm text-[#9cb0a1]">
          Сеанс завершён службой безопасности. Удалите сторонние модификации и перезапустите официальную версию игры.
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="fixed inset-0 overflow-hidden bg-[#050807]">
      <main
        ref={stageRef}
        data-testid="landscape-stage"
        data-rotated="false"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
        }}
        className={`overflow-hidden bg-[#090e0c] ${
          hud.screenState === 'playing' ? 'touch-none select-none' : ''
        }`}
      >
        <canvas
          ref={canvasRef}
          data-testid="game-canvas"
          tabIndex={0}
          className={`pixel-canvas block w-full h-full outline-none touch-none ${
            hud.screenState === 'playing' ? 'cursor-crosshair' : 'cursor-default'
          }`}
        />

        {showLoading && !tamperViolation && (
          <LoadingScreen
            tipText={loadingTip.text}
            tipIndex={loadingTip.index}
            onFinished={handleLoadingFinished}
          />
        )}

        {!tamperViolation && !showLoading && hud.screenState === 'title' && (
          <TitleScreen
            hud={hud}
            onStart={() => engineRef.current?.startNewGame(true)}
            onOpenShop={() => engineRef.current?.setShopOpen(true)}
            onOpenDaily={() => engineRef.current?.setDailyModalOpen(true)}
            onCompleteTutorial={() => engineRef.current?.completeTutorial()}
          />
        )}

        {!tamperViolation && !showLoading && hud.screenState === 'title' && hud.dailyModalOpen && (
          <DailyRewardModal
            hud={hud}
            onClose={() => engineRef.current?.setDailyModalOpen(false)}
            onClaim={() => engineRef.current?.claimDailyReward()}
          />
        )}

        {!tamperViolation && !showLoading && hud.screenState === 'title' && hud.shopOpen && (
          <ShopModal
            hud={hud}
            onClose={() => engineRef.current?.setShopOpen(false)}
            onBuyOrEquip={(id) => engineRef.current?.buyOrEquipWeapon(id)}
            onUpgrade={(id, stat) => engineRef.current?.upgradeWeaponStat(id, stat)}
            onBuyOrEquipSkin={(skinId) => engineRef.current?.buyOrEquipSkin(skinId)}
            onUpgradeVitality={() => engineRef.current?.upgradeVitality()}
            onUpgradeArmor={() => engineRef.current?.upgradeArmor()}
            onCompleteTutorial={() => engineRef.current?.completeTutorial()}
          />
        )}

        {!tamperViolation && !showLoading && hud.screenState !== 'title' && (
          <GameHud
            hud={hud}
            showTouchControls={showTouchControls}
            isRotated={isRotated}
            onPause={handlePause}
            onReload={handleReload}
            onMoveStick={handleMoveStick}
            onFireHeld={handleFireHeld}
          />
        )}

        {!tamperViolation &&
          !showLoading &&
          (hud.screenState === 'paused' || hud.screenState === 'gameover' || hud.screenState === 'victory') && (
            <StatusModals
              hud={hud}
              showTouchControls={showTouchControls}
              onToggleTouchControls={() => {
                userToggledTouchRef.current = true;
                setShowTouchControls((prev) => !prev);
              }}
              onToggleMute={() => engineRef.current?.toggleMute()}
              onResume={() => engineRef.current?.resumeGame()}
              onRestart={() => engineRef.current?.startNewGame(true)}
              onReturnTitle={() => engineRef.current?.returnToTitle(false)}
              onOpenShopFromVictory={() => engineRef.current?.returnToTitle(true)}
              onRestartTutorial={() => engineRef.current?.restartTutorial()}
            />
          )}

        {!tamperViolation && !showLoading && hud.activePushSms && (
          <PushSmsBanner
            hud={hud}
            isRotated={isRotated}
            onDismiss={() => engineRef.current?.dismissPushSms()}
            onOpenDaily={() => {
              engineRef.current?.dismissPushSms();
              engineRef.current?.setDailyModalOpen(true);
            }}
          />
        )}

        {!tamperViolation && !showLoading && (
          <TutorialOverlay
            hud={hud}
            stageRef={stageRef}
            isRotated={isRotated}
            onSkipTutorial={() => engineRef.current?.completeTutorial()}
          />
        )}

        {tamperViolation && (
          <TamperLockoutModal
            violation={tamperViolation}
            onConfirmExit={handleConfirmSecurityExit}
          />
        )}
      </main>
    </div>
  );
}
