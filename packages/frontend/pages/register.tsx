import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

const RegisterPage = () => {
  const router = useRouter();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    dateOfBirth: '',
    role: 'USER',
    businessName: '',
    phone: '',
    businessAddress: '',
    referralCode: '',
    affiliateReferralCode: '',
    inviteCode: '',
    country: 'US',
    province: '',
  });
  const [ageError, setAgeError] = useState('');
  const [organizerEmailConsent, setOrganizerEmailConsent] = useState(false);
  const [shopperEmailConsent, setShopperEmailConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [claimOrganizerId, setClaimOrganizerId] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Pre-fill referral codes and claim params from URL
  // ?ref= for shopper-to-shopper referral rewards (existing system)
  // ?aff= for organizer-to-organizer affiliate program (new system)
  // ?claim= for organizer profile claim flow — Feature #443
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const aff = params.get('aff');
    const invite = params.get('invite');
    const claim = params.get('claim');
    if (ref) setFormData(prev => ({ ...prev, referralCode: ref }));
    if (aff) setFormData(prev => ({ ...prev, affiliateReferralCode: aff }));
    // Invite codes are for organizer beta access — pre-select ORGANIZER role
    if (invite) setFormData(prev => ({ ...prev, inviteCode: invite.toUpperCase(), role: 'ORGANIZER' }));
    // Claim flow: arriving from organizer profile "Claim This Profile" button
    if (claim) {
      sessionStorage.setItem('claimOrganizerId', claim);
      setClaimOrganizerId(claim);
      setFormData(prev => ({ ...prev, role: 'ORGANIZER' }));
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });

    // P0-L1: Validate age on DOB change
    if (name === 'dateOfBirth' && value) {
      const dob = new Date(value);
      const today = new Date();
      const age = (today.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

      if (age < 18) {
        setAgeError('You must be 18 or older to use FindA.Sale.');
      } else {
        setAgeError('');
      }
    }
  };

  // Platform Safety #118: Generate device fingerprint for fraud detection
  const generateDeviceFingerprint = async (): Promise<string> => {
    try {
      // Collect browser signals
      const signals = [
        navigator.userAgent,
        screen.width + 'x' + screen.height,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.language,
      ];

      // Optional: canvas fingerprint (requires canvas API)
      let canvasSignal = '';
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = '12px Arial';
          ctx.fillText('fingerprint', 2, 2);
          canvasSignal = canvas.toDataURL();
        }
      } catch (e) {
        // Canvas not available or blocked — no-op
      }

      if (canvasSignal) signals.push(canvasSignal);

      // Hash to string (base64 encode the concatenated signals)
      const fingerprintStr = signals.join('|');
      return btoa(fingerprintStr);
    } catch (error) {
      console.error('[fingerprint] Error generating device fingerprint:', error);
      return ''; // Return empty string if fingerprinting fails — don't block registration
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // P0-L1: Validate age before submission
    if (!formData.dateOfBirth) {
      setError('Date of birth is required.');
      setLoading(false);
      return;
    }
    if (ageError) {
      setError(ageError);
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    try {
      // Generate device fingerprint
      const deviceFingerprint = await generateDeviceFingerprint();

      const isQuebecBlocked = formData.country === 'CA' && formData.province === 'QC';
      if (isQuebecBlocked) {
        setError("Quebec support is coming soon — we're actively working on provincial compliance.");
        setLoading(false);
        return;
      }

      const payload: any = {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        dateOfBirth: formData.dateOfBirth, // P0-L1: COPPA compliance
        role: formData.role,
        country: formData.country || 'US',
        province: formData.province || undefined,
        referralCode: formData.referralCode || undefined,
        affiliateReferralCode: formData.affiliateReferralCode || undefined,
        inviteCode: formData.inviteCode || undefined,
        deviceFingerprint, // Platform Safety #118: Include fingerprint
      };
      if (formData.role === 'ORGANIZER') {
        payload.businessName = formData.businessName;
        payload.phone = formData.phone;
        payload.businessAddress = formData.businessAddress;
        payload.consentOrganizer = organizerEmailConsent;
      }
      if (formData.role === 'USER') {
        payload.consentShopper = shopperEmailConsent;
      }
      const response = await api.post('/auth/register', payload);

      // Store token in context and localStorage
      login(response.data.token);

      // GA4 #470: organizer_registered conversion event
      if (typeof window !== 'undefined' && window.gtag && payload.role === 'ORGANIZER') {
        window.gtag('event', 'organizer_registered', { role: 'organizer' });
      }

      // Check for inviteToken in query params
      const params = new URLSearchParams(window.location.search);
      const inviteToken = params.get('inviteToken');

      if (inviteToken && response.data.user.roles?.includes('ORGANIZER')) {
        // Accept the magic link invite
        try {
          await api.post(`/workspace/invite/accept/${inviteToken}`);
          router.push('/organizer/dashboard?welcomed=workspace');
        } catch (inviteErr: any) {
          console.error('[register] Failed to accept workspace invite:', inviteErr);
          // Still redirect to dashboard even if invite acceptance fails
          router.push('/organizer/dashboard?welcomed=workspace');
        }
      } else if (response.data.user.roles?.includes('ORGANIZER')) {
        // Feature #443: claim flow — fire claim endpoint if arrived from organizer profile page
        const storedClaimId = sessionStorage.getItem('claimOrganizerId');
        if (storedClaimId) {
          sessionStorage.removeItem('claimOrganizerId');
          try {
            await api.post(`/organizers/${storedClaimId}/claim-oauth`);
          } catch (_) { /* non-fatal — user is logged in, claim failed silently */ }
          router.push('/organizer/dashboard?claimed=true');
          return;
        }
        router.push('/organizer/dashboard');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'An error occurred during registration. Please try again.';
      setError(msg);
      showToast(msg, 'error');
      // Scroll the error into view so users don't miss it after submitting from the bottom of the form
      setTimeout(() => {
        errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
      <Head>
        <title>Register - FindA.Sale</title>
        <meta name="description" content="Create a FindA.Sale account" />
      </Head>

      <div className="max-w-md w-full mx-auto space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-warm-900 dark:text-warm-100">
            {claimOrganizerId ? 'Claim your storefront' : 'Create your account'}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {claimOrganizerId && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-center">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                You're claiming your FindA.Sale storefront.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                Create a free account — once registered, your profile is immediately linked and you're in control.
              </p>
            </div>
          )}
          {formData.affiliateReferralCode && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 11-2 0 1 1 0 012 0zm-3 4a1 1 0 100-2 1 1 0 000 2zm3 1a1 1 0 11-2 0 1 1 0 012 0zm3-1a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <div className="text-sm text-amber-700 dark:text-amber-200">
                  An organizer referred you to FindA.Sale. If you join as an organizer and complete a paid sale, they earn a thank-you commission.
                </div>
              </div>
            </div>
          )}
          {error && (
            <div id="register-error" role="alert" ref={errorRef} className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
              <div className="text-sm text-red-700 dark:text-red-300">
                {error}
                {error.includes('already exists') && (
                  <span>
                    {' '}
                    <Link href="/login" className="font-medium underline hover:text-red-900 dark:hover:text-red-100">
                      Sign in instead?
                    </Link>
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="name" className="sr-only">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={formData.name}
                onChange={handleChange}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 rounded-t-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                placeholder="Full Name"
              aria-label="Full Name" />
            </div>
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                placeholder="Email address"
              aria-label="Email address"
                aria-invalid={!!error}
                aria-describedby={error ? "register-error" : undefined}
              />
            </div>
            <div>
              <label htmlFor="dateOfBirth" className="block text-xs text-warm-600 dark:text-warm-400 mb-1 px-1">
                Date of Birth <span className="text-warm-400 dark:text-warm-500">(required to verify you&apos;re 13 or older)</span>
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                required
                value={formData.dateOfBirth}
                onChange={handleChange}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                aria-invalid={!!ageError}
                aria-describedby={ageError ? "age-error" : undefined}
                aria-label="Date of Birth" />
              {ageError && (
                <p id="age-error" role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{ageError}</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={formData.password}
                onChange={handleChange}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                placeholder="Password (min 8 characters)"
              aria-label="Password (min 8 characters)" />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                placeholder="Confirm password"
              aria-label="Confirm password" />
            </div>
            <div>
              <label htmlFor="role" className="sr-only">
                Account Type
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
              >
                <option value="USER">Shopper</option>
                <option value="ORGANIZER">Sale Organizer</option>
              </select>
            </div>
            <div>
              <label htmlFor="country" className="sr-only">Country</label>
              <select
                id="country"
                name="country"
                value={formData.country}
                onChange={handleChange}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                aria-label="Country"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </div>
            {formData.country === 'CA' && (
              <div>
                <label htmlFor="province" className="sr-only">Province</label>
                <select
                  id="province"
                  name="province"
                  value={formData.province}
                  onChange={handleChange}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 rounded-b-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                  aria-label="Province"
                >
                  <option value="">Select province...</option>
                  <option value="AB">Alberta</option>
                  <option value="BC">British Columbia</option>
                  <option value="MB">Manitoba</option>
                  <option value="NB">New Brunswick</option>
                  <option value="NL">Newfoundland and Labrador</option>
                  <option value="NS">Nova Scotia</option>
                  <option value="NT">Northwest Territories</option>
                  <option value="NU">Nunavut</option>
                  <option value="ON">Ontario</option>
                  <option value="PE">Prince Edward Island</option>
                  <option value="QC">Quebec</option>
                  <option value="SK">Saskatchewan</option>
                  <option value="YT">Yukon</option>
                </select>
              </div>
            )}
            {formData.country === 'US' && (
              <div className="h-0 rounded-b-md border-b border-x border-warm-300 dark:border-gray-600" />
            )}
          </div>
          {/* #369: Quebec Block — friendly notice when QC selected */}
          {formData.country === 'CA' && formData.province === 'QC' && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
              <p className="text-sm text-amber-700 dark:text-amber-200 font-medium">Quebec support is coming soon</p>
              <p className="text-sm text-amber-600 dark:text-amber-300 mt-1">
                We&apos;re actively working on provincial compliance.{' '}
                <a href="https://finda.sale/waitlist" className="underline hover:text-amber-800 dark:hover:text-amber-100">Join the waitlist</a>{''}
                {''} to be notified when Quebec launches.
              </p>
            </div>
          )}

          {formData.referralCode && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 flex items-center gap-2">
              <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-green-700 dark:text-green-300">Referral link applied — your friend gets bonus XP when you join!</span>
            </div>
          )}

          {formData.inviteCode && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 flex items-center gap-2">
              <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-green-700">Invite code <strong>{formData.inviteCode}</strong> applied</span>
            </div>
          )}

          {!formData.inviteCode && !claimOrganizerId && (
            <div>
              <label htmlFor="inviteCode" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                Beta Invite Code <span className="text-warm-400 font-normal">(if you have one)</span>
              </label>
              <input
                id="inviteCode"
                name="inviteCode"
                type="text"
                value={formData.inviteCode}
                onChange={handleChange}
                className="appearance-none block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-md placeholder-warm-400 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm bg-white dark:bg-gray-800 uppercase"
                placeholder="e.g. ABCD1234"
                maxLength={12}
              aria-label="e.g. ABCD1234" />
            </div>
          )}

          {formData.role === 'ORGANIZER' && (
            <div className="rounded-md shadow-sm -space-y-px">
              <p className="text-sm font-medium text-warm-700 dark:text-warm-300 mb-2 pt-2">Business Information</p>
              <div>
                <label htmlFor="businessName" className="sr-only">
                  Business Name
                </label>
                <input
                  id="businessName"
                  name="businessName"
                  type="text"
                  required
                  value={formData.businessName}
                  onChange={handleChange}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 rounded-t-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                  placeholder="Business Name"
                aria-label="Business Name" />
              </div>
              <div>
                <label htmlFor="phone" className="sr-only">
                  Business Phone
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                  placeholder="Business Phone"
                aria-label="Business Phone" />
              </div>
              <div>
                <label htmlFor="businessAddress" className="sr-only">
                  Business Address
                </label>
                <input
                  id="businessAddress"
                  name="businessAddress"
                  type="text"
                  required
                  value={formData.businessAddress}
                  onChange={handleChange}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 rounded-b-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                  placeholder="Business Address"
                aria-label="Business Address" />
              </div>
            </div>
          )}

          {/* Email consent checkboxes */}
          <div className="space-y-3 py-2">
            {formData.role === 'ORGANIZER' && (
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={organizerEmailConsent}
                  onChange={(e) => setOrganizerEmailConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-warm-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-sm text-warm-700 dark:text-warm-300">
                  Check to receive emails about nearby sales, new features, and promotions. Unsubscribe any time in account settings.
                </span>
              </label>
            )}
            {formData.role === 'USER' && (
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={shopperEmailConsent}
                  onChange={(e) => setShopperEmailConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-warm-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-sm text-warm-700 dark:text-warm-300">
                  Check to receive emails about nearby sales, new features, and promotions. Unsubscribe any time in account settings.
                </span>
              </label>
            )}
            {formData.role !== 'ORGANIZER' && formData.role !== 'USER' && (
              <>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={organizerEmailConsent}
                    onChange={(e) => setOrganizerEmailConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-warm-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-sm text-warm-700 dark:text-warm-300">
                    Check to receive emails about nearby sales, new features, and promotions. Unsubscribe any time in account settings.
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={shopperEmailConsent}
                    onChange={(e) => setShopperEmailConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-warm-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-sm text-warm-700 dark:text-warm-300">
                    Check to receive emails about nearby sales, new features, and promotions. Unsubscribe any time in account settings.
                  </span>
                </label>
              </>
            )}
          </div>

          <div className="text-xs text-warm-500 dark:text-warm-400 text-center">
            By creating an account, you agree to our <Link href="/terms" className="text-amber-600 hover:text-amber-500">Terms of Service</Link>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || (formData.country === 'CA' && formData.province === 'QC')}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Register'}
            </button>
          </div>
        </form>
        {/* Phase 31: Social login — always registers as Shopper (USER); upgrade in settings */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-warm-50 dark:bg-gray-900 text-warm-500 dark:text-warm-400">Or sign up with</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              // Store invite code in sessionStorage for OAuth flow
              if (formData.inviteCode) {
                sessionStorage.setItem('pendingInviteCode', formData.inviteCode);
              }
              // Feature #443: preserve claim param through OAuth redirect
              const claimParam = new URLSearchParams(window.location.search).get('claim');
              if (claimParam) sessionStorage.setItem('claimOrganizerId', claimParam);
              signIn('google', { callbackUrl: '/auth/oauth-callback' });
            }}
            className="w-full inline-flex justify-center items-center gap-2 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-sm font-medium text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          <button
            type="button"
            onClick={() => {
              // Store invite code in sessionStorage for OAuth flow
              if (formData.inviteCode) {
                sessionStorage.setItem('pendingInviteCode', formData.inviteCode);
              }
              // Feature #443: preserve claim param through OAuth redirect
              const claimParam = new URLSearchParams(window.location.search).get('claim');
              if (claimParam) sessionStorage.setItem('claimOrganizerId', claimParam);
              signIn('facebook', { callbackUrl: '/auth/oauth-callback' });
            }}
            className="w-full inline-flex justify-center items-center gap-2 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-sm font-medium text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
          >
            <svg className="h-5 w-5" fill="#1877F2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
          </button>
        </div>

        <div className="text-sm text-center text-warm-600 dark:text-warm-400">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-amber-600 hover:text-amber-500">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
