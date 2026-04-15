import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

const AdminBroadcast = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [audience, setAudience] = useState('ALL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientCount, setRecipientCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(false);

  const audiences = [
    { value: 'ALL', label: 'All Users' },
    { value: 'ORGANIZERS', label: 'Organizers' },
    { value: 'SHOPPERS', label: 'Shoppers' },
    { value: 'PRO_ORGANIZERS', label: 'PRO Tier Organizers' },
    { value: 'TEAMS_ORGANIZERS', label: 'TEAMS Tier Organizers' },
  ];

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchPreview = useCallback(async (aud: string) => {
    try {
      const res = await api.get(`/admin/broadcast/preview?audience=${aud}`);
      setRecipientCount(res.data.count || 0);
    } catch (err) {
      console.error('Error fetching preview:', err);
      setRecipientCount(0);
    }
  }, []);

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchPreview(audience);
    }
  }, [user, audience, fetchPreview]);

  const handleAudienceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAudience = e.target.value;
    setAudience(newAudience);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message body are required');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');

      const res = await api.post('/admin/broadcast', {
        subject: subject.trim(),
        body: body.trim(),
        audience,
      });

      setSuccessMessage(`✓ Sent to ${res.data.recipientCount || recipientCount} users`);
      setSubject('');
      setBody('');
      setConfirmDialog(false);

      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error sending broadcast:', err);
      setError('Failed to send broadcast message');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Broadcast Message</h1>
        <p className="text-warm-600 dark:text-warm-400">Send messages to user segments</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 dark:text-green-300 dark:bg-green-900/20 dark:border-green-800 px-4 py-3 rounded mb-6">
          {successMessage}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        {/* Audience Selector */}
        <div>
          <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-2">
            Audience
          </label>
          <select
            value={audience}
            onChange={handleAudienceChange}
            className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
          >
            {audiences.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-warm-600 dark:text-warm-400">
            This message will go to <strong>{recipientCount}</strong> {recipientCount === 1 ? 'user' : 'users'}
          </p>
        </div>

        {/* Subject Input */}
        <div>
          <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-2">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., New feature announcement"
            className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
          />
        </div>

        {/* Body Textarea */}
        <div>
          <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-2">
            Message Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message here..."
            rows={8}
            className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600 font-mono text-sm"
          />
          <p className="mt-2 text-sm text-warm-600 dark:text-warm-400">
            {body.length} character{body.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Send Button */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => {
              setSubject('');
              setBody('');
              setError('');
            }}
            className="px-6 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700"
          >
            Clear
          </button>
          <button
            onClick={() => setConfirmDialog(true)}
            disabled={loading || !subject.trim() || !body.trim()}
            className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Confirm Broadcast</h3>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              Send this message to <strong>{recipientCount}</strong> {recipientCount === 1 ? 'user' : 'users'}?
            </p>
            <div className="bg-gray-50 dark:bg-gray-900 rounded p-4 mb-6 max-h-48 overflow-y-auto">
              <p className="text-xs text-warm-600 dark:text-warm-400 mb-2">
                <strong>Subject:</strong> {subject}
              </p>
              <p className="text-xs text-warm-600 dark:text-warm-400 whitespace-pre-wrap">
                <strong>Body:</strong> {body}
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog(false)}
                disabled={loading}
                className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={loading}
                className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBroadcast;
