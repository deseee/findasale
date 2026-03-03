import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';

interface Subscriber {
  userId: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
}

const SendUpdatePage = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{success: boolean; message: string} | null>(null);

  // Fetch subscribers for this sale
  const { data: subscribers = [] } = useQuery({
    queryKey: ['subscribers', saleId],
    queryFn: async () => {
      // In a real implementation, you would fetch subscribers from the backend
      // For now, we'll just return an empty array
      return [] as Subscriber[];
    },
    enabled: !!saleId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult(null);

    try {
      const response = await api.post('/notifications/send-sms', {
        saleId,
        message
      });
      
      setResult({
        success: true,
        message: response.data.message
      });
      setMessage('');
    } catch (error: any) {
      setResult({
        success: false,
        message: error.response?.data?.message || 'Failed to send update'
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Send Update - FindA.Sale</title>
        <meta name="description" content="Send SMS update to sale subscribers" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Send SMS Update</h1>
          <Link 
            href={`/sales/${saleId}`} 
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
          >
            Back to Sale
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 max-w-3xl mx-auto">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Subscribers</h2>
            <p className="text-gray-600">
              {subscribers.length} people subscribed to receive updates for this sale.
            </p>
            {subscribers.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center text-sm text-gray-500">
                  <span className="mr-4">
                    📱 {subscribers.filter(s => s.phone).length} with phone numbers
                  </span>
                  <span>
                    ✉️ {subscribers.filter(s => s.email).length} with emails
                  </span>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                Message
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                required
                maxLength={1600} // Twilio limit
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                placeholder="Enter your update message here..."
              />
              <div className="flex justify-between mt-1">
                <span className="text-sm text-gray-500">
                  {message.length}/1600 characters
                </span>
                <span className="text-sm text-gray-500">
                  Standard SMS rates may apply to recipients
                </span>
              </div>
            </div>

            {result && (
              <div className={`rounded-md p-4 ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                  {result.message}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Update'}
              </button>
            </div>
          </form>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">Tips for effective updates:</h3>
            <ul className="list-disc pl-5 text-blue-700 text-sm space-y-1">
              <li>Include important information like schedule changes or special items</li>
              <li>Keep messages concise and clear</li>
              <li>Avoid sending too many updates (once per day maximum)</li>
              <li>Mention any last-minute changes immediately</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SendUpdatePage;
