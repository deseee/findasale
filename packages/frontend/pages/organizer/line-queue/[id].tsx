/**
 * Line Queue Manager
 *
 * For organizers to manage the physical line/queue at their sale.
 * Shows:
 * - Current capacity and line length
 * - Check-in/check-out buttons
 * - Estimated wait time
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../../lib/api';
import Head from 'next/head';

const LineQueuePage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [queueData, setQueueData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadQueueData();
      // Poll every 10 seconds
      const interval = setInterval(loadQueueData, 10000);
      return () => clearInterval(interval);
    }
  }, [id]);

  const loadQueueData = async () => {
    try {
      const response = await api.get(`/sales/${id}/queue`);
      setQueueData(response.data);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load queue data:', error);
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Line Queue Manager - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 mb-8">Line Queue Manager</h1>

          <div className="card p-6 mb-6">
            <p className="text-warm-600 text-sm">Current Line Length</p>
            <p className="text-4xl font-bold text-warm-900">{queueData?.currentLength || 0}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="text-warm-600 text-sm">Capacity</p>
              <p className="text-2xl font-bold text-warm-900">{queueData?.capacity}</p>
            </div>
            <div className="card p-4">
              <p className="text-warm-600 text-sm">Est. Wait Time</p>
              <p className="text-2xl font-bold text-warm-900">{queueData?.estimatedWaitMinutes}m</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LineQueuePage;
