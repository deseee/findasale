import React, { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface OnboardingWizardProps {
  onComplete?: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1 - Profile
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');

  // Step 2 - Stripe
  const [stripeConnected, setStripeConnected] = useState(false);

  // Step 3 - Create Sale
  const [saleCreated, setSaleCreated] = useState(false);

  const handleDismiss = () => {
    // First visit: just close the modal (don't persist dismissal)
    // Only mark complete when the user finishes the wizard
    if (onComplete) onComplete();
  };

  const markOnboardingComplete = async () => {
    try {
      await api.post('/organizers/me/onboarding-complete');
    } catch (error) {
      console.error('Error marking onboarding complete:', error);
    }
    if (onComplete) onComplete();
  };

  const handleNextFromStep1 = async () => {
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
      setCurrentStep(2);
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

  const handleSkipToStep3 = () => {
    setCurrentStep(3);
  };

  const handleSkipOrFinishStep3 = () => {
    // Move to completion step
    setCurrentStep(4);
  };

  const handleCreateSale = async () => {
    // Mark onboarding as complete and navigate to create sale
    // This allows users to come back and complete onboarding later if needed
    await markOnboardingComplete();
    router.push('/organizer/create-sale');
  };

  const handleGoToDashboard = async () => {
    await markOnboardingComplete();
    router.push('/organizer/dashboard');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-warm-200 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-warm-900">Welcome to FindA.Sale!</h1>
            <button
              onClick={handleDismiss}
              className="text-warm-400 hover:text-warm-600 font-semibold text-lg"
              aria-label="Close wizard"
            >
              ✕
            </button>
          </div>

          {/* Progress Dots */}
          <div className="flex gap-2 mt-4 justify-center">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`w-3 h-3 rounded-full transition-all ${
                  step === currentStep
                    ? 'bg-amber-600 w-8'
                    : step < currentStep
                    ? 'bg-green-500'
                    : 'bg-warm-200'
                }`}
                aria-label={`Step ${step}`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Step 1: Profile Setup */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-warm-900 mb-2">Step 1: Your Profile</h2>
                <p className="text-warm-600">
                  Let's set up your business profile so shoppers know who you are.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  Business Name *
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g., Family Estate Sales"
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(616) 555-0100"
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  Bio (Optional)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell shoppers about your estate sales business..."
                  rows={3}
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    if (onComplete) onComplete();
                  }}
                  className="flex-1 px-4 py-2 border border-warm-300 text-warm-700 font-medium rounded-lg hover:bg-warm-50 transition-colors"
                >
                  Remind Me Later
                </button>
                <button
                  onClick={handleNextFromStep1}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Stripe Connect */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-warm-900 mb-2">
                  Step 2: Get Paid
                </h2>
                <p className="text-warm-600">
                  Set up payouts to receive money from your sales. You'll need a Stripe account.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Why Stripe Connect?</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>✓ Fast, secure payouts to your bank account</li>
                  <li>✓ Automatic payments after each sale</li>
                  <li>✓ No additional fees from FindA.Sale</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSkipToStep3}
                  className="flex-1 px-4 py-2 border border-warm-300 text-warm-700 font-medium rounded-lg hover:bg-warm-50 transition-colors"
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

          {/* Step 3: Create First Sale */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-warm-900 mb-2">
                  Step 3: Create Your First Sale
                </h2>
                <p className="text-warm-600">
                  A "sale" is where you list all the items you're selling. You can create multiple sales.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="font-semibold text-amber-900 mb-2">What goes in a sale?</h3>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>✓ Sale date and location</li>
                  <li>✓ Description of the estate/items</li>
                  <li>✓ Photos</li>
                  <li>✓ Individual items (furniture, decor, etc.)</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSkipOrFinishStep3}
                  className="flex-1 px-4 py-2 border border-warm-300 text-warm-700 font-medium rounded-lg hover:bg-warm-50 transition-colors"
                >
                  Skip for Now
                </button>
                <button
                  onClick={handleCreateSale}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors"
                >
                  Create Sale
                </button>
              </div>
            </div>
          )}

          {/* Step 4: All Set */}
          {currentStep === 4 && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="text-6xl">🎉</div>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-warm-900 mb-2">You're All Set!</h2>
                <p className="text-warm-600 max-w-sm mx-auto">
                  Your profile is ready. Start adding items to your first sale and connect with shoppers.
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left">
                <h3 className="font-semibold text-green-900 mb-2">You're ready to:</h3>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>✓ Create and manage sales</li>
                  <li>✓ List items for sale</li>
                  <li>✓ Receive payments from shoppers</li>
                  <li>✓ Track your sales performance</li>
                </ul>
              </div>

              <button
                onClick={handleGoToDashboard}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;