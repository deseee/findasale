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
  emoji: string;
}

interface ConfettiProps {
  isActive: boolean;
  onComplete?: () => void;
}

const CONFETTI_EMOJIS = ['🎉', '🎊', '✨', '⭐', '🌟', '💫', '🎈'];

const Confetti: React.FC<ConfettiProps> = ({ isActive, onComplete }) => {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);

  useEffect(() => {
    if (!isActive) return;

    // Generate confetti particles
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.2,
      duration: 2 + Math.random() * 0.5,
      emoji: CONFETTI_EMOJIS[Math.floor(Math.random() * CONFETTI_EMOJIS.length)],
    }));

    setParticles(newParticles);

    // Auto-clear after animation completes
    const timer = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, 2500);

    return () => clearTimeout(timer);
  }, [isActive, onComplete]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="confetti-particle fixed text-2xl"
          style={{
            left: `${particle.left}%`,
            top: '0',
            animation: `confettiFall ${particle.duration}s ease-out forwards`,
            animationDelay: `${particle.delay}s`,
          }}
        >
          {particle.emoji}
        </div>
      ))}
    </div>
  );
};

export default Confetti;
