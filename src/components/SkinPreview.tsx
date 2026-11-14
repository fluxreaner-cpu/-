import { useEffect, useRef } from 'react';
import { drawPlayerSkinFrame } from '../game/sprites';
import type { SkinId } from '../game/types';

interface SkinPreviewProps {
  skinId: SkinId;
  scale?: number;
  className?: string;
}

export function SkinPreview({ skinId, scale = 3, className = '' }: SkinPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sprite = drawPlayerSkinFrame(skinId, 0, false);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
  }, [skinId, scale]);

  return (
    <canvas
      ref={canvasRef}
      width={22 * scale}
      height={26 * scale}
      className={`pixel-canvas block shrink-0 ${className}`}
      aria-hidden="true"
    />
  );
}
