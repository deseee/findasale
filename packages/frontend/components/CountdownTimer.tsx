import { useState, useEffect } from 'react';

interface CountdownTimerProps {
  targetDate: Date | string;
  onReveal?: () => void;
}

export default function CountdownTimer({ targetDate, onReveal }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0, revealed: false });

  useEffect(() => {
    const tick = () => {
      const now = new Date().getTime();
      const target = typeof targetDate === "string" ? new Date(targetDate).getTime() : targetDate.getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, revealed: true });
        onReveal?.();
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ hours, minutes, seconds, revealed: false });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate, onReveal]);

  if (timeLeft.revealed) return null;

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center gap-4 justify-center py-6">
      {[
        { label: "HRS", value: timeLeft.hours },
        { label: "MIN", value: timeLeft.minutes },
        { label: "SEC", value: timeLeft.seconds },
      ].map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center">
          <span className="text-4xl font-bold text-amber-600 font-mono">{pad(value)}</span>
          <span className="text-xs text-amber-500 mt-1">{label}</span>
        </div>
      ))}
    </div>
  );
}
