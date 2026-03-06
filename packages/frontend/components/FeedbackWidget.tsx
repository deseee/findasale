import React, { useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

const FeedbackWidget = () => {
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      showToast('Please select a rating', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const currentPage = typeof window !== 'undefined' ? window.location.pathname : '';

      await api.post('/feedback', {
        rating,
        text: text || null,
        page: currentPage,
      });

      setIsSuccess(true);
      setRating(0);
      setText('');

      // Auto-close after 2 seconds
      setTimeout(() => {
        setIsOpen(false);
        setIsSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      showToast('Failed to submit feedback. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading && !isSuccess) {
      setIsOpen(false);
      setRating(0);
      setText('');
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 bg-amber-600 hover:bg-amber-700 text-white rounded-full p-3 shadow-lg transition-all active:scale-95"
        aria-label="Send feedback"
        title="Send us feedback"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
          />
        </svg>
      </button>

      {/* Modal backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={handleClose}
        >
          {/* Modal panel */}
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full md:max-w-md p-6 md:p-8 animate-slide-up md:animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            {isSuccess ? (
              <div className="text-center py-8">
                <div className="mb-4">
                  <svg
                    className="w-16 h-16 mx-auto text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-warm-900 mb-1">Thank you!</h3>
                <p className="text-warm-600 text-sm">Your feedback helps us improve</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-warm-900">Send us feedback</h2>
                  <button
                    onClick={handleClose}
                    className="text-warm-500 hover:text-warm-700 p-1"
                    aria-label="Close"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <p className="text-warm-600 text-sm mb-6">
                  Help us improve by sharing your experience
                </p>

                {/* Star rating */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-warm-900 mb-3">
                    How would you rate your experience?
                  </label>
                  <div className="flex gap-2 justify-center">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 transition-transform hover:scale-125 active:scale-100"
                        aria-label={`Rate ${star} stars`}
                      >
                        <svg
                          className={`w-8 h-8 transition-colors ${
                            (hoverRating || rating) >= star
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-warm-300'
                          }`}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text area */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-warm-900 mb-2">
                    Any additional comments? (optional)
                  </label>
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Tell us what you think..."
                    className="w-full px-3 py-2 border border-warm-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent resize-none"
                    rows={4}
                  />
                </div>

                {/* Submit button */}
                <button
                  onClick={handleSubmit}
                  disabled={isLoading || rating === 0}
                  className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-warm-300 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  {isLoading ? 'Sending...' : 'Send Feedback'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default FeedbackWidget;
