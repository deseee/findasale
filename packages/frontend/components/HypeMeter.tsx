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

const getInitials = (name?: string): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const getColorForInitials = (name?: string): string => {
  if (!name) return 'bg-gray-300';
  const colors = [
    'bg-blue-400',
    'bg-red-400',
    'bg-green-400',
    'bg-yellow-400',
    'bg-purple-400',
    'bg-pink-400',
    'bg-indigo-400',
    'bg-cyan-400',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return colors[Math.abs(hash) % colors.length];
};

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

  // Ping the backend every 30s to keep viewer session alive
  useEffect(() => {
    if (!viewerIdRef.current || !saleId) return;

    const pingInterval = setInterval(() => {
      api
        .post(`/viewers/${saleId}/ping`, {
          viewerId: viewerIdRef.current,
        })
        .catch((err) => {
          console.debug('[HypeMeter] Ping failed (non-fatal):', err.message);
        });
    }, 30000); // 30 seconds

    return () => clearInterval(pingInterval);
  }, [saleId]);

  // Poll viewer count every 15s
  useEffect(() => {
    if (!saleId) return;

    const pollInterval = setInterval(() => {
      api
        .get(`/viewers/${saleId}`)
        .then((res) => {
          const newCount = res.data.count || 0;
          setViewerCount(newCount);
          setIsVisible(newCount > 0);

          // Process viewer data to extract initials and colors
          const viewerList = res.data.viewers || [];
          const viewerDataList: ViewerData[] = viewerList.map((viewer: any) => ({
            id: viewer.id,
            name: viewer.name,
            initials: getInitials(viewer.name),
            color: getColorForInitials(viewer.name),
          }));
          setViewers(viewerDataList);
        })
        .catch((err) => {
          console.debug('[HypeMeter] Poll failed (non-fatal):', err.message);
        });
    }, 15000); // 15 seconds

    return () => clearInterval(pollInterval);
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
