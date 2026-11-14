import { ShieldAlert } from 'lucide-react';
import type { IntegrityViolation } from '../game/anticheat';

interface TamperLockoutModalProps {
  violation: IntegrityViolation;
  onConfirmExit: () => void;
}

export function TamperLockoutModal({ violation, onConfirmExit }: TamperLockoutModalProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tamper-lockout-title"
      aria-describedby="tamper-lockout-desc"
      data-testid="tamper-lockout-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#030504]/96 backdrop-blur-sm select-none pointer-events-auto"
    >
      <div className="pixel-panel w-full max-w-md border-2 border-[#dc2626] bg-[#0b100e] text-[#f4f7f2] shadow-2xl overflow-hidden">
        {/* Official Security Header */}
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5 bg-[#1b0b0c] border-b border-[#7f1d1d]">
          <div className="w-10 h-10 border border-[#ef4444] bg-[#2a0f11] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-[#f87171]" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] sm:text-[11px] font-mono-num uppercase tracking-wider text-[#fca5a5]">
              Служба целостности · «Тёмная Чаща»
            </div>
            <h2
              id="tamper-lockout-title"
              className="font-pixel text-lg sm:text-xl font-bold text-[#f87171] leading-tight"
            >
              {violation.title}
            </h2>
          </div>
        </div>

        {/* Official Body */}
        <div className="p-4 sm:p-5 space-y-4">
          <p
            id="tamper-lockout-desc"
            className="text-xs sm:text-sm text-[#e4ece3] leading-relaxed"
          >
            {violation.message}
          </p>

          <div className="border border-[#3b1c1e] bg-[#140a0b] px-3 py-2 text-[11px] font-mono-num text-[#fca5a5] flex items-center justify-between gap-2">
            <span>Статус проверки: ОТКАЗ В ДОСТУПЕ</span>
            <span className="font-bold text-[#f87171]">{violation.code}</span>
          </div>

          <button
            type="button"
            data-testid="btn-tamper-ok"
            onClick={onConfirmExit}
            className="pixel-btn w-full min-h-[46px] px-5 py-2.5 font-pixel text-base sm:text-lg font-bold bg-[#dc2626] hover:bg-[#ef4444] border-[#fca5a5] text-white cursor-pointer"
          >
            ОК
          </button>
        </div>
      </div>
    </div>
  );
}
