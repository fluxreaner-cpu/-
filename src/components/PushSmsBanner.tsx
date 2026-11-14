import { Gift, MessageSquare, X } from 'lucide-react';
import type { HudSnapshot } from '../game/types';

interface PushSmsBannerProps {
  hud: HudSnapshot;
  isRotated?: boolean;
  onDismiss: () => void;
  onOpenDaily: () => void;
}

export function PushSmsBanner({
  hud,
  isRotated = false,
  onDismiss,
  onOpenDaily,
}: PushSmsBannerProps) {
  const sms = hud.activePushSms;
  if (!sms) return null;

  return (
    <div
      data-testid="push-sms-banner"
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 z-[45] pointer-events-auto ${
        isRotated ? 'top-1.5 w-[min(94%,540px)]' : 'top-2.5 w-[min(94%,460px)]'
      }`}
    >
      <div
        className={`pixel-panel bg-[#0d1924]/96 border-[#38bdf8] shadow-[0_8px_28px_rgba(0,0,0,0.75)] text-[#e0f2fe] ${
          isRotated ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5'
        }`}
      >
        <div className="flex items-start gap-2">
          <div
            className={`bg-[#082f49] border border-[#38bdf8] flex items-center justify-center shrink-0 mt-0.5 ${
              isRotated ? 'w-6 h-6' : 'w-8 h-8'
            }`}
          >
            <MessageSquare className={isRotated ? 'w-3.5 h-3.5 text-[#38bdf8]' : 'w-4 h-4 text-[#38bdf8]'} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`font-pixel font-bold text-[#7dd3fc] tracking-wide truncate ${
                  isRotated ? 'text-xs' : 'text-sm'
                }`}
              >
                {sms.title}
              </span>
              <span className="text-[10px] font-mono-num text-[#94a3b8] shrink-0">
                {sms.timestampText}
              </span>
            </div>

            <p className={isRotated ? 'text-[11px] text-[#f1f5f9] leading-tight mt-0.5' : 'text-xs text-[#f1f5f9] leading-snug mt-0.5'}>
              {sms.body}
            </p>

            {hud.screenState === 'title' && hud.dailyCanClaim && !hud.dailyModalOpen && (
              <div className="mt-1.5">
                <button
                  type="button"
                  data-testid="btn-sms-open-daily"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenDaily();
                  }}
                  className="pixel-btn px-2.5 py-1 text-[11px] font-bold bg-[#fbbf24] hover:bg-[#fcd34d] border-[#fef08a] text-[#0b0f0d] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Gift className="w-3.5 h-3.5" />
                  <span>Забрать награду дня</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="btn-sms-dismiss"
            onClick={(e) => {
              e.currentTarget.blur();
              onDismiss();
            }}
            aria-label="Закрыть СМС"
            className="pixel-btn min-w-[26px] min-h-[26px] flex items-center justify-center bg-[#172536] hover:bg-[#1e324a] border-[#38bdf8]/60 text-[#cbd5e1] cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
