import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function VerifyEmail() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    if (!token) return;

    const verifyEmail = async () => {
      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully! You can now create sales.');
          // Redirect to dashboard after 2 seconds
          setTimeout(() => {
            router.push('/organizer/dashboard');
          }, 2000);
        } else {
          setStatus('error');
          setMessage(data.message || 'Failed to verify email. The link may have expired.');
        }
      } catch (error) {
        setStatus('error');
        setMessage('An error occurred while verifying your email.');
      }
    };

    verifyEmail();
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Email Verification</h1>

        {status === 'loading' && (
          <div>
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-amber-600 mb-4"></div>
            <p className="text-slate-600">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div className="text-green-600 text-5xl mb-4">✓</div>
            <p className="text-slate-700 text-lg font-medium mb-2">Success!</p>
            <p className="text-slate-600 mb-6">{message}</p>
            <p className="text-slate-500 text-sm">Redirecting to your dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="text-red-600 text-5xl mb-4">✕</div>
            <p className="text-slate-700 text-lg font-medium mb-2">Verification Failed</p>
            <p className="text-slate-600 mb-6">{message}</p>
            <button
              onClick={() => router.push('/auth/login')}
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
