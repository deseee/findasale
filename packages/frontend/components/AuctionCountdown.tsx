import { useState, useEffect } from 'react';

interface Props {
  endTime: string; // ISO date string
  onExpired?: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

const AuctionCountdown = ({ endTime, onExpired }: Props) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const calc = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) {
        setExpired(true);
        setTimeLeft('');
        onExpired?.();
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) {
        setTimeLeft(`${h}h ${pad(m)}m ${pad(s)}s`);
      } else {
        setTimeLeft(`${pad(m)}m ${pad(s)}s`);
      }
    };

    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  if (expired) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-warm-500 bg-warm-100 px-2 py-0.5 rounded-full">
        Auction ended
      </span>
    );
  }

  const diff = new Date(endTime).getTime() - Date.now();
  const urgent = diff < 3600000; // < 1 hour

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      ⏱ {timeLeft}
    </span>
  );
};

export default AuctionCountdown;
