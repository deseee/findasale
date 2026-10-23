import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';

export default function VerifyEmail() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  // 2026-10-23: an expired link used to dead-end at "Back to Login". If the organizer is signed in
  // and still unverified, let them get a fresh link right here.
  const { user } = useAuth();
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const canResend = !!user?.email && user?.emailVerified === false;
  const handleResend = async () => {
    if (!user?.email || resendState === 'sending' || resendState === 'sent') return;
    setResendState('sending');
    try {
      await api.post('/auth/resend-verification', { email: user.email });
      setResendState('sent');
    } catch {
      setResendState('error');
    }
  };

  useEffect(() => {
    if (!token) return;

    const verifyEmail = async () => {
      try {
        const response = await api.post('/auth/verify-email', { token });
        setStatus('success');
        setMessage(response.data.message || 'Email verified successfully! You can now publish your sales.');
        setTimeout(() => {
          router.push('/organizer/dashboard');
        }, 2000);
      } catch (error: any) {
        setStatus('error');
        setMessage(
          error?.response?.data?.message || 'Failed to verify email. The link may have expired.'
        );
      }
    };

    verifyEmail();
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full bg-white dark:bg-warm-900 rounded-lg shadow-md p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-warm-100 mb-6">Email Verification</h1>

        {status === 'loading' && (
          <div>
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-300 dark:border-gray-600 border-t-amber-600 mb-4"></div>
            <p className="text-slate-600 dark:text-warm-300">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div className="text-green-600 dark:text-green-400 text-5xl mb-4">&#10003;</div>
            <p className="text-slate-700 dark:text-warm-200 text-lg font-medium mb-2">Success!</p>
            <p className="text-slate-600 dark:text-warm-300 mb-6">{message}</p>
            <p className="text-slate-500 dark:text-warm-300 text-sm">Redirecting to your dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="text-red-600 dark:text-red-400 text-5xl mb-4">&#10005;</div>
            <p className="text-slate-700 dark:text-warm-200 text-lg font-medium mb-2">Verification Failed</p>
            <p className="text-slate-600 dark:text-warm-300 mb-6">{message}</p>
            {canResend && (
              <div className="mb-4">
                <button
                  onClick={handleResend}
                  disabled={resendState === 'sending' || resendState === 'sent'}
                  className="inline-block bg-amber-600 text-white px-6 py-2 rounded font-medium hover:bg-amber-700 transition disabled:opacity-60"
                >
                  {resendState === 'sending' ? 'Sending...' : resendState === 'sent' ? 'New link sent' : 'Send me a new link'}
                </button>
                {resendState === 'sent' && (
                  <p className="text-slate-600 dark:text-warm-300 text-sm mt-3">We sent a new link to <strong>{user?.email}</strong>. Check your inbox and spam folder.</p>
                )}
                {resendState === 'error' && (
                  <p className="text-red-600 dark:text-red-400 text-sm mt-3">Could not send a new link. Please try again in a few minutes.</p>
                )}
              </div>
            )}
            <button
              onClick={() => router.push('/login')}
              className="inline-block bg-amber-600 text-white px-6 py-2 rounded font-medium hover:bg-amber-700 transition"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
