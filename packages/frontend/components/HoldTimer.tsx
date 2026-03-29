/**
 * HoldTimer Component
 * Displays a countdown timer for item holds with visual urgency warnings.
 * Shows time remaining, changes color as expiry approaches.
 * Fetches hold expiry from the API using itemId.
 */

import { useState, useEffect } from 'react';
import api from '../lib/api';

interface HoldTimerProps {
  itemId: string;
  onExpiry?: () => void;
}

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export default function HoldTimer({ itemId, onExpiry }: HoldTimerProps) {
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);

  // Fetch the hold/reservation data for this item
  useEffect(() => {
    const fetchHold = async () => {
      try {
        const response = await api.get(`/reservations/item/${itemId}`);
        if (response.data?.expiresAt) {
          setExpiresAt(response.data.expiresAt);
        }
      } catch (error) {
        // No reservation found or error fetching — render nothing
        console.warn(`Failed to fetch hold for item ${itemId}:`, error);
      }
    };

    fetchHold();
  }, [itemId]);

  // Countdown timer — only runs if expiresAt is set
  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0, totalMs: 0 });
        onExpiry?.();
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({ hours, minutes, seconds, totalMs: diff });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpiry]);

  if (!timeRemaining) return null;

  const { hours, minutes, seconds, totalMs } = timeRemaining;
  const isExpired = totalMs <= 0;
  const isUrgent = totalMs <= 5 * 60 * 1000; // 5 minutes
  const isCritical = totalMs <= 60 * 1000; // 1 minute

  if (isExpired) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm font-semibold">Hold expired</span>
      </div>
    );
  }

  const formatTime = (h: number, m: number, s: number) => {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  let containerClass = 'flex items-center gap-2';
  let textClass = 'text-sm font-semibold';

  if (isCritical) {
    containerClass += ' text-red-600';
    textClass += ' animate-pulse';
  } else if (isUrgent) {
    containerClass += ' text-amber-600';
  } else {
    containerClass += ' text-amber-600';
  }

  let icon: React.ReactNode = null;
  if (isCritical) {
    icon = (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    );
  } else if (isUrgent) {
    icon = (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M6 2a1 1 0 00-1 1v2H4a2 2 0 00-2 2v2h16V7a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v2H7V3a1 1 0 00-1-1zm0 5a2 2 0 002 2h8a2 2 0 002-2H6z"
          clipRule="evenodd"
        />
      </svg>
    );
  } else {
    icon = (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  const displayText = isCritical
    ? `Hold expiring NOW! ${formatTime(hours, minutes, seconds)}`
    : isUrgent
    ? `Hurry! Hold expires in ${formatTime(hours, minutes, seconds)}`
    : `Your hold expires in ${formatTime(hours, minutes, seconds)}`;

  return (
    <div className={containerClass}>
      {icon}
      <span className={textClass}>{displayText}</span>
    </div>
  );
}
