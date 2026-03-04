import React, { useState } from 'react';
import api from '../lib/api';
import Link from 'next/link';
import Head from 'next/head';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (error) {
      console.error('Failed to send reset email:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Forgot Password - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h1 className="text-2xl font-bold text-warm-900 mb-2">Forgot Password?</h1>
            <p className="text-warm-600 mb-6">
              Enter your email and we'll send you a link to reset your password.
            </p>

            {submitted ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-green-800 font-medium mb-2">Check your email</p>
                <p className="text-green-700 text-sm">
                  We've sent a password reset link to {email}. Click the link to reset your password.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-warm-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="your@email.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <div className="mt-6 text-center text-sm text-warm-600">
              Remember your password?{' '}
              <Link href="/login" className="text-amber-600 hover:underline font-medium">
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ForgotPasswordPage;
