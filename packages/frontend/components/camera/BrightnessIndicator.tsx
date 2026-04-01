/**
 * BrightnessIndicator — Real-time viewfinder lighting guidance
 *
 * Displays a visual indicator (●●●●● / ●●●○○ / ●○○○○) and text guidance
 * based on sampled brightness from video feed.
 *
 * Usage:
 * - Pass videoRef from a <video> element
 * - Component samples brightness every 500ms
 * - Shows green (≥65%), yellow (40-65%), or red (<40%)
 */

import React, { useState, useEffect } from 'react';

export interface BrightnessIndicatorProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive?: boolean;
}

const BrightnessIndicator: React.FC<BrightnessIndicatorProps> = ({
  videoRef,
  isActive = true,
}) => {
  const [brightness, setBrightness] = useState<number | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive || !videoRef.current) return;

    // Delay 500ms to ensure video stream has painted first frame
    const timeoutId = setTimeout(() => {
      const interval = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;

        try {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const video = videoRef.current;
          canvas.width = 64;
          canvas.height = 64;

          // Draw center sample area from video
          ctx.drawImage(
            video,
            video.videoWidth / 2 - 32,
            video.videoHeight / 2 - 32,
            64,
            64,
            0,
            0,
            64,
            64
          );

          const data = ctx.getImageData(0, 0, 64, 64).data;
          let total = 0;
          for (let i = 0; i < data.length; i += 4) {
            total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          }
          const avgRaw = total / (64 * 64);
          const avgNormalized = (avgRaw / 255) * 100;

          setBrightness(avgNormalized);
        } catch (err) {
          // Silently fail if video not ready
        }
      }, 500);

      return () => clearInterval(interval);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [videoRef, isActive]);

  const getTierInfo = (b: number | null) => {
    if (b === null) return { dots: '●●●●●', color: 'text-gray-400', bg: 'bg-gray-800/60', text: 'Checking light...' };
    if (b >= 65) return { dots: '●●●●●', color: 'text-green-400', bg: 'bg-green-600', text: 'Good lighting—ready to capture' };
    if (b >= 40) return { dots: '●●●○○', color: 'text-yellow-400', bg: 'bg-yellow-600', text: 'Soft lighting—might work, but brighter is better' };
    return { dots: '●○○○○', color: 'text-red-400', bg: 'bg-red-600', text: 'Too dark—move near a window or lamp' };
  };

  const tierInfo = getTierInfo(brightness);

  return (
    <>
      {/* Hidden canvas for sampling */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Brightness indicator — one line, semi-transparent, below top bar */}
      <div className={`absolute top-16 left-1/2 -translate-x-1/2 backdrop-blur-sm rounded-full px-3 py-1 z-10 flex items-center gap-1.5 text-xs font-medium pointer-events-none`}
        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      >
        <span className={tierInfo.color}>{tierInfo.dots}</span>
        <span className="text-white">{tierInfo.text}</span>
      </div>
    </>
  );
};

export default BrightnessIndicator;
