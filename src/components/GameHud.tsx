import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, RotateCw, Shield, Skull } from 'lucide-react';
import { WEAPONS } from '../game/constants';
import { transformRotatedPointerDelta } from '../game/rules';
import type { HudSnapshot } from '../game/types';

function safeSetPointerCapture(el: Element, pointerId: number): void {
  try {
    if (!el.hasPointerCapture(pointerId)) {
      el.setPointerCapture(pointerId);
    }
  } catch {
    // Ignore invalid/synthetic pointerId capture errors
  }
}

function safeReleasePointerCapture(el: Element, pointerId: number): void {
  try {
    if (el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore invalid/synthetic pointerId release errors
  }
}

interface GameHudProps {
  hud: HudSnapshot;
  showTouchControls: boolean;
  isRotated: boolean;
  onPause: () => void;
  onReload: () => void;
  onMoveStick: (x: number, y: number) => void;
  onFireHeld: (held: boolean) => void;
}

export function GameHud({
  hud,
  showTouchControls,
  isRotated,
  onPause,
  onReload,
  onMoveStick,
  onFireHeld,
}: GameHudProps) {
  const moveZoneRef = useRef<HTMLDivElement>(null);
  const [moveKnob, setMoveKnob] = useState({ x: 0, y: 0 });
  const movePointerId = useRef<number | null>(null);
  const firePointerId = useRef<number | null>(null);
  const [fireActive, setFireActive] = useState(false);

  const onMoveStickRef = useRef(onMoveStick);
  const onFireHeldRef = useRef(onFireHeld);
  onMoveStickRef.current = onMoveStick;
  onFireHeldRef.current = onFireHeld;

  const resetTouchInputs = useCallback(() => {
    movePointerId.current = null;
    firePointerId.current = null;
    setMoveKnob({ x: 0, y: 0 });
    setFireActive(false);
    onMoveStickRef.current(0, 0);
    onFireHeldRef.current(false);
  }, []);

  useEffect(() => {
    if (hud.screenState !== 'playing' || !showTouchControls) {
      resetTouchInputs();
    }
  }, [hud.screenState, showTouchControls, resetTouchInputs]);

  useEffect(() => {
    const handleBlur = () => resetTouchInputs();
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleBlur);
      resetTouchInputs();
    };
  }, [resetTouchInputs]);

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const bossPct =
    hud.bossMaxHp > 0 ? Math.max(0, Math.min(100, (hud.bossHp / hud.bossMaxHp) * 100)) : 0;

  const updateStick = (
    clientX: number,
    clientY: number,
    el: HTMLDivElement | null,
    maxRadius: number
  ) => {
    if (!el) return { nx: 0, ny: 0, kx: 0, ky: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const { x: dx, y: dy } = transformRotatedPointerDelta(clientX - cx, clientY - cy, isRotated);
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 0.001 ? Math.cos(angle) * clamped : 0;
    const ky = dist > 0.001 ? Math.sin(angle) * clamped : 0;
    return {
      nx: kx / maxRadius,
      ny: ky / maxRadius,
      kx,
      ky,
    };
  };

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-3.5 md:p-4"
      style={{
        paddingBottom: 'max(0.65rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.65rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.65rem, env(safe-area-inset-right))',
      }}
    >
      {/* TOP PERIMETER BAR — Minimalist & Uncluttered during combat */}
      <div className="flex items-start justify-between gap-2">
        {/* Top-Left: Compact HP + Coins */}
        <div className="pixel-panel px-2.5 py-1.5 sm:px-3 sm:py-2 flex flex-col gap-1 min-w-[106px] sm:min-w-[164px] pointer-events-none select-none">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true">
                <path
                  d="M3 2h4v2h2V2h4v2h2v4h-2v2h-2v2H9v2H7v-2H5v-2H3V8H1V4h2V2z"
                  fill="#dc2626"
                  stroke="#090d0b"
                  strokeWidth="1"
                />
              </svg>
              <span className="font-mono-num text-xs sm:text-sm font-bold text-[#f4f7f2]">
                {hud.hp}/{hud.maxHp}
              </span>
            </div>
            {hud.armor > 0 && (
              <span className="font-mono-num text-[10px] sm:text-xs font-semibold text-[#60a5fa] inline-flex items-center gap-0.5">
                <Shield className="w-3 h-3 shrink-0" />
                <span>{hud.armor}</span>
              </span>
            )}
          </div>

          <div className="w-full h-1.5 sm:h-2 bg-[#090d0b] border border-[#2a3830]">
            <div
              className={`h-full ${hpPct <= 30 ? 'bg-[#ef4444]' : 'bg-[#22c55e]'}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono-num gap-2">
            <div className="flex items-center gap-1 text-[#fbbf24] font-bold">
              <svg viewBox="0 0 12 12" className="w-3 h-3 shrink-0" aria-hidden="true">
                <rect x="2" y="1" width="8" height="10" fill="#d97706" />
                <rect x="3" y="2" width="6" height="8" fill="#fbbf24" />
                <rect x="5" y="4" width="2" height="4" fill="#fef08a" />
              </svg>
              <span data-testid="hud-coins">{hud.coins}</span>
            </div>
            <span className="text-[#9cb0a1] inline-flex items-center gap-1">
              <Skull className="w-3 h-3 shrink-0 text-[#cbd5cc]" />
              <span>{hud.kills}</span>
            </span>
          </div>
        </div>

        {/* Top-Center: Compact Wave, Biome & Remaining Zombies + Boss Bar */}
        <div className="flex-1 flex flex-col items-center gap-1.5 max-w-sm mx-auto min-w-0">
          <div className="pixel-panel px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-center max-w-full">
            <div className="flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] sm:text-xs font-bold text-[#f4f7f2]">
              <span className="font-pixel text-[#fbbf24]" data-testid="hud-level">
                {hud.isTutorialMatch ? 'Обучение · Волна 1/1' : `Волна ${hud.waveNumber}/${hud.totalWaves}`}
              </span>
              <span aria-hidden="true" className="text-[#5c7063]">·</span>
              <span className="truncate">{hud.biomeName}</span>
              <span aria-hidden="true" className="text-[#5c7063]">·</span>
              <span className="font-mono-num text-[#cbd5cc]">Врагов: {hud.waveRemaining}</span>
            </div>
          </div>

          {hud.isTutorialMatch && hud.tutorialStep === 'combat_controls' && (
            <div
              data-testid="tutorial-combat-hint"
              className="pixel-panel px-3 py-1.5 border-[#4ade80] bg-[#0f1f16]/95 text-center max-w-xs sm:max-w-md"
            >
              {hud.tutorialCombatStage === 'move' ? (
                <>
                  <div className="font-pixel text-[11px] sm:text-xs font-bold text-[#86efac]">
                    Шаг 1/3 · Движение
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-[#d1fae5]">
                    {showTouchControls
                      ? 'Потяни левый стик ХОДЬБА, чтобы пройти по тропе'
                      : 'Нажми WASD или Стрелки, чтобы пройти по тропе'}
                  </div>
                </>
              ) : hud.tutorialCombatStage === 'shoot' ? (
                <>
                  <div className="font-pixel text-[11px] sm:text-xs font-bold text-[#fbbf24]">
                    Шаг 2/3 · Стрельба и автоприцел
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-[#fef3c7]">
                    {showTouchControls
                      ? 'Жми красную кнопку ОГОНЬ — вблизи прицел сам наводится!'
                      : 'Жми ЛКМ или Пробел — вблизи прицел сам наводится на зомби!'}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-pixel text-[11px] sm:text-xs font-bold text-[#4ade80]">
                    Шаг 3/3 · Перезарядка и зачистка
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-[#d1fae5]">
                    Добей первых мертвецов (перезарядка: [R] или кнопка) — каждый килл лечит +5 HP!
                  </div>
                </>
              )}
            </div>
          )}

          {hud.isBossWave && hud.bossMaxHp > 0 && (
            <div className="pixel-panel w-full max-w-xs sm:max-w-sm px-3 py-1.5 border-[#dc2626]">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#fca5a5] mb-1">
                <span className="font-pixel">БОСС: {hud.bossName}</span>
                <span className="font-mono-num">
                  {hud.bossHp}/{hud.bossMaxHp}
                </span>
              </div>
              <div className="w-full h-2.5 bg-[#090d0b] border border-[#7f1d1d]">
                <div
                  className="h-full bg-[#dc2626]"
                  style={{ width: `${bossPct}%` }}
                />
              </div>
            </div>
          )}

          {hud.bannerText && (
            <div className="pointer-events-none text-center px-3.5 py-1 pixel-panel border-[#d97706]">
              <div className="font-pixel font-bold tracking-wide text-xs sm:text-sm text-[#fbbf24]">
                {hud.bannerText}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#e4ece3]">{hud.bannerSubtext}</div>
            </div>
          )}
        </div>

        {/* Top-Right: Single Clean Pause Button */}
        <div className="pointer-events-auto shrink-0">
          <button
            type="button"
            data-testid="btn-pause"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="pixel-btn min-w-[42px] min-h-[40px] flex items-center justify-center gap-1.5 bg-[#16211c]/95 hover:bg-[#23332b] border-[#fbbf24] text-[#fef3c7] font-semibold px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm cursor-pointer whitespace-nowrap"
            aria-label="Пауза [P / Esc]"
          >
            <Pause className="w-4 h-4 text-[#fbbf24]" />
            <span className="hidden sm:inline">Пауза</span>
          </button>
        </div>
      </div>

      {/* BOTTOM BAR: Active Weapon Ammo & Reload + Optional Virtual Joysticks */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        {/* Compact Active Weapon Ammo & Reload Pill (no weapon switching menu) */}
        <div className="pointer-events-auto mx-auto max-w-full lg:order-2 flex flex-col items-center">
          <div className="pixel-panel px-2.5 py-1 sm:px-3 sm:py-1.5 flex items-center gap-2 sm:gap-2.5 max-w-full">
            <span
              data-testid="hud-active-weapon"
              className="text-xs font-semibold text-[#fef3c7] truncate max-w-[160px] sm:max-w-[220px]"
            >
              {WEAPONS[hud.activeWeaponId].name}
            </span>

            <div className="h-4 w-px bg-[#2e3d34] shrink-0" aria-hidden="true" />

            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className="font-mono-num text-xs sm:text-sm font-bold text-[#f4f7f2] min-w-[46px] text-right"
                title={`Патроны в обойме: ${hud.ammoInMag} / ${hud.magSize}`}
              >
                {hud.isReloading ? (
                  <span className="text-[#fbbf24] text-[10px]">ПЕРЕЗ.</span>
                ) : (
                  <span data-testid="hud-ammo">
                    <span className={hud.ammoInMag === 0 ? 'text-[#ef4444]' : 'text-[#f4f7f2]'}>
                      {hud.ammoInMag}
                    </span>
                    <span className="text-[#5c7063]">/{hud.magSize}</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                data-testid="btn-reload"
                disabled={hud.isReloading || hud.ammoInMag >= hud.magSize}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onReload();
                }}
                className="pixel-btn min-w-[32px] min-h-[32px] flex items-center justify-center p-1 bg-[#141d18] hover:bg-[#1e2b24] disabled:opacity-40 disabled:cursor-not-allowed text-[#c7d3c8] cursor-pointer"
                aria-label="Перезарядить оружие [R]"
                title="Перезарядка [R]"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Left & Right Virtual Joysticks + Fire Button */}
        {showTouchControls ? (
          <div
            data-testid="touch-controls-bar"
            className="flex items-end justify-between w-full lg:contents"
          >
            {/* Left Virtual Movement Joystick */}
            <div
              ref={moveZoneRef}
              data-testid="move-joystick"
              style={{ touchAction: 'none' }}
              className="pointer-events-auto lg:order-1 relative w-22 h-22 sm:w-26 sm:h-26 rounded-full border-2 border-[#4b6355] bg-[#0d1411]/80 touch-none select-none flex items-center justify-center shrink-0"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (movePointerId.current !== null && movePointerId.current !== e.pointerId) return;
                safeSetPointerCapture(e.currentTarget, e.pointerId);
                movePointerId.current = e.pointerId;
                const { nx, ny, kx, ky } = updateStick(e.clientX, e.clientY, moveZoneRef.current, 30);
                setMoveKnob({ x: kx, y: ky });
                onMoveStickRef.current(nx, ny);
              }}
              onPointerMove={(e) => {
                if (movePointerId.current !== e.pointerId) return;
                e.stopPropagation();
                const { nx, ny, kx, ky } = updateStick(e.clientX, e.clientY, moveZoneRef.current, 30);
                setMoveKnob({ x: kx, y: ky });
                onMoveStickRef.current(nx, ny);
              }}
              onPointerUp={(e) => {
                if (movePointerId.current !== e.pointerId) return;
                e.stopPropagation();
                safeReleasePointerCapture(e.currentTarget, e.pointerId);
                movePointerId.current = null;
                setMoveKnob({ x: 0, y: 0 });
                onMoveStickRef.current(0, 0);
              }}
              onPointerCancel={(e) => {
                if (movePointerId.current !== e.pointerId) return;
                e.stopPropagation();
                movePointerId.current = null;
                setMoveKnob({ x: 0, y: 0 });
                onMoveStickRef.current(0, 0);
              }}
              onLostPointerCapture={(e) => {
                if (movePointerId.current !== e.pointerId) return;
                movePointerId.current = null;
                setMoveKnob({ x: 0, y: 0 });
                onMoveStickRef.current(0, 0);
              }}
            >
              <span className="text-[9px] sm:text-[10px] font-bold text-[#7e9485] pointer-events-none absolute top-1.5">
                ХОДЬБА
              </span>
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#d97706] border-2 border-[#fef08a] pointer-events-none"
                style={{ transform: `translate(${moveKnob.x}px, ${moveKnob.y}px)` }}
              />
            </div>

            {/* Right Tactile Fire Button Only (Close-range auto-aim handles targeting) */}
            <div className="pointer-events-auto lg:order-3 flex items-center shrink-0 pr-0.5">
              <button
                type="button"
                data-testid="btn-fire"
                style={{ touchAction: 'none' }}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (firePointerId.current !== null && firePointerId.current !== e.pointerId) return;
                  safeSetPointerCapture(e.currentTarget, e.pointerId);
                  firePointerId.current = e.pointerId;
                  setFireActive(true);
                  onFireHeldRef.current(true);
                }}
                onPointerUp={(e) => {
                  if (firePointerId.current !== e.pointerId) return;
                  e.stopPropagation();
                  safeReleasePointerCapture(e.currentTarget, e.pointerId);
                  firePointerId.current = null;
                  setFireActive(false);
                  onFireHeldRef.current(false);
                }}
                onPointerCancel={(e) => {
                  if (firePointerId.current !== e.pointerId) return;
                  e.stopPropagation();
                  firePointerId.current = null;
                  setFireActive(false);
                  onFireHeldRef.current(false);
                }}
                onLostPointerCapture={(e) => {
                  if (firePointerId.current !== e.pointerId) return;
                  firePointerId.current = null;
                  setFireActive(false);
                  onFireHeldRef.current(false);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.currentTarget.blur();
                }}
                className={`font-pixel w-18 h-18 sm:w-22 sm:h-22 rounded-full border-2 border-[#fca5a5] text-[#fff] font-bold text-sm sm:text-base shadow-lg touch-none select-none cursor-pointer transition-transform ${
                  fireActive ? 'bg-[#b91c1c] scale-95' : 'bg-[#dc2626]'
                }`}
              >
                ОГОНЬ
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden lg:block lg:order-1 w-8" />
            <div className="hidden lg:block lg:order-3 w-8" />
          </>
        )}
      </div>
    </div>
  );
}
