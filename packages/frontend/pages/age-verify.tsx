import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { signOut, useSession } from 'next-auth/react';
import api from '../lib/api';

const AgeVerifyPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [ageError, setAgeError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated and age-verified
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDateOfBirth(value);

    if (value) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate age before submission
    if (!dateOfBirth) {
      setError('Date of birth is required.');
      setLoading(false);
      return;
    }
    if (ageError) {
      setError(ageError);
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/auth/oauth-verify-age', {
        dateOfBirth
      });

      // Age verified successfully — redirect to home or stored returnTo
      const returnTo = router.query.returnTo || '/';
      router.push(returnTo as string);
    } catch (err: any) {
      const message = err.response?.data?.message || 'An error occurred';
      if (message.includes('18') || message.includes('underage')) {
        // User is underage — sign them out
        await signOut({ redirect: false });
        setError('You must be 18 or older to use FindA.Sale. Your account has been signed out.');
        setTimeout(() => router.push('/'), 2000);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <Head>
        <title>Age Verification - FindA.Sale</title>
        <meta name="description" content="Verify your age to continue using FindA.Sale" />
      </Head>

      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-warm-900 dark:text-warm-100">
            Verify your age
          </h2>
          <p className="mt-2 text-center text-sm text-warm-600 dark:text-warm-400">
            You must be 18 or older to use FindA.Sale.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div className="text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            </div>
          )}

          <div className="rounded-md shadow-sm">
            <div>
              <label htmlFor="dateOfBirth" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Date of Birth
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                required
                value={dateOfBirth}
                onChange={handleDateChange}
                className="appearance-none block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-md placeholder-warm-400 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm bg-white dark:bg-gray-800"
              / aria-label="Dateofbirth">
              {ageError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{ageError}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !!ageError}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
            >
              {loading ? 'Verifying age...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AgeVerifyPage;
