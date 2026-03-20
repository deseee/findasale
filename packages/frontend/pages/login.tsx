import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';
import { usePasskey } from '../hooks/usePasskey';

const LoginPage = () => {
  const router = useRouter();
  const { login } = useAuth();
  const { authenticatePasskey, isSupported: passkeySupported, isLoading: passkeyLoading, error: passkeyError } = usePasskey();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      });

      // Store token in context and localStorage
      login(response.data.token);

      // Honour ?redirect= param, then fall back to role-based default
      const redirect = typeof router.query.redirect === 'string' ? router.query.redirect : null;
      if (redirect && redirect.startsWith('/')) {
        router.push(redirect);
      } else if (response.data.user.role === 'ORGANIZER') {
        router.push('/organizer/dashboard');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySignin = async () => {
    setError('');
    try {
      const result = await authenticatePasskey();

      // Store token in context and localStorage
      login(result.token);

      // Honour ?redirect= param, then fall back to role-based default
      const redirect = typeof router.query.redirect === 'string' ? router.query.redirect : null;
      if (redirect && redirect.startsWith('/')) {
        router.push(redirect);
      } else if (result.user.role === 'ORGANIZER') {
        router.push('/organizer/dashboard');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during passkey authentication');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <Head>
        <title>Login - FindA.Sale</title>
        <meta name="description" content="Login to your FindA.Sale account" />
      </Head>

      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-warm-900 dark:text-warm-100">
            Sign in to your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div className="text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            </div>
          )}
          <input type="hidden" name="remember" defaultValue="true" />
          <div className="rounded-md shadow-sm -space-y-px">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 rounded-t-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-warm-300 dark:border-gray-600 placeholder-warm-500 text-warm-900 dark:text-warm-100 rounded-b-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
                placeholder="Password"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-warm-900 dark:text-warm-100">
                Remember me
              </label>
            </div>

            <div className="text-sm">
              <Link href="/forgot-password" className="font-medium text-amber-600 hover:text-amber-500">
                Forgot your password?
              </Link>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
        {/* Passkey signin option */}
        {passkeySupported && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-warm-50 dark:bg-gray-900 text-warm-500 dark:text-warm-400">Or sign in with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePasskeySignin}
              disabled={passkeyLoading}
              aria-label="Sign in with Passkey"
              className="w-full inline-flex justify-center items-center gap-2 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-sm font-medium text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              {passkeyLoading ? 'Signing in...' : 'Sign in with Passkey'}
            </button>
          </>
        )}

        {/* Phase 31: Social login */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-warm-50 dark:bg-gray-900 text-warm-500 dark:text-warm-400">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: '/' })}
            aria-label="Sign in with Google"
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
            onClick={() => signIn('facebook', { callbackUrl: '/' })}
            aria-label="Sign in with Facebook"
            className="w-full inline-flex justify-center items-center gap-2 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-sm font-medium text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
          >
            <svg className="h-5 w-5" fill="#1877F2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
          </button>
        </div>

        <div className="text-sm text-center text-warm-600 dark:text-warm-400">
          Don't have an account?{' '}
          <Link href="/register" className="font-medium text-amber-600 hover:text-amber-500">
            Register now
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
