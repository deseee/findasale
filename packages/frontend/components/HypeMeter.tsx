import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface HypeMeterProps {
  saleId: string;
}

interface ViewerData {
  id: string;
  name?: string;
  initials: string;
  color: string;
}

const HypeMeter: React.FC<HypeMeterProps> = ({ saleId }) => {
  const [viewerCount, setViewerCount] = useState(0);
  const [viewers, setViewers] = useState<ViewerData[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const viewerIdRef = useRef<string>('');

  // Generate a unique viewerId on mount (anonymous session)
  useEffect(() => {
    if (!viewerIdRef.current) {
      viewerIdRef.current = crypto.randomUUID();
    }
  }, []);

  // Ping the backend every 30s to keep viewer session alive. The ping
  // response now also carries the current viewer count (2026-07-06: Vercel
  // Edge Request hygiene pass), so this single call replaces what used to be
  // two separate calls (a 30s ping + a 15s count poll) — same live-viewer
  // freshness, one third the request volume. NOTE: the backend ping/count
  // endpoints have never returned a `viewers` list of names for the avatar
  // stack below (only `count`), so `viewers` state stays empty exactly as it
  // did before this change — pre-existing gap, not something this pass
  // introduced or fixed. See dev handoff notes.
  useEffect(() => {
    if (!viewerIdRef.current || !saleId) return;

    const doPing = () => {
      api
        .post(`/viewers/${saleId}/ping`, {
          viewerId: viewerIdRef.current,
        })
        .then((res) => {
          const newCount = res.data.count || 0;
          setViewerCount(newCount);
          setIsVisible(newCount > 0);
        })
        .catch((err) => {
          console.debug('[HypeMeter] Ping failed (non-fatal):', err.message);
        });
    };

    doPing(); // Immediate ping on mount so the count appears without a 30s wait

    const pingInterval = setInterval(doPing, 30000); // 30 seconds

    return () => clearInterval(pingInterval);
  }, [saleId]);

  // Remove viewer on unmount
  useEffect(() => {
    return () => {
      if (!viewerIdRef.current || !saleId) return;
      api
        .delete(`/viewers/${saleId}/${viewerIdRef.current}`)
        .catch((err) => {
          console.debug('[HypeMeter] Cleanup failed (non-fatal):', err.message);
        });
    };
  }, [saleId]);

  if (!isVisible || viewerCount < 1) {
    return null;
  }

  // Show up to 5 viewer avatars, stack overflow as +N
  const displayedViewers = viewers.slice(0, 5);
  const hiddenViewerCount = Math.max(0, viewers.length - 5);

  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
      <span className="text-base">👀</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
          {viewerCount} {viewerCount === 1 ? 'person' : 'people'} viewing now
        </p>
      </div>
      {/* Viewer Avatar Stack */}
      <div className="flex items-center -space-x-2">
        {displayedViewers.map((viewer) => (
          <div
            key={viewer.id}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white dark:border-blue-900 ${viewer.color}`}
            title={viewer.name || 'Anonymous viewer'}
          >
            {viewer.initials}
          </div>
        ))}
        {hiddenViewerCount > 0 && (
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gray-400 border-2 border-white dark:border-blue-900">
            +{hiddenViewerCount}
          </div>
        )}
      </div>
    </div>
  );
};

export default HypeMeter;
