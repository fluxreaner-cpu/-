import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';

interface LoadingScreenProps {
  tipText: string;
  tipIndex: number;
  onFinished: () => void;
}

const LOADING_DURATION_MS = 2800;

export function LoadingScreen({ tipText, tipIndex, onFinished }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let rafId = 0;
    let doneTimeout: number | undefined;
    const start = performance.now();

    const step = (now: number) => {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / LOADING_DURATION_MS);
      // Ease out slightly so initial progress fills briskly then lands cleanly at 100%
      const eased = 1 - Math.pow(1 - ratio, 1.8);
      setProgress(Math.round(eased * 100));

      if (ratio < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setProgress(100);
        doneTimeout = window.setTimeout(() => {
          onFinished();
        }, 160);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
      if (doneTimeout !== undefined) window.clearTimeout(doneTimeout);
    };
  }, [onFinished]);

  return (
    <div
      data-testid="loading-screen"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070b09] text-[#eef2ea] p-4 select-none overflow-hidden"
    >
      {/* Subtle dark forest atmospheric vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 58%, rgba(217,119,6,0.14) 0%, rgba(14,26,20,0.65) 45%, rgba(5,8,7,0.98) 100%)',
        }}
      />

      {/* TOP-CENTER TIP BANNER */}
      <div
        data-testid="loading-tip"
        data-tip-index={tipIndex}
        className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-20 w-[min(92%,580px)]"
      >
        <div className="pixel-panel px-4 py-2.5 sm:px-5 sm:py-3 border-[#d97706] bg-[#0e1713]/95 text-center shadow-2xl">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <span className="font-pixel text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#fbbf24]">
              Подсказка
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#f4f7f2] leading-snug m-0">
            {tipText}
          </p>
        </div>
      </div>

      {/* Center Game Emblem + Progress Bar */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full mt-12">
        <div className="mb-3 flex items-center justify-center w-14 h-14 border-2 border-[#d97706] bg-[#111a15] shadow-lg">
          <Flame className="w-8 h-8 text-[#fbbf24] animate-pulse" />
        </div>

        <h1
          className="font-pixel text-3xl sm:text-5xl font-bold tracking-tight text-[#f4f7f2] leading-none mb-1.5"
          style={{ textShadow: '0 4px 0 #090d0b' }}
        >
          ТЁМНАЯ ЧАЩА
        </h1>
        <p className="text-xs sm:text-sm text-[#9cb0a1] mb-6">
          Подготовка тропы и снаряжения...
        </p>

        {/* Pixel Loading Bar */}
        <div className="w-full max-w-xs sm:max-w-sm">
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-mono-num text-[#cbd5cc] mb-1.5">
            <span>ЗАГРУЗКА</span>
            <span className="text-[#fbbf24] font-bold">{progress}%</span>
          </div>
          <div className="w-full h-3.5 bg-[#090d0b] border-2 border-[#3f5247] p-0.5">
            <div
              className="h-full bg-gradient-to-r from-[#b45309] via-[#d97706] to-[#fbbf24] transition-[width] duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
