import React, { useState } from 'react';
import useSendMessage from '../hooks/useSendMessage';
import { useToast } from './ToastContext';

interface MessageComposeModalProps {
  open: boolean;
  onClose: () => void;
  organizerId: string;
  saleId?: string | null;
  onSuccess?: (conversationId: string) => void;
}

const MessageComposeModal: React.FC<MessageComposeModalProps> = ({
  open,
  onClose,
  organizerId,
  saleId,
  onSuccess,
}) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const { showToast } = useToast();

  const sendMessageMutation = useSendMessage();

  const isLoading = sendMessageMutation.isPending;
  const isSending = isLoading;

  const handleSend = async () => {
    if (!body.trim()) {
      showToast('Message cannot be empty', 'error');
      return;
    }

    try {
      const result = await sendMessageMutation.mutateAsync({
        organizerId,
        saleId: saleId || undefined,
        body: body.trim(),
      });

      showToast('Message sent successfully!', 'success');
      setSubject('');
      setBody('');
      onClose();

      if (onSuccess) {
        onSuccess(result.conversation.id);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      showToast('Failed to send message. Please try again.', 'error');
    }
  };

  if (!open) {
    return null;
  }

  const charCount = body.length;
  const maxChars = 500;
  const isBodyEmpty = !body.trim();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Send Message
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Send a message to the organizer
          </p>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Subject Field (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subject (Optional)
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Question about furniture"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              disabled={isSending}
            />
          </div>

          {/* Message Body */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Message
              </label>
              <span className={`text-xs ${charCount > maxChars ? 'text-red-500' : 'text-gray-500'}`}>
                {charCount}/{maxChars}
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => {
                if (e.target.value.length <= maxChars) {
                  setBody(e.target.value);
                }
              }}
              placeholder="Type your message here..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white
                resize-none"
              disabled={isSending}
            />
          </div>

          {/* Error State */}
          {sendMessageMutation.isError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-700 dark:text-red-200">
                Failed to send message. Please try again.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300
              bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
              rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isBodyEmpty || isSending}
            className="px-4 py-2 text-sm font-medium text-white
              bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
              rounded-md transition-colors"
          >
            {isSending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageComposeModal;
