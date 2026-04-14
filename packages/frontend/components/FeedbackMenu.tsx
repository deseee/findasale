import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import api from '@/lib/api';
import { useToast } from '@/components/ToastContext';
import { useTheme } from '@/hooks/useTheme';

interface FeedbackMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * FeedbackMenu — Static feedback form in settings
 * - 5-star rating (required)
 * - Text area for feedback (optional, max 500 chars)
 * - Submit, X button/"Not now"
 * - Success state with checkmark
 * - Portal-based modal, dark mode support
 */
export const FeedbackMenu: React.FC<FeedbackMenuProps> = ({ isOpen, onClose }) => {
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { showToast } = useToast();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (rating === null) {
      showToast('Please select a rating', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/feedback', {
        rating,
        text: text || null,
        page: typeof window !== 'undefined' ? window.location.pathname : null,
      });

      setSubmitted(true);
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setRating(null);
        setText('');
      }, 2000);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      showToast('Failed to submit feedback', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const bgColor = isDark ? 'bg-warm-900' : 'bg-white';
  const textColor = isDark ? 'text-warm-100' : 'text-warm-900';
  const borderColor = isDark ? 'border-warm-800' : 'border-warm-200';
  const inputBgColor = isDark ? 'bg-warm-800' : 'bg-warm-50';

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative z-51 w-full max-w-md mx-4 ${bgColor} rounded-lg shadow-lg p-6 sm:p-8 ${textColor} border ${borderColor}`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-warm-500 hover:text-warm-700 text-xl"
          aria-label="Close feedback form"
        >
          ✕
        </button>

        {submitted ? (
          /* Success state */
          <div className="text-center py-8">
            <div className="text-4xl text-sage-600 mb-3">✓</div>
            <h3 className="text-lg font-semibold mb-2">Thank you!</h3>
            <p className="text-sm text-warm-500">
              We're reading every submission and it directly shapes our roadmap.
            </p>
          </div>
        ) : (
          /* Form state */
          <>
            <h3 className="text-lg font-semibold mb-2">Help us improve</h3>
            <p className="text-sm text-warm-500 mb-6">
              Your feedback directly shapes the product roadmap.
            </p>

            {/* Rating */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-3">
                How would you rate your experience? <span className="text-red-500">*</span>
              </label>
              <div className="flex justify-between">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className={`text-2xl transition ${
                      rating && rating >= star
                        ? 'text-sage-600'
                        : 'text-warm-300 hover:text-warm-400'
                    }`}
                    disabled={isSubmitting}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Text area */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Any thoughts to share?
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                placeholder="Your feedback (optional, max 500 characters)"
                maxLength={500}
                disabled={isSubmitting}
                className={`w-full px-3 py-2 rounded border ${borderColor} ${inputBgColor} text-sm focus:outline-none focus:ring-2 focus:ring-sage-600 resize-none h-24`}
              />
              <p className="text-xs text-warm-500 mt-1">
                {text.length}/500 characters
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2 px-4 rounded font-medium border border-warm-300 text-warm-900 hover:bg-warm-50 transition"
              >
                Not now
              </button>
              <button
                onClick={handleSubmit}
                disabled={rating === null || isSubmitting}
                className={`flex-1 py-2 px-4 rounded font-medium text-white transition ${
                  rating !== null && !isSubmitting
                    ? 'bg-sage-600 hover:bg-sage-700'
                    : 'bg-warm-300 text-warm-500 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? 'Sending...' : 'Send Feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default FeedbackMenu;
