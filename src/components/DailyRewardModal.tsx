import { Check, Coins, Gift, Lock, Sparkles, Trophy, X } from 'lucide-react';
import { DAILY_REWARDS } from '../game/constants';
import type { HudSnapshot } from '../game/types';

interface DailyRewardModalProps {
  hud: HudSnapshot;
  onClose: () => void;
  onClaim: () => void;
}

export function DailyRewardModal({ hud, onClose, onClaim }: DailyRewardModalProps) {
  const activeReward = DAILY_REWARDS[hud.dailyNextDayIndex] ?? DAILY_REWARDS[0];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-2.5 sm:p-4 bg-black/82 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Ежедневные награды"
      data-testid="daily-reward-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pixel-panel w-full max-w-3xl max-h-[92%] flex flex-col text-[#eef2ea]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-[#2e3d34]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#1f2e24] border border-[#fbbf24] flex items-center justify-center shrink-0">
              <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-[#fbbf24]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-pixel text-lg sm:text-2xl font-bold text-[#fbbf24] leading-tight">
                Ежедневные награды
              </h2>
              <p className="text-[11px] sm:text-xs text-[#9cb0a1]">
                Заходи каждый день подряд и забирай всё больше монет, EXP и трофей на 7-й день
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div
              data-testid="daily-streak-badge"
              className="font-mono-num text-xs sm:text-sm font-bold text-[#4ade80] bg-[#0b100e] border border-[#2e3d34] px-2.5 py-1"
            >
              Серия: {hud.dailyStreak}/7 дн.
            </div>
            <button
              type="button"
              data-testid="daily-close-x"
              onClick={(e) => {
                e.currentTarget.blur();
                onClose();
              }}
              className="pixel-btn min-w-[36px] min-h-[36px] flex items-center justify-center bg-[#1a241f] hover:bg-[#25332c] cursor-pointer"
              aria-label="Закрыть окно наград"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-3.5">
          {/* 7-Day Reward Calendar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {DAILY_REWARDS.map((item, idx) => {
              const isClaimed = idx < hud.dailyStreak;
              const isTodayTarget = hud.dailyCanClaim && idx === hud.dailyNextDayIndex;
              const isDay7 = item.day === 7;

              return (
                <div
                  key={item.day}
                  data-testid={`daily-day-${item.day}`}
                  data-state={isClaimed ? 'claimed' : isTodayTarget ? 'ready' : 'locked'}
                  className={`border p-2.5 flex flex-col justify-between gap-1.5 transition-colors ${
                    isTodayTarget
                      ? 'bg-[#1a2b1d] border-[#fbbf24] ring-1 ring-[#fbbf24]/60'
                      : isClaimed
                        ? 'bg-[#111c16] border-[#2e4b3a] opacity-85'
                        : isDay7
                          ? 'bg-[#1f1719] border-[#59333a]'
                          : 'bg-[#0e1511] border-[#25332b]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`font-pixel text-sm font-bold ${
                        isTodayTarget
                          ? 'text-[#fbbf24]'
                          : isClaimed
                            ? 'text-[#4ade80]'
                            : isDay7
                              ? 'text-[#fb7185]'
                              : 'text-[#cbd5cc]'
                      }`}
                    >
                      День {item.day}
                    </span>
                    {isClaimed ? (
                      <Check className="w-4 h-4 text-[#4ade80] shrink-0" />
                    ) : isTodayTarget ? (
                      <Sparkles className="w-4 h-4 text-[#fbbf24] shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#64748b] shrink-0" />
                    )}
                  </div>

                  <div className="text-[10px] text-[#9cb0a1] leading-tight line-clamp-2">
                    {item.label}
                  </div>

                  <div className="space-y-0.5 pt-1 border-t border-white/10 font-mono-num text-[11px]">
                    <div className="flex items-center gap-1 text-[#fbbf24] font-bold">
                      <Coins className="w-3 h-3 shrink-0" />
                      <span>+{item.coins}</span>
                    </div>
                    <div className="text-[#4ade80] font-bold">+{item.xp} EXP</div>
                    {item.trophies && item.trophies > 0 && (
                      <div className="flex items-center gap-1 text-[#fb7185] font-bold">
                        <Trophy className="w-3 h-3 shrink-0" />
                        <span>+{item.trophies} троф.</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Claim CTA Strip */}
          <div className="pixel-panel p-3 sm:p-3.5 bg-[#101914] border-[#2e3d34] flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs sm:text-sm font-bold text-[#f4f7f2]">
                {hud.dailyCanClaim
                  ? `Награда за День ${activeReward.day}: +${activeReward.coins} монет и +${activeReward.xp} EXP${
                      activeReward.trophies ? ` + ${activeReward.trophies} трофей` : ''
                    }`
                  : 'Сегодняшняя награда уже получена!'}
              </div>
              <div className="text-[11px] text-[#9cb0a1]">
                {hud.dailyCanClaim
                  ? 'Забирай сейчас — серия сохранится при следующем ежедневном заходе.'
                  : 'Возвращайся завтра, чтобы не сбить серию и забрать следующую награду.'}
              </div>
            </div>

            <button
              type="button"
              data-testid="btn-claim-daily"
              disabled={!hud.dailyCanClaim}
              onClick={(e) => {
                e.currentTarget.blur();
                onClaim();
              }}
              className={`pixel-btn min-h-[44px] px-5 py-2 font-pixel text-lg font-bold flex items-center gap-2 shrink-0 ${
                hud.dailyCanClaim
                  ? 'bg-[#22c55e] hover:bg-[#34d399] border-[#86efac] text-[#052e16] cursor-pointer'
                  : 'bg-[#1a241f] border-[#2e3d34] text-[#64748b] cursor-not-allowed opacity-75'
              }`}
            >
              <Gift className="w-4 h-4" />
              <span>
                {hud.dailyCanClaim ? `Забрать (День ${activeReward.day})` : 'Получено сегодня'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
