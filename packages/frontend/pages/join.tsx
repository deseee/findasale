import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../components/AuthContext';
import api from '../lib/api';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../components/Skeleton';

interface InviteDetails {
  valid: boolean;
  reason?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  inviteEmail?: string;
  role?: string;
}

const JoinPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!router.isReady) return;

    const token = router.query.token as string;
    if (!token) {
      setError('No invite token provided');
      setLoading(false);
      return;
    }

    const validateInvite = async () => {
      try {
        const response = await api.get(`/workspace/invite/validate/${token}`);
        setInviteDetails(response.data);
        if (!response.data.valid) {
          setError(
            response.data.reason === 'expired'
              ? 'This invite link has expired. Please ask the workspace owner to send a new one.'
              : 'This invite link is invalid or not found.'
          );
        }
      } catch (err: any) {
        console.error('[join] Error validating invite:', err);
        setError('Failed to validate invite link');
      } finally {
        setLoading(false);
      }
    };

    validateInvite();
  }, [router.isReady, router.query.token]);

  const handleAcceptInvite = async () => {
    setAccepting(true);
    setError('');
    try {
      const token = router.query.token as string;
      const response = await api.post(`/workspace/invite/accept/${token}`);

      // Redirect to organizer dashboard with welcome flag
      router.push(`/organizer/dashboard?welcomed=workspace&workspaceName=${encodeURIComponent(response.data.workspaceName)}`);
    } catch (err: any) {
      console.error('[join] Error accepting invite:', err);
      setError(err.response?.data?.message || 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900 py-12 px-4">
        <Head>
          <title>Joining Workspace - FindA.Sale</title>
        </Head>
        <Skeleton className="w-96 h-48" />
      </div>
    );
  }

  if (!inviteDetails?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900 py-12 px-4">
        <Head>
          <title>Invalid Invite - FindA.Sale</title>
        </Head>
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">
            Invite Link Invalid
          </h1>
          <p className="text-warm-600 dark:text-warm-400 mb-6">
            {error || 'This invite link is no longer valid.'}
          </p>
          <Link href="/" className="inline-block px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900 py-12 px-4">
      <Head>
        <title>Join {inviteDetails.workspaceName} - FindA.Sale</title>
      </Head>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
            You're invited!
          </h1>
          <p className="text-lg text-warm-600 dark:text-warm-400">
            to join <strong>{inviteDetails.workspaceName}</strong>
          </p>
          {inviteDetails.role && (
            <p className="text-sm text-warm-500 dark:text-warm-500 mt-2">
              Role: <span className="font-semibold">{inviteDetails.role}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {user ? (
            <>
              <button
                onClick={handleAcceptInvite}
                disabled={accepting}
                className="w-full px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:bg-gray-400 font-medium"
              >
                {accepting ? 'Accepting...' : 'Accept Invite'}
              </button>
            </>
          ) : (
            <>
              <p className="text-center text-warm-600 dark:text-warm-400 text-sm">
                You need to create an account or sign in first.
              </p>
              <Link
                href={`/register?inviteToken=${router.query.token}`}
                className="block w-full px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 text-center font-medium"
              >
                Create Account
              </Link>
              <Link
                href={`/login?inviteToken=${router.query.token}`}
                className="block w-full px-4 py-2 border-2 border-amber-500 text-amber-600 dark:text-amber-400 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 text-center font-medium"
              >
                Sign In
              </Link>
            </>
          )}
        </div>

        <div className="text-center">
          <Link href="/" className="text-sm text-warm-500 dark:text-warm-500 hover:text-warm-700">
            Back to FindA.Sale
          </Link>
        </div>
      </div>
    </div>
  );
};

export default JoinPage;
