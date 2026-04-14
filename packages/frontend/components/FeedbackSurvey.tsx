import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import api from '@/lib/api';
import { useFeedbackContext } from '@/context/FeedbackContext';
import { useToast } from '@/components/ToastContext';
import { useTheme } from '@/hooks/useTheme';

/**
 * FeedbackSurvey — Portal modal for event-triggered micro-surveys
 * - Renders to document.body (portal)
 * - 3-button scale input
 * - "Don't ask again" checkbox
 * - 10s auto-dismiss on idle
 * - Focus trap, ESC to close
 * - Dark mode support
 */
export const FeedbackSurvey: React.FC = () => {
  const { isSurveyOpen, currentSurvey, answer, dontAskAgain, isSubmitting, closeSurvey, setAnswer, setDontAskAgain, setIsSubmitting, setCooldownEndTime } = useFeedbackContext();
  const { showToast } = useToast();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [autoDismissTimer, setAutoDismissTimer] = useState<NodeJS.Timeout | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const lastButtonRef = useRef<HTMLButtonElement>(null);

  // Handle auto-dismiss on inactivity (10 seconds)
  useEffect(() => {
    if (!isSurveyOpen) return;

    const startAutoDismissTimer = () => {
      const timer = setTimeout(() => {
        closeSurvey();
      }, 10000);
      setAutoDismissTimer(timer);
    };

    const resetAutoDismissTimer = () => {
      if (autoDismissTimer) clearTimeout(autoDismissTimer);
      startAutoDismissTimer();
    };

    startAutoDismissTimer();

    const handleInteraction = () => {
      resetAutoDismissTimer();
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      if (autoDismissTimer) clearTimeout(autoDismissTimer);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [isSurveyOpen, autoDismissTimer, closeSurvey]);

  // Focus trap
  useEffect(() => {
    if (!isSurveyOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSurvey();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSurveyOpen, closeSurvey]);

  // Handle submit
  const handleSubmit = async () => {
    if (!answer || !currentSurvey) return;

    setIsSubmitting(true);
    try {
      await api.post('/feedback', {
        rating: currentSurvey.options.indexOf(answer) + 1,
        text: null,
        page: typeof window !== 'undefined' ? window.location.pathname : null,
        surveyType: currentSurvey.id,
        dontAskAgain,
      });

      showToast("Thanks! We're reading every submission", 'success');

      // If dontAskAgain, create suppression
      if (dontAskAgain) {
        try {
          await api.post('/feedback/suppression', {
            surveyType: currentSurvey.id,
          });
        } catch (err) {
          console.error('Failed to create suppression:', err);
        }
      }

      // Set cooldown
      const cooldownMs = 30 * 60 * 1000;
      setCooldownEndTime(Date.now() + cooldownMs);

      closeSurvey();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      showToast('Failed to submit feedback', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isSurveyOpen || !currentSurvey) return null;

  const bgColor = isDark ? 'bg-warm-900' : 'bg-white';
  const textColor = isDark ? 'text-warm-100' : 'text-warm-900';
  const borderColor = isDark ? 'border-warm-800' : 'border-warm-200';
  const buttonColor = 'bg-sage-600 hover:bg-sage-700 text-white';
  const selectedButtonColor = 'bg-sage-700 text-white';

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-40"
        onClick={closeSurvey}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className={`relative z-51 w-full sm:max-w-md mx-4 ${bgColor} rounded-lg shadow-lg p-6 sm:p-8 ${textColor} border ${borderColor}`}
      >
        {/* Close button */}
        <button
          onClick={closeSurvey}
          className="absolute top-4 right-4 text-warm-500 hover:text-warm-700 text-xl"
          aria-label="Close survey"
          ref={firstButtonRef}
        >
          ✕
        </button>

        {/* Title */}
        <h3 className="text-lg font-semibold mb-2">
          {currentSurvey.title}
        </h3>

        {/* Question */}
        <p className="text-sm mb-4">
          {currentSurvey.question}
        </p>

        {/* Options (3-button scale) */}
        <div className="flex gap-2 mb-4">
          {currentSurvey.options.map((option) => (
            <button
              key={option}
              onClick={() => setAnswer(option)}
              className={`flex-1 py-2 px-3 text-sm rounded font-medium transition ${
                answer === option ? selectedButtonColor : `${buttonColor} border border-sage-600`
              }`}
              disabled={isSubmitting}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Subtext */}
        <p className="text-xs text-warm-500 mb-4">
          {currentSurvey.subtext}
        </p>

        {/* Don't ask again checkbox */}
        <label className="flex items-center gap-2 mb-6">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            disabled={isSubmitting}
            className="w-4 h-4 rounded border-warm-300"
          />
          <span className="text-sm">Don't ask me about this again</span>
        </label>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!answer || isSubmitting}
          className={`w-full py-2 px-4 rounded font-medium transition ${
            answer && !isSubmitting
              ? `${buttonColor}`
              : 'bg-warm-300 text-warm-500 cursor-not-allowed'
          }`}
          ref={lastButtonRef}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default FeedbackSurvey;
