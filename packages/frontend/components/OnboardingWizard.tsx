import React, { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';

interface OnboardingWizardProps {
  onComplete?: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  // Step 1 - Email Verification: derived from the real account record
  // (AuthContext, hydrated from GET /auth/me), not a local stub. OAuth signups
  // (Google/Facebook) are emailVerified=true at account creation (see authController.ts
  // oauthLogin); password signups start false until they click the emailed link
  // (POST /auth/verify-email) or an admin verifies them.
  const isEmailVerified = user?.emailVerified === true;
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState<string | null>(null);

  // Step 2 - Profile
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');

  // Step 3 - Stripe
  const [stripeConnected, setStripeConnected] = useState(false);

  // Step 4 - Create Sale
  const [saleCreated, setSaleCreated] = useState(false);

  const handleDismiss = () => {
    // Record dismissal time in localStorage for reminder card on dashboard
    if (typeof window !== 'undefined') {
      localStorage.setItem('onboarding_dismissed_at', new Date().toISOString());
    }
    // Close the modal
    if (onComplete) onComplete();
  };

  const handleResendVerification = async () => {
    if (!user?.email || resendState === 'sending') return;
    setResendState('sending');
    setResendError(null);
    try {
      // Real endpoint — packages/backend/src/routes/auth.ts POST /auth/resend-verification
      // (rate limited to 3/hour via verifyEmailLimiter, enumeration-safe generic response).
      await api.post('/auth/resend-verification', { email: user.email });
      setResendState('sent');
      showToast('Verification email sent — check your inbox', 'success');
      // Backend still enforces the real rate limit; this just re-enables the button
      // after a short cooldown so it doesn't look permanently stuck.
      setTimeout(() => setResendState('idle'), 30000);
    } catch (error: any) {
      setResendState('error');
      const message = error.response?.data?.message || 'Failed to resend verification email. Please try again.';
      setResendError(message);
      showToast(message, 'error');
    }
  };

  const markOnboardingComplete = async (): Promise<boolean> => {
    try {
      setCompletionError(null);
      await api.post('/organizers/me/onboarding-complete');
      return true;
    } catch (error: any) {
      console.error('Error marking onboarding complete:', error);
      setCompletionError('Something went wrong. Please try again');
      return false;
    }
  };

  const handleNextFromStep2 = async () => {
    if (!businessName.trim()) {
      showToast('Business name is required', 'error');
      return;
    }

    setIsLoading(true);
    try {
      // Update the organizer profile
      const response = await api.patch('/organizers/me', {
        businessName: businessName.trim(),
        phone: phone.trim(),
        bio: bio.trim() || undefined,
      });
      void response; // Profile update succeeded
      showToast('Profile saved successfully', 'success');
      setCurrentStep(3);
    } catch (error: any) {
      console.error('Profile update error:', error);
      showToast(error.response?.data?.message || 'Failed to save profile', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectStripe = async () => {
    try {
      const response = await api.post('/stripe/create-connect-account');
      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || 'Failed to initiate Stripe Connect',
        'error'
      );
    }
  };

  const handleSkipToStep4 = () => {
    setCurrentStep(4);
  };

  const handleSkipOrFinishStep4 = () => {
    // Move to completion step (Step 5)
    setCurrentStep(5);
  };

  const handleCreateSale = async () => {
    // Mark onboarding as complete and navigate to create sale
    // This allows users to come back and complete onboarding later if needed
    setIsLoading(true);
    const success = await markOnboardingComplete();
    setIsLoading(false);
    if (success) {
      router.push('/organizer/create-sale');
    }
  };

  const handleGoToDashboard = async () => {
    setIsLoading(true);
    const success = await markOnboardingComplete();
    setIsLoading(false);
    if (success) {
      router.push('/organizer/dashboard');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 p-6 z-10">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100">Welcome to FindA.Sale!</h1>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDismiss();
              }}
              className="text-warm-400 dark:text-gray-400 hover:text-warm-600 dark:hover:text-gray-300 font-semibold text-lg cursor-pointer pointer-events-auto"
              aria-label="Close wizard"
              type="button"
            >
              ✕
            </button>
          </div>

          {/* Step counter */}
          <div className="text-sm text-warm-600 dark:text-warm-400 mb-3 font-medium">
            Step {currentStep} of 5
          </div>

          {/* Progress Dots */}
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5].map((step) => (
              <div
                key={step}
                className={`h-2 rounded-full transition-all ${
                  step === currentStep
                    ? 'bg-amber-600 w-8'
                    : step < currentStep
                    ? 'bg-green-500 w-2'
                    : 'bg-warm-200 dark:bg-gray-700 w-2'
                }`}
                aria-label={`Step ${step}`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Step 1: Email Verification */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">Step 1: Verify Your Email</h2>
                <p className="text-warm-600 dark:text-warm-400">
                  We'll send you sale alerts and payment confirmations.
                </p>
              </div>

              {isEmailVerified ? (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
                  <span className="text-green-500 text-lg mt-0.5" aria-hidden="true">✓</span>
                  <div>
                    <p className="text-sm font-medium text-green-900 dark:text-green-200">Your email is verified</p>
                    <p className="text-sm text-green-800 dark:text-green-300 mt-0.5">
                      {user?.email ? (
                        <>
                          <strong>{user.email}</strong> is confirmed.
                        </>
                      ) : (
                        'Your email address is confirmed.'
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-200">
                    {user?.email ? (
                      <>
                        We sent a verification link to <strong>{user.email}</strong>. Check your inbox (and spam
                        folder) and click the link to verify.
                      </>
                    ) : (
                      'Check your email for a verification link. This helps us send you sale alerts and payment confirmations to the right address.'
                    )}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                    You can keep setting up your account — you'll just need to verify before publishing a sale.
                  </p>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendState === 'sending' || resendState === 'sent' || !user?.email}
                    className="mt-3 text-sm font-medium text-blue-700 dark:text-blue-300 underline hover:text-blue-900 dark:hover:text-blue-100 disabled:opacity-50 disabled:no-underline"
                  >
                    {resendState === 'sending'
                      ? 'Sending...'
                      : resendState === 'sent'
                      ? 'Verification email sent ✓'
                      : 'Resend verification email'}
                  </button>
                  {resendState === 'error' && resendError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">{resendError}</p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Skip for Now
                </button>
                <button
                  onClick={() => setCurrentStep(2)}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Profile Setup */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">Step 2: Your Business Profile</h2>
                <p className="text-warm-600 dark:text-warm-400">
                  Let's set up your business profile so shoppers know who you are.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Business Name *
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g., My Business"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                 aria-label="e.g., My Business" />
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(616) 555-0100"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                 aria-label="(616) 555-0100" />
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Bio (Optional)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell shoppers about your business..."
                  rows={3}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleDismiss}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Remind Me Later
                </button>
                <button
                  onClick={handleNextFromStep2}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Stripe Connect */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  Step 3: Get Paid
                </h2>
                <p className="text-warm-600 dark:text-warm-400">
                  Set up payouts to receive money from your sales. You'll need a Stripe account.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Why Stripe Connect?</h3>
                <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  <li>✓ Fast, secure payouts to your bank account</li>
                  <li>✓ Automatic payments after each sale</li>
                  <li>✓ No additional fees from FindA.Sale</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSkipToStep4}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Skip for Now
                </button>
                <button
                  onClick={handleConnectStripe}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
                >
                  Connect Stripe
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Create First Sale */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  Step 4: Create Your First Sale
                </h2>
                <p className="text-warm-600 dark:text-warm-400">
                  A "sale" is where you list all the items you're selling. You can create multiple sales.
                </p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <h3 className="font-semibold text-amber-900 dark:text-amber-200 mb-2">What goes in a sale?</h3>
                <ul className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
                  <li>✓ Sale date and location</li>
                  <li>✓ Description of your items</li>
                  <li>✓ Photos</li>
                  <li>✓ Individual items (furniture, decor, etc.)</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSkipOrFinishStep4}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Skip for Now
                </button>
                <button
                  onClick={handleCreateSale}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Creating...' : 'Create Sale'}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Success Screen */}
          {currentStep === 5 && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="text-6xl">🎉</div>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">You're All Set!</h2>
                <p className="text-warm-600 dark:text-warm-400 max-w-sm mx-auto">
                  Your organizer account is ready. You can now create sales and start listing items.
                </p>
              </div>

              {completionError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-left">
                  <p className="text-sm text-red-700 dark:text-red-300 font-medium">{completionError}</p>
                </div>
              )}

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-left">
                <h3 className="font-semibold text-green-900 dark:text-green-200 mb-2">Completion Status:</h3>
                <ul className="text-sm text-green-800 dark:text-green-300 space-y-1">
                  <li>{isEmailVerified ? '✓' : '○'} Email verified{!isEmailVerified ? ' (pending — check your inbox)' : ''}</li>
                  <li>✓ Business profile created</li>
                  <li>✓ Payment connected (Stripe)</li>
                  <li>{saleCreated ? '✓' : '○'} First sale created</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleGoToDashboard}
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Completing...' : 'Go to Dashboard'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;

