import React, { useMemo } from 'react';

interface Item {
  id: string;
  title: string;
  roomTag: string | null;
  price: number | null;
}

interface SaleFloorMapProps {
  items: Item[];
  onRoomClick?: (roomTag: string) => void;
}

// #416: Sale Floor Map — visual room/area breakdown by roomTag
const SaleFloorMap: React.FC<SaleFloorMapProps> = ({ items, onRoomClick }) => {
  const roomGroups = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      if (item.roomTag && item.roomTag.trim()) {
        const tag = item.roomTag.trim();
        map[tag] = (map[tag] || 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [items]);

  if (roomGroups.length < 2) return null;

  const capitalize = (s: string) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-5">
      <div className="text-xs uppercase tracking-widest mb-1" style={{ fontFamily: 'ui-monospace, monospace', color: '#C8552B', letterSpacing: '0.1em' }}>
        Floor Guide
      </div>
      <h2 style={{ fontFamily: '"Inter Tight", "Inter", sans-serif', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 14px', color: 'inherit' }}>
        What's where
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {roomGroups.map(([room, count]) => (
          <button
            key={room}
            onClick={() => onRoomClick?.(room)}
            className="text-left rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#1A2233] p-3.5 hover:border-[#C8552B]/40 hover:bg-[#FDF6EE] dark:hover:bg-[#1E2A3A] transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="text-sm font-medium leading-snug"
                style={{ fontFamily: '"Inter Tight", "Inter", sans-serif', color: 'inherit' }}
              >
                {capitalize(room)}
              </span>
              <span
                className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(200,85,43,0.10)', color: '#C8552B' }}
              >
                {count}
              </span>
            </div>
            <div className="mt-1.5 text-xs" style={{ color: 'rgba(26,24,20,0.5)' }}>
              {count === 1 ? '1 item' : `${count} items`}
              {onRoomClick && (
                <span className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"> · tap to filter</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default SaleFloorMap;
