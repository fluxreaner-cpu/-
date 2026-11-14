import {
  Play,
  ShoppingBag,
  Coins,
  Swords,
  Sparkles,
  Gift,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import {
  BIOMES,
  SKINS,
  WEAPONS,
} from '../game/constants';
import { getEffectivePlayerStats } from '../game/rules';
import type { HudSnapshot } from '../game/types';
import { SkinPreview } from './SkinPreview';

interface TitleScreenProps {
  hud: HudSnapshot;
  onStart: () => void;
  onOpenShop: () => void;
  onOpenDaily: () => void;
  onCompleteTutorial: () => void;
}

export function TitleScreen({
  hud,
  onStart,
  onOpenShop,
  onOpenDaily,
  onCompleteTutorial,
}: TitleScreenProps) {
  const handleInteractionUnlock = () => {
    soundEngine.unlock();
    soundEngine.setMusicMode('menu');
  };

  const effStats = getEffectivePlayerStats(
    hud.activeSkinId,
    hud.vitalityLevel,
    hud.armorLevel,
    hud.playerLevel
  );
  const activeSkin = SKINS[hud.activeSkinId];
  const xpPct = Math.max(0, Math.min(100, (hud.xp / Math.max(1, hud.xpToNext)) * 100));
  const selectedBiome = BIOMES[hud.selectedBiomeId];
  const isFirstStarterPlay = hud.tutorialStep === 'menu_intro' || hud.tutorialStep === 'combat_controls';

  return (
    <div
      className="fixed inset-0 z-20 overflow-y-auto overscroll-contain pointer-events-auto"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* Atmospheric left scrim leaving campfire & animated forest trail visible */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(6,10,8,0.94) 0%, rgba(6,10,8,0.78) 46%, rgba(6,10,8,0.22) 78%, rgba(6,10,8,0.38) 100%)',
        }}
      />

      <div className="relative z-10 min-h-full flex flex-col justify-between p-3 sm:p-6 md:p-8 gap-2 sm:gap-5">
        {/* Top Stats Bar */}
        <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1.5 text-xs sm:text-sm text-[#b7c7bb] font-mono-num">
          <div className="flex items-center gap-2">
            <span data-testid="menu-player-level" className="text-[#4ade80] font-bold">
              Уровень {hud.playerLevel}
            </span>
            <div className="w-20 sm:w-28 h-2 bg-[#0a0f0d] border border-[#2d3e34]" title={`${hud.xp}/${hud.xpToNext} EXP`}>
              <div className="h-full bg-[#4ade80]" style={{ width: `${xpPct}%` }} />
            </div>
            <span className="text-[11px] text-[#8fa194]">
              {hud.xp}/{hud.xpToNext} EXP
            </span>
          </div>

          <span aria-hidden="true" className="text-[#4a5d51]">·</span>
          <span data-testid="menu-trophies">
            Трофеев: <strong className="text-[#fbbf24]">{hud.trophies}</strong>
          </span>
          <span aria-hidden="true" className="text-[#4a5d51]">·</span>
          <span className="inline-flex items-center gap-1 text-[#fbbf24] font-bold">
            <Coins className="w-3.5 h-3.5" />
            <span data-testid="menu-coins">{hud.coins}</span>
          </span>
        </div>

        {/* Main Hero Block */}
        <div className="w-full max-w-[680px] flex flex-col gap-2 sm:gap-4 py-0.5 sm:py-1">
          <div>
            <div className="hidden sm:block mb-2">
              <svg viewBox="0 0 180 44" className="w-36 sm:w-40 h-8 sm:h-9" aria-hidden="true">
                <rect x="2" y="2" width="40" height="40" fill="#111a15" stroke="#d97706" strokeWidth="2" />
                <polygon points="22,8 11,22 33,22" fill="#2d6a4f" />
                <polygon points="22,16 9,31 35,31" fill="#1b4332" />
                <rect x="20" y="31" width="4" height="6" fill="#7c2d12" />
                <rect x="30" y="7" width="6" height="6" fill="#fbbf24" />
                <rect x="32" y="7" width="4" height="4" fill="#111a15" />
                <rect x="52" y="20" width="120" height="3" fill="#3f5247" />
                <rect x="52" y="25" width="80" height="2" fill="#d97706" />
              </svg>
            </div>

            <h1
              className="font-pixel text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#f4f7f2] leading-none mb-1.5 sm:mb-2"
              style={{ textShadow: '0 4px 0 #090d0b, 0 8px 24px rgba(0,0,0,0.85)' }}
            >
              ТЁМНАЯ ЧАЩА
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-[#cbd5cc] leading-snug sm:leading-relaxed max-w-md">
              Ночной лес уже дышит в спину. Заряжай ствол, прорывайся сквозь проклятые земли и дойди до самого Кровавого провала!
            </p>
          </div>

          {/* Interactive Onboarding Guide: Первые шаги */}
          {hud.tutorialStep === 'menu_intro' && (
            <div
              data-testid="tutorial-menu-intro"
              className="pixel-panel px-3 py-2 sm:p-3.5 border-[#4ade80] bg-[#102419]/95 text-xs text-[#dcfce7] space-y-1 sm:space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-pixel text-sm font-bold text-[#4ade80] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Первые шаги новичка</span>
                </span>
              </div>
              <ol className="space-y-1 text-[11px] sm:text-xs leading-snug text-[#d1fae5] list-none m-0 p-0">
                <li>
                  <strong className="text-[#fbbf24]">1. Разминка:</strong> жми <strong>«В первый бой!»</strong> — тебя ждёт короткая 1-я волна из 3 мертвецов.
                </li>
                <li>
                  <strong className="text-[#fbbf24]">2. Бой и лечение:</strong> вблизи оружие само наводится на цель, а каждое убийство лечит <strong>+5 HP</strong>.
                </li>
                <li>
                  <strong className="text-[#fbbf24]">3. Магазин:</strong> после победы улучши стартовый пистолет и выходи в настоящие бои!
                </li>
              </ol>
            </div>
          )}

          {hud.tutorialStep === 'go_to_shop' && (
            <div
              data-testid="tutorial-menu-goshop"
              className="pixel-panel p-3.5 border-[#fbbf24] bg-[#241c0d]/95 text-xs text-[#fef3c7] space-y-1"
            >
              <div className="font-pixel text-sm font-bold text-[#fbbf24]">
                Шаг обучения: пора усилить оружие!
              </div>
              <p className="text-[11px] sm:text-xs leading-snug">
                Открой <strong>«Магазин»</strong> — на первые монеты уже можно прокачать свой пистолет.
              </p>
            </div>
          )}

          {hud.tutorialStep === 'final_tips' && (
            <div
              data-testid="tutorial-menu-final"
              className="pixel-panel p-3.5 border-[#4ade80] bg-[#102419]/95 text-xs text-[#dcfce7] flex items-center justify-between gap-2"
            >
              <div className="text-[11px] sm:text-xs leading-snug">
                <strong className="font-pixel text-[#4ade80]">Путь открыт!</strong> Впереди бои по 7 волн — жми «Играть» и покоряй новые биомы!
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCompleteTutorial();
                }}
                className="pixel-btn font-pixel px-3 py-1 text-xs font-bold bg-[#22c55e] text-[#052e16] cursor-pointer shrink-0"
              >
                OK
              </button>
            </div>
          )}

          {/* Primary Actions: Play + Shop + Daily Rewards */}
          <div className="flex flex-wrap items-stretch gap-2 sm:gap-2.5">
            <button
              type="button"
              data-start="true"
              data-tutorial-target="btn-start"
              onClick={(e) => {
                e.currentTarget.blur();
                handleInteractionUnlock();
                onStart();
              }}
              className="pixel-btn min-h-[48px] flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#d97706] hover:bg-[#ea8c15] border-[#fbbf24] text-[#0b0f0d] font-pixel text-lg sm:text-xl font-bold px-5 sm:px-6 py-2 cursor-pointer whitespace-nowrap"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>{isFirstStarterPlay ? 'В первый бой!' : 'Играть'}</span>
            </button>

            <button
              type="button"
              data-testid="btn-menu-shop"
              data-tutorial-target="btn-menu-shop"
              onClick={(e) => {
                e.currentTarget.blur();
                handleInteractionUnlock();
                onOpenShop();
              }}
              className={`pixel-btn min-h-[48px] flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#16241d] hover:bg-[#1f3329] text-[#f4f7f2] font-pixel text-lg sm:text-xl font-bold px-4 sm:px-5 py-2 cursor-pointer whitespace-nowrap ${
                hud.tutorialStep === 'go_to_shop'
                  ? 'border-[#fbbf24] ring-2 ring-[#fbbf24]/70'
                  : 'border-[#4ade80]'
              }`}
            >
              <ShoppingBag className="w-5 h-5 text-[#fbbf24]" />
              <span>{hud.tutorialStep === 'go_to_shop' ? 'Магазин →' : 'Магазин'}</span>
            </button>

            <button
              type="button"
              data-testid="btn-daily-rewards"
              onClick={(e) => {
                e.currentTarget.blur();
                handleInteractionUnlock();
                onOpenDaily();
              }}
              className={`pixel-btn min-h-[48px] flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-4 py-2 font-pixel text-lg sm:text-xl font-bold cursor-pointer whitespace-nowrap ${
                hud.dailyCanClaim
                  ? 'bg-[#1a2c1e] hover:bg-[#243d29] border-[#fbbf24] text-[#fef3c7]'
                  : 'bg-[#121c16] hover:bg-[#1a2820] border-[#384d40] text-[#cbd5cc]'
              }`}
            >
              <Gift className={`w-5 h-5 ${hud.dailyCanClaim ? 'text-[#fbbf24]' : 'text-[#8fa194]'}`} />
              <span>Награда дня</span>
              {hud.dailyCanClaim && (
                <span
                  data-testid="daily-ready-dot"
                  className="bg-[#22c55e] text-[#052e16] px-1.5 py-0.5 text-[10px] font-mono-num font-bold leading-none"
                >
                  ДЕНЬ {hud.dailyNextDayIndex + 1}
                </span>
              )}
            </button>
          </div>

          <div className="text-[11px] sm:text-xs text-[#9cb0a1] -mt-1">
            Тропа впереди:{' '}
            <strong style={{ color: selectedBiome.accentColor }}>{selectedBiome.name}</strong>{' '}
            {isFirstStarterPlay ? '· 1 разминочная волна' : `· 7 волн`}
          </div>

          {/* Active Loadout Summary Card */}
          <div className="pixel-panel p-3 flex items-center gap-3">
            <div className="w-11 h-12 border border-[#2e3d34] bg-[#090d0b] flex items-center justify-center shrink-0">
              <SkinPreview skinId={hud.activeSkinId} scale={2} />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-[#f4f7f2] truncate">
                {activeSkin.name}
              </div>
              <div className="text-[11px] text-[#cbd5cc] flex items-center gap-1.5 truncate mt-0.5">
                <Swords className="w-3.5 h-3.5 text-[#fbbf24] shrink-0" />
                <span className="truncate">{WEAPONS[hud.activeWeaponId].name}</span>
              </div>
              <div className="text-[10px] font-mono-num text-[#8fa194] mt-0.5">
                HP {effStats.maxHp} · Броня {effStats.startArmor}
                {activeSkin.damageBonusPct > 0 ? ` · +${activeSkin.damageBonusPct}% урон` : ''}
                {activeSkin.speedBonusPct > 0 ? ` · +${activeSkin.speedBonusPct}% бег` : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Clean atmospheric bottom line */}
        <div className="hidden sm:block text-xs text-[#8fa194] truncate">
          Костёр горит недолго — проверь патроны и выходи на тропу.
        </div>
      </div>
    </div>
  );
}
