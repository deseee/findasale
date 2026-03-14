import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface HypeMeterProps {
  saleId: string;
}

const HypeMeter: React.FC<HypeMeterProps> = ({ saleId }) => {
  const [viewerCount, setViewerCount] = useState(0);
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

  if (!isVisible || viewerCount < 2) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-sm text-warm-600">
      <span className="text-base">👀</span>
      <span>
        {viewerCount} {viewerCount === 1 ? 'person' : 'people'} viewing now
      </span>
    </div>
  );
};

export default HypeMeter;
