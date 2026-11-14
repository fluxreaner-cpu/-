import type { HudSnapshot } from './types';

/**
 * Допустимые направления размещения всплывающего окна подсказки
 * относительно подсвеченной области (вырезанного светлого «окна»).
 */
export type TutorialSpotlightPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

/**
 * Направление, в котором анимированная стрелка указывает на целевую кнопку.
 */
export type TutorialArrowSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * Конфигурация одного шага обучения.
 * Архитектура полностью декларативна: чтобы добавить новый шаг обучения,
 * достаточно добавить объект в массив TUTORIAL_SPOTLIGHT_STEPS без правки
 * логики маски, блокировщика кликов и анимаций.
 */
export interface TutorialSpotlightStep {
  /** Уникальный идентификатор состояния в машине состояний обучения */
  id: string;
  /** Короткая метка прогресса шага (отображается в заголовке окна подсказки) */
  stepBadge: string;
  /** Заголовок подсказки */
  title: string;
  /** Текст пояснения для игрока */
  description: string;
  /**
   * Значение атрибута data-tutorial-target="..." на целевом UI-элементе.
   * Система сама найдёт элемент на сцене и вырежет над ним светлое окно.
   */
  targetId: string;
  /** Предпочтительное расположение текстового окна рядом с кнопкой */
  preferredPlacement?: TutorialSpotlightPlacement;
  /** Дополнительный отступ вокруг кнопки в пикселях для светлого окна */
  padding?: number;
  /** Разрешить ли кнопку «Пропустить» внутри окна подсказки */
  allowSkip?: boolean;
  /**
   * Условие активности шага в машине состояний.
   * Возвращает true, когда игра находится на экране и этапе,
   * соответствующем этому шагу.
   */
  isActive: (hud: HudSnapshot) => boolean;
}

/**
 * Локальный прямоугольник внутри игровой сцены (учитывает 90° автоповорот экрана).
 */
export interface StageLocalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * МАССИВ ШАГОВ ОБУЧЕНИЯ (Data-Driven конфиг машины состояний).
 *
 * Как добавить новый шаг:
 * 1) Навесь на нужную кнопку атрибут data-tutorial-target="my-button-id".
 * 2) Добавь новый объект в массив ниже с targetId: 'my-button-id' и условием isActive.
 */
export const TUTORIAL_SPOTLIGHT_STEPS: readonly TutorialSpotlightStep[] = [
  {
    id: 'menu_start_first_battle',
    stepBadge: 'ШАГ 1 / 4',
    title: 'Выход на первую тропу',
    description: 'Нажми на кнопку «В первый бой!», чтобы пройти короткую разминку с 3 зомби.',
    targetId: 'btn-start',
    preferredPlacement: 'right',
    padding: 8,
    allowSkip: true,
    isActive: (hud) =>
      hud.screenState === 'title' && !hud.shopOpen && hud.tutorialStep === 'menu_intro',
  },
  {
    id: 'victory_open_shop',
    stepBadge: 'ШАГ 2 / 4',
    title: 'Победа и первые монеты',
    description: 'Разминка пройдена! Нажми «В Магазин», чтобы усилить своё оружие.',
    targetId: 'btn-victory-shop',
    preferredPlacement: 'top',
    padding: 8,
    allowSkip: true,
    isActive: (hud) => hud.screenState === 'victory' && hud.tutorialStep === 'go_to_shop',
  },
  {
    id: 'menu_open_shop',
    stepBadge: 'ШАГ 2 / 4',
    title: 'Открой Магазин',
    description: 'У тебя уже есть первые монеты — нажми «Магазин →» и прокачай пистолет.',
    targetId: 'btn-menu-shop',
    preferredPlacement: 'right',
    padding: 8,
    allowSkip: true,
    isActive: (hud) =>
      hud.screenState === 'title' && !hud.shopOpen && hud.tutorialStep === 'go_to_shop',
  },
  {
    id: 'shop_upgrade_pistol',
    stepBadge: 'ШАГ 3 / 4',
    title: 'Прокачай урон пистолета',
    description: 'Нажми на кнопку улучшения урона у «Ржавого ПМ», чтобы сносить зомби быстрее.',
    targetId: 'btn-upgrade-rusty_pistol-damage',
    preferredPlacement: 'top',
    padding: 8,
    allowSkip: true,
    isActive: (hud) =>
      hud.screenState === 'title' && hud.shopOpen && hud.tutorialStep === 'upgrade_pistol',
  },
  {
    id: 'shop_finish_tutorial',
    stepBadge: 'ШАГ 4 / 4',
    title: 'Ты готов к настоящей охоте!',
    description: 'Нажми «Понятно, завершить обучение» — дальше тебя ждут волны, биомы и боссы.',
    targetId: 'btn-tutorial-finish',
    preferredPlacement: 'bottom',
    padding: 8,
    allowSkip: false,
    isActive: (hud) =>
      hud.screenState === 'title' && hud.shopOpen && hud.tutorialStep === 'final_tips',
  },
];

/**
 * Определяет текущий активный шаг обучения на основе снимка состояния игры (HudSnapshot).
 * Если обучение завершено ('done') или текущий экран не требует фокуса (например, сам бой),
 * возвращает null — слой затемнения и блокировки полностью отключается.
 */
export function resolveActiveTutorialStep(
  hud: HudSnapshot,
  steps: readonly TutorialSpotlightStep[] = TUTORIAL_SPOTLIGHT_STEPS
): TutorialSpotlightStep | null {
  if (hud.tutorialStep === 'done' || hud.dailyModalOpen) {
    return null;
  }
  for (const step of steps) {
    if (step.isActive(hud)) {
      return step;
    }
  }
  return null;
}

/**
 * Переводит экранные координаты целевого элемента (из getBoundingClientRect)
 * в локальные координаты сцены <main data-testid="landscape-stage">,
 * корректно учитывая автоматический поворот на 90° на портретных экранах.
 */
export function computeLocalStageRect(
  targetRect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  stageRect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  isRotated: boolean
): StageLocalRect {
  if (!isRotated) {
    return {
      x: targetRect.left - stageRect.left,
      y: targetRect.top - stageRect.top,
      width: targetRect.width,
      height: targetRect.height,
    };
  }

  // При повороте контейнера на +90° по часовой стрелке:
  // локальный X растёт вниз по экрану (targetRect.top - stageRect.top),
  // локальный Y растёт влево по экрану (stageRect.right - targetRect.right).
  return {
    x: targetRect.top - stageRect.top,
    y: stageRect.right - targetRect.right,
    width: targetRect.height,
    height: targetRect.width,
  };
}

/**
 * Вычисляет прямоугольник вырезаемого светлого «окна» с учётом отступа (padding)
 * и безопасно ограничивает его границами сцены.
 */
export function computeSpotlightCutout(
  localRect: StageLocalRect,
  stageWidth: number,
  stageHeight: number,
  padding: number = 8
): StageLocalRect {
  const x1 = Math.max(0, Math.floor(localRect.x - padding));
  const y1 = Math.max(0, Math.floor(localRect.y - padding));
  const x2 = Math.min(stageWidth, Math.ceil(localRect.x + localRect.width + padding));
  const y2 = Math.min(stageHeight, Math.ceil(localRect.y + localRect.height + padding));
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

/**
 * Вычисляет оптимальное положение текстовой карточки подсказки и направление стрелки,
 * чтобы окно подсказки никогда не вылезало за пределы экрана и не перекрывало кнопку.
 */
export function computeTooltipPlacement(
  cutout: StageLocalRect,
  stageWidth: number,
  stageHeight: number,
  tooltipWidth: number,
  tooltipHeight: number,
  preferred: TutorialSpotlightPlacement = 'auto'
): { left: number; top: number; arrowSide: TutorialArrowSide } {
  const gap = 16;
  const margin = 10;

  const spaceTop = cutout.y - margin;
  const spaceBottom = stageHeight - (cutout.y + cutout.height) - margin;
  const spaceLeft = cutout.x - margin;
  const spaceRight = stageWidth - (cutout.x + cutout.width) - margin;

  const fits = {
    top: spaceTop >= tooltipHeight + gap,
    bottom: spaceBottom >= tooltipHeight + gap,
    left: spaceLeft >= tooltipWidth + gap,
    right: spaceRight >= tooltipWidth + gap,
  };

  let side: TutorialArrowSide;
  if (preferred !== 'auto' && fits[preferred]) {
    side = preferred;
  } else if (fits.bottom) {
    side = 'bottom';
  } else if (fits.top) {
    side = 'top';
  } else if (fits.right) {
    side = 'right';
  } else if (fits.left) {
    side = 'left';
  } else {
    // Выбираем сторону с максимальным доступным местом
    const candidates: Array<{ dir: TutorialArrowSide; space: number }> = [
      { dir: 'bottom', space: spaceBottom },
      { dir: 'top', space: spaceTop },
      { dir: 'right', space: spaceRight },
      { dir: 'left', space: spaceLeft },
    ];
    candidates.sort((a, b) => b.space - a.space);
    side = candidates[0].dir;
  }

  const centerX = cutout.x + cutout.width / 2;
  const centerY = cutout.y + cutout.height / 2;

  let left = centerX - tooltipWidth / 2;
  let top = centerY - tooltipHeight / 2;

  if (side === 'top') {
    top = cutout.y - tooltipHeight - gap;
  } else if (side === 'bottom') {
    top = cutout.y + cutout.height + gap;
  } else if (side === 'left') {
    left = cutout.x - tooltipWidth - gap;
  } else {
    left = cutout.x + cutout.width + gap;
  }

  const clampedLeft = Math.max(margin, Math.min(stageWidth - tooltipWidth - margin, left));
  const clampedTop = Math.max(margin, Math.min(stageHeight - tooltipHeight - margin, top));

  // Стрелка на карточке указывает в сторону вырезанного окна:
  // если карточка справа -> стрелка на левой грани ('left'), и т.д.
  const arrowSide: TutorialArrowSide =
    side === 'top'
      ? 'bottom'
      : side === 'bottom'
        ? 'top'
        : side === 'left'
          ? 'right'
          : 'left';

  return {
    left: Math.round(clampedLeft),
    top: Math.round(clampedTop),
    arrowSide,
  };
}
