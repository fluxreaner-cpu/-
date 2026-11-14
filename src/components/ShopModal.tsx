import { useEffect, useState } from 'react';
import { X, Shield, Heart, ArrowUpCircle, Check, Swords, User, Sparkles } from 'lucide-react';
import {
  MAX_ARMOR_LEVEL,
  MAX_UPGRADE_LEVEL,
  MAX_VITALITY_LEVEL,
  SKINS,
  SKIN_ORDER,
  WEAPONS,
  WEAPON_ORDER,
} from '../game/constants';
import {
  canPurchaseSkin,
  canPurchaseWeapon,
  canUpgradeArmor,
  canUpgradeVitality,
  canUpgradeWeapon,
  getArmorUpgradeCost,
  getEffectivePlayerStats,
  getUpgradeCost,
  getVitalityUpgradeCost,
  getWeaponEffectiveStats,
} from '../game/rules';
import type { HudSnapshot, SkinId, UpgradeStatKey, WeaponId } from '../game/types';
import { SkinPreview } from './SkinPreview';

interface ShopModalProps {
  hud: HudSnapshot;
  onClose: () => void;
  onBuyOrEquip: (id: WeaponId) => void;
  onUpgrade: (id: WeaponId, stat: UpgradeStatKey) => void;
  onBuyOrEquipSkin: (id: SkinId) => void;
  onUpgradeVitality: () => void;
  onUpgradeArmor: () => void;
  onCompleteTutorial: () => void;
}

export function ShopModal({
  hud,
  onClose,
  onBuyOrEquip,
  onUpgrade,
  onBuyOrEquipSkin,
  onUpgradeVitality,
  onUpgradeArmor,
  onCompleteTutorial,
}: ShopModalProps) {
  const [tab, setTab] = useState<'weapons' | 'skins'>('weapons');

  useEffect(() => {
    if (hud.tutorialStep === 'upgrade_pistol' && tab !== 'weapons') {
      setTab('weapons');
    }
  }, [hud.tutorialStep, tab]);

  const vitMaxed = hud.vitalityLevel >= MAX_VITALITY_LEVEL;
  const vitCost = getVitalityUpgradeCost(hud.vitalityLevel);
  const canVit = canUpgradeVitality(hud.coins, hud.vitalityLevel);

  const armMaxed = hud.armorLevel >= MAX_ARMOR_LEVEL;
  const armCost = getArmorUpgradeCost(hud.armorLevel);
  const canArm = canUpgradeArmor(hud.coins, hud.armorLevel);

  const effPlayer = getEffectivePlayerStats(
    hud.activeSkinId,
    hud.vitalityLevel,
    hud.armorLevel,
    hud.playerLevel
  );

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-2 sm:p-4 bg-black/82 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Магазин снаряжения и обликов"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pixel-panel w-full max-w-4xl max-h-[92%] flex flex-col text-[#eef2ea]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-[#2e3d34]">
          <div>
            <h2 className="font-pixel text-xl sm:text-2xl md:text-3xl font-bold text-[#fbbf24]">
              Магазин и Мастерская
            </h2>
            <p className="text-[11px] sm:text-xs text-[#9cb0a1]">
              Вооружайся до зубов и возвращайся в лес ещё сильнее
            </p>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <div
              data-testid="shop-coins"
              className="font-mono-num text-sm sm:text-lg font-bold text-[#fbbf24] bg-[#0b100e] border border-[#2e3d34] px-3 py-1.5"
            >
              Монеты: {hud.coins}
            </div>
            <button
              type="button"
              data-testid="shop-close-x"
              onClick={(e) => {
                e.currentTarget.blur();
                onClose();
              }}
              className="pixel-btn min-w-[40px] min-h-[40px] flex items-center justify-center bg-[#1a241f] hover:bg-[#25332c] cursor-pointer"
              aria-label="Закрыть магазин [Esc]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Segmented Shop Tabs */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 px-4 sm:px-5 pt-3 pb-2.5 border-b border-[#243029] bg-[#0b110e]">
          <button
            type="button"
            data-testid="shop-tab-weapons"
            onClick={(e) => {
              e.currentTarget.blur();
              setTab('weapons');
            }}
            className={`pixel-btn min-h-[40px] flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold cursor-pointer ${
              tab === 'weapons'
                ? 'bg-[#d97706] border-[#fbbf24] text-[#090d0b]'
                : 'bg-[#141d18] hover:bg-[#1e2b24] text-[#cbd5cc]'
            }`}
          >
            <Swords className="w-4 h-4 shrink-0" />
            <span className="truncate">Оружие ({WEAPON_ORDER.length})</span>
          </button>

          <button
            type="button"
            data-testid="shop-tab-skins"
            onClick={(e) => {
              e.currentTarget.blur();
              setTab('skins');
            }}
            className={`pixel-btn min-h-[40px] flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold cursor-pointer ${
              tab === 'skins'
                ? 'bg-[#d97706] border-[#fbbf24] text-[#090d0b]'
                : 'bg-[#141d18] hover:bg-[#1e2b24] text-[#cbd5cc]'
            }`}
          >
            <User className="w-4 h-4 shrink-0" />
            <span className="truncate">Облики ({SKIN_ORDER.length}) · {SKINS[hud.activeSkinId].name}</span>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-3.5 sm:p-5 space-y-4 sm:space-y-5 overscroll-contain">
          {hud.tutorialStep === 'upgrade_pistol' && (
            <div
              data-testid="tutorial-shop-upgrade"
              className="border border-[#fbbf24] bg-[#241c0d] p-3.5 text-xs text-[#fef3c7] space-y-1"
            >
              <div className="font-bold text-[#fbbf24] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Обучение · Шаг 3: Прокачай своё первое оружие</span>
              </div>
              <p>
                В карточке «Ржавый ПМ» ниже нажми на подсвеченную кнопку улучшения{' '}
                <strong>Урона</strong> за заработанные монеты.
              </p>
            </div>
          )}

          {hud.tutorialStep === 'final_tips' && (
            <div
              data-testid="tutorial-shop-final"
              className="border border-[#4ade80] bg-[#10261a] p-3.5 text-xs text-[#dcfce7] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="font-bold text-[#4ade80]">
                  Отлично! Советы перед настоящими боями:
                </div>
                <p className="text-[11px] text-[#bbf7d0] leading-snug">
                  • Дальше раунды идут по <strong>7 волн</strong> (7+ зомби в каждой). За победы начисляется <strong>опыт (EXP)</strong>.
                  <br />• Новые уровни открывают суровые биомы со своей тактикой врагов (ловчие, щитоносцы, подрывники).
                  <br />• Новые <strong>облики</strong> дают солидный запас HP, броню и прибавку к урону!
                </p>
              </div>
              <button
                type="button"
                data-testid="btn-tutorial-finish"
                data-tutorial-target="btn-tutorial-finish"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCompleteTutorial();
                }}
                className="pixel-btn min-h-[38px] px-4 py-2 text-xs font-bold bg-[#22c55e] hover:bg-[#16a34a] border-[#86efac] text-[#052e16] cursor-pointer whitespace-nowrap shrink-0"
              >
                Понятно, завершить обучение
              </button>
            </div>
          )}

          {tab === 'weapons' ? (
            <>
              {/* Permanent Survival Perks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="border border-[#2e3d34] bg-[#101814] p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Heart className="w-6 h-6 text-[#ef4444] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-1.5">
                        <span>Живучесть</span>
                        <span className="font-mono-num text-[11px] text-[#fca5a5]">
                          ({hud.vitalityLevel}/{MAX_VITALITY_LEVEL})
                        </span>
                      </div>
                      <div className="text-xs text-[#9cb0a1]">
                        Всего HP в бою: <strong className="text-[#f4f7f2]">{effPlayer.maxHp}</strong> (+20 за ур.)
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="btn-upgrade-vitality"
                    disabled={!canVit}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onUpgradeVitality();
                    }}
                    className="pixel-btn min-h-[40px] px-3.5 py-2 text-xs font-bold bg-[#1f3328] hover:bg-[#2a4536] disabled:opacity-40 disabled:cursor-not-allowed text-[#fef3c7] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {vitMaxed ? 'МАКС' : `${vitCost} мон.`}
                  </button>
                </div>

                <div className="border border-[#2e3d34] bg-[#101814] p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Shield className="w-6 h-6 text-[#60a5fa] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-1.5">
                        <span>Укреплённая броня</span>
                        <span className="font-mono-num text-[11px] text-[#93c5fd]">
                          ({hud.armorLevel}/{MAX_ARMOR_LEVEL})
                        </span>
                      </div>
                      <div className="text-xs text-[#9cb0a1]">
                        Всего брони: <strong className="text-[#f4f7f2]">{effPlayer.startArmor}</strong> (+15 за ур.)
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="btn-upgrade-armor"
                    disabled={!canArm}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onUpgradeArmor();
                    }}
                    className="pixel-btn min-h-[40px] px-3.5 py-2 text-xs font-bold bg-[#1f2938] hover:bg-[#2a384d] disabled:opacity-40 disabled:cursor-not-allowed text-[#dbeafe] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {armMaxed ? 'МАКС' : `${armCost} мон.`}
                  </button>
                </div>
              </div>

              {/* Weapons List */}
              <div className="space-y-3">
                {WEAPON_ORDER.map((wId) => {
                  const def = WEAPONS[wId];
                  const owned = hud.ownedWeapons.includes(wId);
                  const equipped = hud.activeWeaponId === wId;
                  const upg = hud.upgrades[wId];
                  const stats = getWeaponEffectiveStats(def, upg);
                  const canBuy = canPurchaseWeapon(hud.coins, hud.ownedWeapons, wId);
                  const highlightTutorial =
                    hud.tutorialStep === 'upgrade_pistol' && wId === 'rusty_pistol';

                  const statButtons: Array<{
                    key: UpgradeStatKey;
                    label: string;
                    level: number;
                    valText: string;
                  }> = [
                    {
                      key: 'damage',
                      label: 'Урон',
                      level: upg.damageLevel,
                      valText: def.pellets > 1 ? `${stats.damage}×${def.pellets}` : `${stats.damage}`,
                    },
                    {
                      key: 'fireRate',
                      label: 'Темп',
                      level: upg.fireRateLevel,
                      valText: `${stats.fireRate}/с`,
                    },
                    {
                      key: 'mag',
                      label: 'Обойма',
                      level: upg.magLevel,
                      valText: `${stats.magSize}`,
                    },
                  ];

                  return (
                    <div
                      key={wId}
                      data-testid={`weapon-card-${wId}`}
                      className={`border p-3.5 sm:p-4 transition-colors ${
                        highlightTutorial
                          ? 'border-[#fbbf24] bg-[#211b10]'
                          : equipped
                            ? 'border-[#fbbf24] bg-[#16211b]'
                            : 'border-[#2e3d34] bg-[#0f1613]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="inline-block w-2.5 h-2.5 shrink-0"
                              style={{ backgroundColor: def.accentColor }}
                            />
                            <h3 className="font-pixel text-lg sm:text-xl font-bold text-[#f4f7f2]">
                              {def.name}
                            </h3>
                            <span className="text-xs text-[#9cb0a1]">· {def.role}</span>
                            {def.pierce > 1 && (
                              <span className="font-mono-num text-[10px] font-bold text-[#4ade80] border border-[#2a4d3a] bg-[#0f2419] px-1.5 py-0.5">
                                Пробитие ×{def.pierce}
                              </span>
                            )}
                          </div>
                        </div>

                        {owned ? (
                          <div
                            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold border flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              equipped
                                ? 'bg-[#2a4d3a] border-[#4ade80] text-[#dcfce7]'
                                : 'bg-[#121a16] border-[#2e3d34] text-[#7e9485]'
                            }`}
                          >
                            {equipped && <Check className="w-3.5 h-3.5" />}
                            <span>{equipped ? 'В бою (последнее)' : 'Заменено новым'}</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!canBuy}
                            onClick={(e) => {
                              e.currentTarget.blur();
                              onBuyOrEquip(wId);
                            }}
                            className="pixel-btn min-h-[38px] px-4 py-1.5 text-xs font-bold bg-[#d97706] hover:bg-[#ea8c15] border-[#fbbf24] text-[#090d0b] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Купить · {def.price} мон.
                          </button>
                        )}
                      </div>

                      {/* Upgrade Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {statButtons.map((st) => {
                          const maxed = st.level >= MAX_UPGRADE_LEVEL;
                          const cost = getUpgradeCost(wId, st.key, st.level);
                          const canUpg = canUpgradeWeapon(
                            hud.coins,
                            hud.ownedWeapons,
                            hud.upgrades,
                            wId,
                            st.key
                          );

                          return (
                            <div
                              key={st.key}
                              className="border border-[#243029] bg-[#0b100e] px-3 py-2 flex items-center justify-between gap-2"
                            >
                              <div>
                                <div className="text-[11px] text-[#9cb0a1]">
                                  {st.label} (ур. {st.level}/{MAX_UPGRADE_LEVEL})
                                </div>
                                <div className="font-mono-num text-sm font-bold text-[#f4f7f2]">
                                  {st.valText}
                                </div>
                              </div>

                              {owned && (
                                <button
                                  type="button"
                                  data-tutorial-target={`btn-upgrade-${wId}-${st.key}`}
                                  disabled={!canUpg}
                                  onClick={(e) => {
                                    e.currentTarget.blur();
                                    onUpgrade(wId, st.key);
                                  }}
                                  className="pixel-btn min-h-[36px] px-2.5 py-1.5 text-xs font-semibold bg-[#18241e] hover:bg-[#24362d] disabled:opacity-40 disabled:cursor-not-allowed text-[#fbbf24] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                  title={`Улучшить ${st.label}`}
                                >
                                  <ArrowUpCircle className="w-3.5 h-3.5" />
                                  <span>{maxed ? 'МАКС' : `${cost}`}</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-xs sm:text-sm text-[#9cb0a1]">
                Облики меняют внешний вид у костра и в бою, а также дают прочность, броню и усиление урона. Более дорогие облики ощутимо сильнее!
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {SKIN_ORDER.map((skinId) => {
                  const skin = SKINS[skinId];
                  const owned = hud.ownedSkins.includes(skinId);
                  const equipped = hud.activeSkinId === skinId;
                  const canBuy = canPurchaseSkin(hud.coins, hud.ownedSkins, skinId);

                  return (
                    <div
                      key={skinId}
                      data-testid={`skin-card-${skinId}`}
                      className={`border p-3.5 sm:p-4 flex items-center gap-3.5 sm:gap-4 transition-colors ${
                        equipped
                          ? 'border-[#fbbf24] bg-[#16211b]'
                          : 'border-[#2e3d34] bg-[#0f1613]'
                      }`}
                    >
                      <div className="w-16 h-20 border border-[#2e3d34] bg-[#090e0c] flex items-center justify-center shrink-0">
                        <SkinPreview skinId={skinId} scale={3} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-pixel text-lg font-bold text-[#f4f7f2] truncate">
                          {skin.name}
                        </h3>
                        <p className="text-[11px] text-[#9cb0a1] mt-0.5 mb-2 leading-snug">
                          {skin.description}
                        </p>

                        <div className="flex flex-wrap gap-1.5 mb-2.5 text-[10px] font-mono-num">
                          <span className="border border-[#2b3b32] bg-[#090f0c] px-1.5 py-0.5 text-[#fca5a5]">
                            +{skin.bonusHp} HP
                          </span>
                          <span className="border border-[#2b3b32] bg-[#090f0c] px-1.5 py-0.5 text-[#93c5fd]">
                            +{skin.bonusArmor} Броня
                          </span>
                          {skin.damageBonusPct > 0 && (
                            <span className="border border-[#2b3b32] bg-[#090f0c] px-1.5 py-0.5 text-[#fbbf24]">
                              +{skin.damageBonusPct}% Урон
                            </span>
                          )}
                          {skin.speedBonusPct > 0 && (
                            <span className="border border-[#2b3b32] bg-[#090f0c] px-1.5 py-0.5 text-[#86efac]">
                              +{skin.speedBonusPct}% Бег
                            </span>
                          )}
                        </div>

                        {owned ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.currentTarget.blur();
                              onBuyOrEquipSkin(skinId);
                            }}
                            className={`pixel-btn min-h-[38px] px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                              equipped
                                ? 'bg-[#2a4d3a] border-[#4ade80] text-[#dcfce7]'
                                : 'bg-[#1a241f] hover:bg-[#25332c] text-[#e4ece3]'
                            }`}
                          >
                            {equipped && <Check className="w-3.5 h-3.5" />}
                            <span>{equipped ? 'Надето' : 'Надеть'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canBuy}
                            onClick={(e) => {
                              e.currentTarget.blur();
                              onBuyOrEquipSkin(skinId);
                            }}
                            className="pixel-btn min-h-[38px] px-3.5 py-1.5 text-xs font-bold bg-[#d97706] hover:bg-[#ea8c15] border-[#fbbf24] text-[#090d0b] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                          >
                            Купить · {skin.price} мон.
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 sm:px-5 border-t border-[#2e3d34] flex flex-wrap items-center justify-between gap-2 bg-[#0b100e]">
          <span className="text-[11px] sm:text-xs text-[#8fa194]">
            Всё снаряжение готово к бою — проверь патроны и жми «Играть»
          </span>
          <button
            type="button"
            data-testid="shop-close-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              onClose();
            }}
            className="pixel-btn font-pixel min-h-[40px] bg-[#d97706] hover:bg-[#ea8c15] border-[#fbbf24] text-[#090d0b] font-bold px-5 py-2 text-sm cursor-pointer ml-auto"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
