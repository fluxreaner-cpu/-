import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import {
  computeLocalStageRect,
  computeSpotlightCutout,
  computeTooltipPlacement,
  resolveActiveTutorialStep,
  type StageLocalRect,
  type TutorialSpotlightStep,
} from '../game/tutorialSteps';
import type { HudSnapshot } from '../game/types';

interface TutorialOverlayProps {
  /** Текущий снимок состояния игры (включает экран, модалки и этап обучения) */
  hud: HudSnapshot;
  /** Ссылка на корневой контейнер сцены (landscape-stage) для расчёта локальных координат */
  stageRef: RefObject<HTMLElement | null>;
  /** Включён ли автоматический поворот на 90° для портретных экранов */
  isRotated: boolean;
  /** Колбэк полного пропуска/завершения обучения */
  onSkipTutorial: () => void;
}

interface OverlayGeometry {
  stageW: number;
  stageH: number;
  cutout: StageLocalRect;
}

/**
 * КОМПОНЕНТ ИНТЕРАКТИВНОГО ПОШАГОВОГО ОБУЧЕНИЯ (Spotlight Tutorial Overlay).
 *
 * Реализует все 5 ключевых механизмов:
 * 1. Машина состояний: следит за текущим активным шагом через resolveActiveTutorialStep(hud).
 * 2. Затемнение и фокус (SVG Mask): вырезает светлое окно строго по размеру и координатам
 *    целевого UI-элемента [data-tutorial-target="..."].
 * 3. Блокировка кликов (Input Blocker): 4 невидимых щита вокруг светлого окна перехватывают
 *    все клики и касания по остальному интерфейсу, пропуская ввод только внутрь целевой кнопки.
 * 4. Визуальный указатель и пояснение: пульсирующая рамка вокруг элемента, анимированная стрелка
 *    и карточка с коротким текстом, автоматически выбирающая безопасное место на экране.
 * 5. Переход к следующему шагу: клик по целевой кнопке засчитывает шаг, снимает текущую подсветку
 *    и запускает следующий этап; после последнего шага весь слой обучения отключается.
 */
export function TutorialOverlay({
  hud,
  stageRef,
  isRotated,
  onSkipTutorial,
}: TutorialOverlayProps) {
  const maskId = useId();
  const activeStep: TutorialSpotlightStep | null = resolveActiveTutorialStep(hud);

  const [geometry, setGeometry] = useState<OverlayGeometry | null>(null);
  const [blockedFeedbackTick, setBlockedFeedbackTick] = useState(0);
  const [tooltipSize, setTooltipSize] = useState({ w: 280, h: 132 });
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const scrolledStepRef = useRef<string | null>(null);

  /**
   * 1. Измерение координат целевого UI-элемента относительно контейнера сцены.
   * Вызывается при смене шага, ресайзе окна, прокрутке модалок и мутациях DOM.
   */
  const measureTarget = useCallback(() => {
    const stageEl = stageRef.current;
    if (!activeStep || !stageEl) {
      setGeometry(null);
      return;
    }

    const targetEl = stageEl.querySelector<HTMLElement>(
      `[data-tutorial-target="${activeStep.targetId}"]`
    );
    if (!targetEl) {
      setGeometry(null);
      return;
    }

    // Страховка от софтлока: если целевая кнопка отключена (disabled), маску не блокируем
    if ((targetEl as HTMLButtonElement).disabled) {
      setGeometry(null);
      return;
    }

    // При первом появлении шага мягко прокручиваем скролл-контейнер (например, Магазин),
    // чтобы целевая кнопка гарантированно оказалась в видимой зоне.
    if (scrolledStepRef.current !== activeStep.id) {
      scrolledStepRef.current = activeStep.id;
      targetEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    const stageRect = stageEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    if (targetRect.width <= 0 || targetRect.height <= 0) {
      setGeometry(null);
      return;
    }

    const stageW = stageEl.clientWidth || (isRotated ? stageRect.height : stageRect.width);
    const stageH = stageEl.clientHeight || (isRotated ? stageRect.width : stageRect.height);

    const localRect = computeLocalStageRect(targetRect, stageRect, isRotated);
    const cutout = computeSpotlightCutout(
      localRect,
      stageW,
      stageH,
      activeStep.padding ?? 8
    );

    setGeometry((prev) => {
      if (
        prev &&
        prev.stageW === stageW &&
        prev.stageH === stageH &&
        prev.cutout.x === cutout.x &&
        prev.cutout.y === cutout.y &&
        prev.cutout.width === cutout.width &&
        prev.cutout.height === cutout.height
      ) {
        return prev;
      }
      return { stageW, stageH, cutout };
    });
  }, [activeStep, stageRef, isRotated]);

  // Сброс кеша автоскролла при смене шага
  useEffect(() => {
    if (!activeStep) {
      scrolledStepRef.current = null;
      setGeometry(null);
    }
  }, [activeStep]);

  /**
   * 2. Подписки на изменение размеров, прокрутку и появление целевого элемента в DOM.
   */
  useEffect(() => {
    if (!activeStep) return;

    const raf1 = requestAnimationFrame(measureTarget);
    const timer1 = window.setTimeout(measureTarget, 60);
    const timer2 = window.setTimeout(measureTarget, 220);

    const handleScrollOrResize = () => measureTarget();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    const stageEl = stageRef.current;
    const resizeObserver = stageEl ? new ResizeObserver(measureTarget) : null;
    if (stageEl && resizeObserver) {
      resizeObserver.observe(stageEl);
      const targetEl = stageEl.querySelector<HTMLElement>(
        `[data-tutorial-target="${activeStep.targetId}"]`
      );
      if (targetEl) resizeObserver.observe(targetEl);
    }

    let pendingRaf = 0;
    const scheduleMeasure = () => {
      if (pendingRaf) return;
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = 0;
        measureTarget();
      });
    };

    const mutationObserver = stageEl
      ? new MutationObserver((mutations) => {
          const relevant = mutations.some(
            (m) => !overlayRef.current || !overlayRef.current.contains(m.target)
          );
          if (relevant) scheduleMeasure();
        })
      : null;
    if (stageEl && mutationObserver) {
      mutationObserver.observe(stageEl, { childList: true, subtree: true });
    }

    return () => {
      cancelAnimationFrame(raf1);
      if (pendingRaf) cancelAnimationFrame(pendingRaf);
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [activeStep, measureTarget, stageRef]);

  /**
   * 3. Измеряем фактический размер карточки подсказки, чтобы точно вписать её рядом с кнопкой.
   */
  useEffect(() => {
    const el = tooltipRef.current;
    if (!el || !activeStep) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w > 0 && h > 0) {
      setTooltipSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    }
  }, [activeStep, geometry]);

  /**
   * 4. Клавиатурная защита Input Blocker:
   * пока шаг обучения активен, блокируем нажатие Enter/Space/Escape на посторонних кнопках.
   */
  useEffect(() => {
    if (!activeStep || !geometry) return;
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape' && e.code !== 'KeyB') return;
      const targetEl = stageEl.querySelector<HTMLElement>(
        `[data-tutorial-target="${activeStep.targetId}"]`
      );
      const activeEl = document.activeElement;
      if (targetEl && activeEl && (activeEl === targetEl || targetEl.contains(activeEl))) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setBlockedFeedbackTick((v) => v + 1);
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [activeStep, geometry, stageRef]);

  // Если обучение завершено или целевой элемент сейчас не виден — слой полностью отключается
  if (!activeStep || !geometry || geometry.cutout.width <= 0 || geometry.cutout.height <= 0) {
    return null;
  }

  const { stageW, stageH, cutout } = geometry;
  const maxTooltipW = Math.min(290, Math.max(210, stageW - 24));
  const placement = computeTooltipPlacement(
    cutout,
    stageW,
    stageH,
    Math.min(tooltipSize.w, maxTooltipW),
    tooltipSize.h,
    activeStep.preferredPlacement ?? 'auto'
  );

  // Реакция на клик по затемнённой области вне светлого окна:
  // блокируем событие и слегка подсвечиваем целевую кнопку.
  const handleBlockedInteraction = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBlockedFeedbackTick((v) => v + 1);
  };

  return (
    <div
      ref={overlayRef}
      data-testid="tutorial-spotlight-overlay"
      data-tutorial-step-id={activeStep.id}
      className="fixed inset-0 z-40 pointer-events-none select-none"
      aria-live="polite"
    >
      {/* 1. СЛОЙ ЗАТЕМНЕНИЯ И ФОКУСА (SVG Mask со светлым «окном» строго над целью) */}
      <svg
        width={stageW}
        height={stageH}
        viewBox={`0 0 ${stageW} ${stageH}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            {/* Белый цвет показывает затемнение, чёрный вырезает светлое окно */}
            <rect x="0" y="0" width={stageW} height={stageH} fill="white" />
            <rect
              x={cutout.x}
              y={cutout.y}
              width={cutout.width}
              height={cutout.height}
              rx={4}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={stageW}
          height={stageH}
          fill="rgba(4, 7, 6, 0.78)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* 2. СЛОЙ БЛОКИРОВКИ КЛИКОВ (Input Blocker): 4 щита вокруг светлого окна */}
      {/* Верхний щит */}
      <div
        data-testid="tutorial-blocker-top"
        className="absolute pointer-events-auto"
        style={{ left: 0, top: 0, width: stageW, height: cutout.y }}
        onPointerDown={handleBlockedInteraction}
        onClick={handleBlockedInteraction}
      />
      {/* Нижний щит */}
      <div
        data-testid="tutorial-blocker-bottom"
        className="absolute pointer-events-auto"
        style={{
          left: 0,
          top: cutout.y + cutout.height,
          width: stageW,
          height: Math.max(0, stageH - (cutout.y + cutout.height)),
        }}
        onPointerDown={handleBlockedInteraction}
        onClick={handleBlockedInteraction}
      />
      {/* Левый щит */}
      <div
        data-testid="tutorial-blocker-left"
        className="absolute pointer-events-auto"
        style={{ left: 0, top: cutout.y, width: cutout.x, height: cutout.height }}
        onPointerDown={handleBlockedInteraction}
        onClick={handleBlockedInteraction}
      />
      {/* Правый щит */}
      <div
        data-testid="tutorial-blocker-right"
        className="absolute pointer-events-auto"
        style={{
          left: cutout.x + cutout.width,
          top: cutout.y,
          width: Math.max(0, stageW - (cutout.x + cutout.width)),
          height: cutout.height,
        }}
        onPointerDown={handleBlockedInteraction}
        onClick={handleBlockedInteraction}
      />

      {/* 3. ВИЗУАЛЬНЫЙ УКАЗАТЕЛЬ: пульсирующая рамка строго по контуру вырезанного окна */}
      <div
        key={`${activeStep.id}-${blockedFeedbackTick}`}
        data-testid="tutorial-cutout-ring"
        className="absolute pointer-events-none border-2 border-[#fbbf24] rounded-sm"
        style={{
          left: cutout.x,
          top: cutout.y,
          width: cutout.width,
          height: cutout.height,
          boxShadow:
            blockedFeedbackTick > 0
              ? '0 0 0 4px rgba(251, 191, 36, 0.55), 0 0 18px rgba(251, 191, 36, 0.85)'
              : '0 0 0 2px rgba(251, 191, 36, 0.35), 0 0 14px rgba(251, 191, 36, 0.55)',
        }}
      >
        {/* Пульсирующий круг-маркер на углу целевой кнопки */}
        <span
          aria-hidden="true"
          className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-[#fbbf24] animate-ping opacity-80"
        />
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-[#fbbf24] border border-[#090d0b]"
        />
      </div>

      {/* 4. ТЕКСТОВОЕ ОКНО С ПОЯСНЕНИЕМ И АНИМИРОВАННОЙ СТРЕЛКОЙ-УКАЗАТЕЛЕМ */}
      <div
        ref={tooltipRef}
        data-testid="tutorial-tooltip-card"
        className="absolute pointer-events-auto pixel-panel p-3 sm:p-3.5 border-[#fbbf24] bg-[#0e1914]/98 text-[#eef2ea] shadow-2xl"
        style={{
          left: placement.left,
          top: placement.top,
          width: maxTooltipW,
        }}
      >
        {/* Анимированная стрелка, указывающая на целевую кнопку */}
        <div
          aria-hidden="true"
          className={`absolute flex items-center justify-center w-7 h-7 bg-[#fbbf24] text-[#090d0b] border-2 border-[#090d0b] shadow-md animate-bounce ${
            placement.arrowSide === 'top'
              ? '-top-4 left-1/2 -translate-x-1/2'
              : placement.arrowSide === 'bottom'
                ? '-bottom-4 left-1/2 -translate-x-1/2'
                : placement.arrowSide === 'left'
                  ? '-left-4 top-1/2 -translate-y-1/2'
                  : '-right-4 top-1/2 -translate-y-1/2'
          }`}
        >
          {placement.arrowSide === 'top' && <ArrowUp className="w-4 h-4 stroke-[2.75]" />}
          {placement.arrowSide === 'bottom' && <ArrowDown className="w-4 h-4 stroke-[2.75]" />}
          {placement.arrowSide === 'left' && <ArrowLeft className="w-4 h-4 stroke-[2.75]" />}
          {placement.arrowSide === 'right' && <ArrowRight className="w-4 h-4 stroke-[2.75]" />}
        </div>

        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-pixel text-[11px] font-bold text-[#fbbf24] tracking-wider">
            {activeStep.stepBadge}
          </span>
          {activeStep.allowSkip && (
            <button
              type="button"
              data-testid="btn-skip-tutorial"
              onClick={(e) => {
                e.currentTarget.blur();
                onSkipTutorial();
              }}
              className="text-[11px] text-[#86efac] underline hover:text-white cursor-pointer"
            >
              Пропустить
            </button>
          )}
        </div>

        <div className="font-pixel text-sm sm:text-base font-bold text-[#f4f7f2] leading-snug mb-1">
          {activeStep.title}
        </div>
        <p className="text-xs text-[#d1fae5] leading-snug m-0">
          {activeStep.description}
        </p>
      </div>
    </div>
  );
}
