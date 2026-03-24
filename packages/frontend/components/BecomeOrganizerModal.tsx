import React, { useState } from 'react';
import { useOrganizerSetup } from '../hooks/useOrganizerSetup';

export interface BecomeOrganizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const BecomeOrganizerModal: React.FC<BecomeOrganizerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { setupOrganizer, loading, error, setError } = useOrganizerSetup();
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    // Reset form
    setBusinessName('');
    setPhone('');
    setAddress('');
    setAgreedToTerms(false);
    setFormError(null);
    setError(null);
    onClose();
  };

  const validateForm = (): boolean => {
    setFormError(null);

    if (!businessName.trim()) {
      setFormError('Business name is required.');
      return false;
    }

    if (businessName.trim().length > 100) {
      setFormError('Business name must be 100 characters or less.');
      return false;
    }

    if (phone.trim()) {
      // Optional phone validation: basic US format
      const phoneRegex = /^\d{3}-?\d{3}-?\d{4}$/;
      if (!phoneRegex.test(phone.replace(/\D/g, ''))) {
        setFormError('Phone must be in format XXX-XXX-XXXX or XXXXXXXXXX.');
        return false;
      }
    }

    if (!agreedToTerms) {
      setFormError('You must agree to the Organizer Terms of Service.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    await setupOrganizer({
      businessName: businessName.trim(),
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
    });

    if (onSuccess) {
      onSuccess();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-warm-200 dark:border-gray-700">
          <h2
            id="modal-title"
            className="text-xl font-bold text-warm-900 dark:text-warm-100"
          >
            Become an Organizer
          </h2>
          <p className="text-sm text-warm-600 dark:text-warm-300 mt-1">
            You'll unlock the ability to list items for sale on FindA.Sale. Complete this in
            seconds.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Error messages */}
          {(formError || error) && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-200">
              {formError || error}
            </div>
          )}

          {/* Business Name Field */}
          <div>
            <label htmlFor="businessName" className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              id="businessName"
              type="text"
              placeholder="Your business name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
            />
          </div>

          {/* Phone Field */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
              Phone (Optional)
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="123-456-7890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
            />
          </div>

          {/* Address Field */}
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
              Address (Optional)
            </label>
            <input
              id="address"
              type="text"
              placeholder="Your business address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
            />
          </div>

          {/* Terms Checkbox */}
          <div className="flex items-start">
            <input
              id="termsCheckbox"
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              disabled={loading}
              className="mt-1 h-4 w-4 text-amber-600 border-warm-300 rounded focus:ring-amber-500 cursor-pointer disabled:opacity-50"
            />
            <label htmlFor="termsCheckbox" className="ml-2 text-sm text-warm-600 dark:text-warm-300">
              I agree to the{' '}
              <a
                href="/terms?section=organizer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-600 dark:text-amber-400 underline hover:text-amber-700 dark:hover:text-amber-300"
              >
                Organizer Terms of Service
              </a>
              <span className="text-red-500">*</span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!agreedToTerms || loading}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 dark:bg-amber-600 dark:hover:bg-amber-700 dark:disabled:bg-amber-500 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Setting up...' : 'Complete Setup'}
            </button>
          </div>

          {/* Retry for errors */}
          {error && (
            <button
              type="submit"
              className="w-full px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded"
            >
              Retry
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default BecomeOrganizerModal;
