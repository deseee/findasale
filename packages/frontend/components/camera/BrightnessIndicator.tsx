/**
 * BrightnessIndicator component for real-time viewfinder lighting guidance.
 *
 * Uses 80th-percentile brightness instead of mean brightness to prevent
 * dark-colored items from triggering false low-light warnings when the
 * overall scene is well-lit.
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

    const timeoutId = setTimeout(() => {
      const interval = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;

        try {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const video = videoRef.current;
          canvas.width = 160;
          canvas.height = 160;

          ctx.drawImage(
            video,
            video.videoWidth / 2 - 80,
            video.videoHeight / 2 - 80,
            160,
            160,
            0,
            0,
            160,
            160
          );

          const data = ctx.getImageData(0, 0, 160, 160).data;
          const luminances: number[] = [];

          for (let i = 0; i < data.length; i += 4) {
            const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            luminances.push(lum);
          }

          luminances.sort((a, b) => a - b);

          const p80index = Math.floor(luminances.length * 0.8);
          const p80brightness = (luminances[p80index] / 255) * 100;

          setBrightness(p80brightness);
        } catch (err) {
          // Silently fail if video not ready
        }
      }, 500);

      return () => clearInterval(interval);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [videoRef, isActive]);

  const getTierInfo = (b: number | null) => {
    if (b === null) return { dots: '●●●●●', color: 'text-gray-400', text: 'Checking light...' };
    if (b >= 65) return { dots: '●●●●●', color: 'text-green-400', text: 'Lighting looks good' };
    if (b >= 40) return { dots: '●●●○○', color: 'text-yellow-400', text: 'Soft light — brighter helps' };
    return { dots: '●○○○○', color: 'text-red-400', text: 'Move toward better light' };
  };

  const tierInfo = getTierInfo(brightness);

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="absolute top-[79px] left-1/2 -translate-x-1/2 z-10 pointer-events-none whitespace-nowrap bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5 text-xs font-medium">
        <span className={tierInfo.color}>{tierInfo.dots}</span>
        <span className="text-white">{tierInfo.text}</span>
      </div>
    </>
  );
};

export default BrightnessIndicator;
