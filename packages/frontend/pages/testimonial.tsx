import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

/**
 * Testimonial capture page — Outward Email Automation #2a.
 * Linked from the post-sale recap + testimonial-ask emails. Authenticated
 * organizers leave a short testimonial (optional star rating). Submissions
 * land PENDING for admin moderation.
 */
const TestimonialPage = () => {
  const router = useRouter();
  const { showToast } = useToast();
  const saleId = typeof router.query.saleId === 'string' ? router.query.saleId : undefined;

  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 3) {
      showToast('Please share a few words.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post('/testimonials', {
        body: body.trim(),
        rating: rating > 0 ? rating : undefined,
        saleId,
      });
      setSubmitted(true);
      showToast('Thank you — your testimonial has been received.', 'success');
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        showToast('Please sign in to share your testimonial.', 'error');
        router.push(`/login?redirect=${encodeURIComponent(router.asPath)}`);
      } else {
        showToast('Could not submit your testimonial. Please try again.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Share a Testimonial | FindA.Sale</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-4">Share your experience</h1>
          <p className="text-warm-600 dark:text-warm-400 mb-8 text-lg">
            How was running your sale on FindA.Sale? A sentence or two helps other organizers decide to give us a try.
          </p>

          {submitted ? (
            <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-8 text-center">
              <div className="text-4xl mb-3">🙌</div>
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">Thank you!</h2>
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                Your testimonial has been received. We review submissions before they appear publicly.
              </p>
              <button
                onClick={() => router.push('/organizer/dashboard')}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Back to dashboard
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                    Your rating (optional)
                  </label>
                  <div className="flex gap-1" role="radiogroup" aria-label="Star rating">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        aria-label={`${star} star${star > 1 ? 's' : ''}`}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHover(star)}
                        onMouseLeave={() => setHover(0)}
                        className="text-3xl leading-none focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
                      >
                        <span className={(hover || rating) >= star ? 'text-amber-500' : 'text-warm-300 dark:text-gray-600'}>★</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="body" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                    Your testimonial
                  </label>
                  <textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                    rows={6}
                    maxLength={2000}
                    placeholder="What did you like about using FindA.Sale for your sale?"
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit testimonial'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default TestimonialPage;
