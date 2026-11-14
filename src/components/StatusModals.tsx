import {
  Play,
  RotateCcw,
  Home,
  ShoppingBag,
  Volume2,
  VolumeX,
  Gamepad2,
  Trophy,
  Sparkles,
  MapPin,
} from 'lucide-react';
import type { HudSnapshot } from '../game/types';

interface StatusModalsProps {
  hud: HudSnapshot;
  showTouchControls: boolean;
  onToggleTouchControls: () => void;
  onToggleMute: () => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onOpenShopFromVictory: () => void;
  onRestartTutorial: () => void;
}

export function StatusModals({
  hud,
  showTouchControls,
  onToggleTouchControls,
  onToggleMute,
  onResume,
  onRestart,
  onReturnTitle,
  onOpenShopFromVictory,
  onRestartTutorial,
}: StatusModalsProps) {
  const xpPct = Math.max(0, Math.min(100, (hud.xp / Math.max(1, hud.xpToNext)) * 100));

  if (hud.screenState === 'paused') {
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-black/75 pointer-events-auto overflow-y-auto overscroll-contain"
        role="dialog"
        aria-modal="true"
        aria-label="Игра на паузе"
      >
        <div className="pixel-panel w-full max-w-sm max-h-[92%] overflow-y-auto p-5 sm:p-6 text-center text-[#eef2ea]">
          <h2 className="font-pixel text-3xl font-bold text-[#fbbf24] mb-1">ПАУЗА</h2>
          <p className="text-xs sm:text-sm text-[#9cb0a1] mb-4">
            {hud.isTutorialMatch ? 'Обучение · Волна 1/1' : `Волна ${hud.waveNumber}/${hud.totalWaves}`} · {hud.biomeName}
          </p>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              data-testid="btn-pause-mute"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="pixel-btn min-h-[40px] flex items-center justify-center gap-1.5 bg-[#101714] hover:bg-[#1a2520] text-xs font-medium px-2.5 py-2 cursor-pointer"
            >
              {hud.muted ? (
                <VolumeX className="w-4 h-4 text-[#f87171]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#fbbf24]" />
              )}
              <span>{hud.muted ? 'Звук выкл' : 'Звук вкл'}</span>
            </button>

            <button
              type="button"
              data-testid="btn-pause-touch"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleTouchControls();
              }}
              className={`pixel-btn min-h-[40px] flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-2 cursor-pointer ${
                showTouchControls
                  ? 'bg-[#1c3327] border-[#4ade80] text-[#dcfce7]'
                  : 'bg-[#101714] hover:bg-[#1a2520] text-[#cbd5cc]'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
              <span>{showTouchControls ? 'Стики вкл' : 'Стики выкл'}</span>
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              data-testid="btn-resume"
              onClick={(e) => {
                e.currentTarget.blur();
                onResume();
              }}
              className="pixel-btn font-pixel min-h-[46px] flex items-center justify-center gap-2 bg-[#d97706] hover:bg-[#ea8c15] border-[#fbbf24] text-[#090d0b] font-bold py-3 text-base cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Продолжить</span>
            </button>

            <button
              type="button"
              data-testid="btn-pause-restart"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="pixel-btn min-h-[42px] flex items-center justify-center gap-2 bg-[#16211c] hover:bg-[#213029] text-[#e4ece3] font-medium py-2.5 text-sm cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Начать заново</span>
            </button>

            <button
              type="button"
              data-testid="btn-pause-menu"
              onClick={(e) => {
                e.currentTarget.blur();
                onReturnTitle();
              }}
              className="pixel-btn min-h-[42px] flex items-center justify-center gap-2 bg-[#111814] hover:bg-[#1a241f] text-[#cbd5cc] font-medium py-2.5 text-sm cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>В главное меню</span>
            </button>

            <button
              type="button"
              data-testid="btn-pause-restart-tutorial"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestartTutorial();
              }}
              className="pixel-btn min-h-[38px] flex items-center justify-center gap-2 bg-[#0d1914] hover:bg-[#162920] border-[#2e523e] text-[#86efac] font-medium py-2 text-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Пройти обучение заново</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hud.screenState === 'victory') {
    const goToShopTutorial = hud.tutorialStep === 'go_to_shop';

    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-black/82 pointer-events-auto overflow-y-auto overscroll-contain"
        role="dialog"
        aria-modal="true"
        aria-label="Победа в раунде"
      >
        <div
          data-testid="victory-modal"
          className="pixel-panel w-full max-w-md max-h-[92%] overflow-y-auto p-5 sm:p-6 text-center text-[#eef2ea] border-[#4ade80]"
        >
          <div className="inline-flex items-center justify-center w-11 h-11 border border-[#fbbf24] bg-[#261f12] mb-2">
            <Trophy className="w-6 h-6 text-[#fbbf24]" />
          </div>

          <h2 className="font-pixel text-3xl sm:text-4xl font-bold text-[#4ade80] mb-1">
            {hud.isTutorialMatch ? 'ПЕРВЫЙ БОЙ ПРОЙДЕН!' : 'РАУНД ПРОЙДЕН!'}
          </h2>
          <p className="text-xs sm:text-sm text-[#9cb0a1] mb-4">
            {hud.biomeName} · Пройдено волн: {hud.totalWaves}/{hud.totalWaves}
          </p>

          <div className="grid grid-cols-3 gap-2 mb-3.5">
            <div className="border border-[#2e3d34] bg-[#0d1310] p-2.5">
              <div className="text-[11px] text-[#9cb0a1]">Убито</div>
              <div className="font-mono-num text-lg font-bold text-[#f4f7f2]">{hud.kills}</div>
            </div>
            <div className="border border-[#2e3d34] bg-[#0d1310] p-2.5">
              <div className="text-[11px] text-[#9cb0a1]">Опыт</div>
              <div className="font-mono-num text-lg font-bold text-[#4ade80]">
                +{hud.roundXpEarned}
              </div>
            </div>
            <div className="border border-[#2e3d34] bg-[#0d1310] p-2.5">
              <div className="text-[11px] text-[#9cb0a1]">Монеты</div>
              <div className="font-mono-num text-lg font-bold text-[#fbbf24]">
                +{hud.totalCoinsEarned}
              </div>
            </div>
          </div>

          {/* EXP Level Progress Bar */}
          <div className="border border-[#2e3d34] bg-[#0b110e] p-3 mb-3.5 text-left">
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-[#f4f7f2]">Уровень бойца: {hud.playerLevel}</span>
              <span className="font-mono-num text-[#86efac]">
                {hud.xp} / {hud.xpToNext} EXP
              </span>
            </div>
            <div className="w-full h-2.5 bg-[#060908] border border-[#24322b]">
              <div className="h-full bg-[#4ade80]" style={{ width: `${xpPct}%` }} />
            </div>

            {hud.didLevelUpInRound && (
              <div className="mt-2 text-[11px] font-bold text-[#fbbf24] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Уровень повышен! +5 макс. HP и +3% к урону за каждый уровень.</span>
              </div>
            )}

            {hud.newlyUnlockedBiomeName && (
              <div className="mt-1.5 text-[11px] font-bold text-[#38bdf8] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>Открыт новый биом: {hud.newlyUnlockedBiomeName}!</span>
              </div>
            )}

            {hud.roundTrophiesEarned > 0 && (
              <div className="mt-1.5 text-[11px] font-bold text-[#fbbf24] flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Трофеи за победу над боссом: +{hud.roundTrophiesEarned} (всего: {hud.trophies})
                </span>
              </div>
            )}
          </div>

          {goToShopTutorial && (
            <div
              data-testid="tutorial-victory-tip"
              className="border border-[#fbbf24] bg-[#241c0d] p-3 mb-4 text-xs text-[#fef3c7] text-left leading-snug"
            >
              <strong>Обучение:</strong> отличная стрельба! Нажми кнопку ниже, чтобы перейти в{' '}
              <strong>Магазин</strong> и прокачать свой первый пистолет «Ржавый ПМ».
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            {goToShopTutorial ? (
              <button
                type="button"
                data-testid="btn-victory-shop"
                data-tutorial-target="btn-victory-shop"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenShopFromVictory();
                }}
                className="pixel-btn min-h-[46px] flex-1 flex items-center justify-center gap-2 bg-[#d97706] hover:bg-[#ea8c15] border-[#fbbf24] text-[#090d0b] font-bold py-3 text-base cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>В Магазин (прокачать пистолет)</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  data-start="true"
                  data-testid="btn-victory-next"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRestart();
                  }}
                  className="pixel-btn font-pixel min-h-[46px] flex-1 flex items-center justify-center gap-2 bg-[#d97706] hover:bg-[#ea8c15] border-[#fbbf24] text-[#090d0b] font-bold py-3 text-base cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Новый раунд</span>
                </button>
                <button
                  type="button"
                  data-testid="btn-victory-menu"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onReturnTitle();
                  }}
                  className="pixel-btn min-h-[46px] flex items-center justify-center gap-2 bg-[#16211c] hover:bg-[#213029] text-[#e4ece3] font-medium px-4 py-3 text-sm cursor-pointer"
                >
                  <Home className="w-4 h-4 text-[#fbbf24]" />
                  <span>В главное меню</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (hud.screenState === 'gameover') {
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-black/82 pointer-events-auto overflow-y-auto overscroll-contain"
        role="dialog"
        aria-modal="true"
        aria-label="Поражение"
      >
        <div className="pixel-panel w-full max-w-md max-h-[92%] overflow-y-auto p-5 sm:p-6 text-center text-[#eef2ea] border-[#dc2626]">
          <h2 className="font-pixel text-3xl sm:text-4xl font-bold text-[#ef4444] mb-1">
            ВЫ ПОГИБЛИ
          </h2>
          <p className="text-xs sm:text-sm text-[#9cb0a1] mb-4">
            Волна {hud.waveNumber}/{hud.totalWaves} · {hud.biomeName} (Уровень бойца: {hud.playerLevel})
          </p>

          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 mb-4">
            <div className="border border-[#2e3d34] bg-[#0d1310] p-2.5 sm:p-3">
              <div className="text-[11px] text-[#9cb0a1]">Волна</div>
              <div className="font-mono-num text-lg sm:text-xl font-bold text-[#fbbf24]">
                {hud.waveNumber}/{hud.totalWaves}
              </div>
            </div>
            <div className="border border-[#2e3d34] bg-[#0d1310] p-2.5 sm:p-3">
              <div className="text-[11px] text-[#9cb0a1]">Опыт</div>
              <div className="font-mono-num text-lg sm:text-xl font-bold text-[#4ade80]">
                +{hud.roundXpEarned}
              </div>
            </div>
            <div className="border border-[#2e3d34] bg-[#0d1310] p-2.5 sm:p-3">
              <div className="text-[11px] text-[#9cb0a1]">Монеты</div>
              <div className="font-mono-num text-lg sm:text-xl font-bold text-[#fbbf24]">
                +{hud.totalCoinsEarned}
              </div>
            </div>
          </div>

          <p className="text-xs text-[#9cb0a1] mb-4">
            Добыча и опыт остались с тобой — самое время взять реванш или усилить оружие.
          </p>

          {hud.roundTrophiesEarned > 0 && (
            <div className="text-xs text-[#fbbf24] font-bold flex items-center justify-center gap-1.5 mb-3">
              <Trophy className="w-4 h-4 shrink-0" />
              <span>Трофеи за босса: +{hud.roundTrophiesEarned} (всего: {hud.trophies})</span>
            </div>
          )}

          {hud.isBossWave && hud.bossMaxHp > 0 && (
            <div className="text-xs text-[#fca5a5] font-mono-num mb-4">
              У Босса оставалось {hud.bossHp} / {hud.bossMaxHp} HP
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="pixel-btn font-pixel min-h-[46px] flex-1 flex items-center justify-center gap-2 bg-[#d97706] hover:bg-[#ea8c15] border-[#fbbf24] text-[#090d0b] font-bold py-3 text-base cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Играть снова</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onReturnTitle();
              }}
              className="pixel-btn min-h-[46px] flex items-center justify-center gap-2 bg-[#16211c] hover:bg-[#213029] text-[#e4ece3] font-medium px-5 py-3 text-sm cursor-pointer"
            >
              <Home className="w-4 h-4 text-[#fbbf24]" />
              <span>В главное меню</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
