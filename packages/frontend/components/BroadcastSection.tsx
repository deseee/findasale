import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface Broadcast {
  id: string;
  subject: string;
  sentAt: string;
  recipientCount: number;
}

interface BroadcastSectionProps {
  tier?: string;
}

const BroadcastSection: React.FC<BroadcastSectionProps> = ({ tier }) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [isLoadingBroadcasts, setIsLoadingBroadcasts] = useState(false);
  const { showToast } = useToast();

  // Load recent broadcasts on mount
  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const fetchBroadcasts = async () => {
    try {
      setIsLoadingBroadcasts(true);
      const response = await api.get('/organizers/me/broadcasts');
      setBroadcasts(response.data || []);
    } catch (error) {
      console.error('Error fetching broadcasts:', error);
      setBroadcasts([]);
    } finally {
      setIsLoadingBroadcasts(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!subject.trim()) {
      showToast('Subject is required', 'error');
      return;
    }
    if (!message.trim()) {
      showToast('Message is required', 'error');
      return;
    }

    try {
      setIsSending(true);
      const response = await api.post('/organizers/me/broadcast', {
        subject: subject.trim(),
        message: message.trim(),
      });

      showToast(`Message sent to ${response.data.recipientCount} followers`, 'success');
      setSubject('');
      setMessage('');

      // Refresh broadcasts list
      fetchBroadcasts();
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || 'Failed to send broadcast';
      showToast(errorMsg, 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Broadcast Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 100))}
            maxLength={100}
            placeholder="e.g., New items just arrived!"
            className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
          />
          <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">
            {subject.length}/100 characters
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
            maxLength={1000}
            placeholder="Share news, updates, or special offers with your followers..."
            rows={4}
            className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
          />
          <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">
            {message.length}/1000 characters
          </p>
        </div>

        <button
          onClick={handleSendBroadcast}
          disabled={isSending || !subject.trim() || !message.trim()}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          {isSending ? 'Sending...' : 'Send to Followers'}
        </button>
      </div>

      {/* Recent Broadcasts */}
      {broadcasts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-warm-900 dark:text-gray-100 mb-3">
            Recent Broadcasts
          </h3>
          <div className="space-y-2">
            {broadcasts.slice(0, 3).map((broadcast) => (
              <div
                key={broadcast.id}
                className="p-3 border border-warm-200 dark:border-gray-700 rounded-lg bg-warm-50 dark:bg-gray-800"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-warm-900 dark:text-gray-100 truncate">
                      {broadcast.subject}
                    </p>
                    <p className="text-xs text-warm-600 dark:text-gray-400 mt-1">
                      {new Date(broadcast.sentAt).toLocaleDateString()} •{' '}
                      {broadcast.recipientCount} {broadcast.recipientCount === 1 ? 'follower' : 'followers'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {broadcasts.length === 0 && !isLoadingBroadcasts && (
        <p className="text-sm text-warm-600 dark:text-gray-400 italic">
          No broadcasts sent yet. Send your first message to connect with your followers.
        </p>
      )}
    </div>
  );
};

export default BroadcastSection;
