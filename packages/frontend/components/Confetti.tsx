/**
 * Confetti — Lightweight confetti burst animation
 * Phase 27: Microinteractions — triggers on first sale publish
 *
 * Renders 20 particles that fall and rotate away
 * Auto-removes after 2 seconds
 */

import React, { useEffect, useState } from 'react';

interface ConfettiParticle {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: 'sage' | 'amber' | 'coral';
}

interface ConfettiProps {
  isActive: boolean;
  onComplete?: () => void;
}

const CONFETTI_COLORS = ['sage', 'amber', 'coral'] as const;

const Confetti: React.FC<ConfettiProps> = ({ isActive, onComplete }) => {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);

  useEffect(() => {
    if (!isActive) return;

    // Generate 14 confetti particles with colored dots
    const newParticles = Array.from({ length: 14 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 2.5 + Math.random() * 0.5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }));

    setParticles(newParticles);

    // Auto-clear after animation completes
    const timer = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, 3000);

    return () => clearTimeout(timer);
  }, [isActive, onComplete]);

  if (particles.length === 0) return null;

  const getColorClass = (color: string) => {
    switch (color) {
      case 'sage':
        return 'bg-sage-500';
      case 'amber':
        return 'bg-amber-400';
      case 'coral':
        return 'bg-rose-400';
      default:
        return 'bg-sage-500';
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className={`confetti-particle fixed rounded-full ${getColorClass(particle.color)}`}
          style={{
            left: `${particle.left}%`,
            top: '0',
            width: '10px',
            height: '10px',
            animation: `confettiFall ${particle.duration}s ease-out forwards`,
            animationDelay: `${particle.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

export default Confetti;
