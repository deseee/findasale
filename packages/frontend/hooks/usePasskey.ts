/**
 * usePasskey Hook
 *
 * Handles Passkey/WebAuthn authentication flow for login and registration.
 * - registerPasskey(): Register a new passkey for authenticated user
 * - authenticatePasskey(): Authenticate with an existing passkey
 * - isSupported: Check if browser supports WebAuthn
 */

import { useState, useEffect } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import api from '../lib/api';

export const usePasskey = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check WebAuthn support on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      setIsSupported(true);
    }
  }, []);

  /**
   * Register a new passkey for the authenticated user
   * Requires: User must be logged in (authorization header will be set by AuthContext)
   */
  const registerPasskey = async (deviceName?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      if (!isSupported) {
        throw new Error('Your browser does not support passkeys');
      }

      // Step 1: Get registration options from server
      const beginResponse = await api.post('/api/auth/passkey/register/begin');
      const options = beginResponse.data.publicKeyOptions;

      // Step 2: Use browser API to create credential
      const credential = await startRegistration(options);

      // Step 3: Send credential to server for verification and storage
      const completeResponse = await api.post('/api/auth/passkey/register/complete', {
        id: credential.id,
        rawId: credential.rawId,
        response: credential.response,
        type: credential.type,
        deviceName: deviceName || 'Passkey',
      });

      return {
        success: true,
        credential: completeResponse.data,
      };
    } catch (err: any) {
      let errorMessage = 'Failed to register passkey';

      if (err.code === 'NotAllowedError') {
        errorMessage = 'Passkey registration was cancelled';
      } else if (err.code === 'NotSupportedError') {
        errorMessage = 'Your device or browser does not support passkeys';
      } else if (err.code === 'InvalidStateError') {
        errorMessage = 'This passkey is already registered';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Authenticate with a passkey
   * Public endpoint — no authentication required
   * Returns JWT token on success
   */
  const authenticatePasskey = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!isSupported) {
        throw new Error('Your browser does not support passkeys');
      }

      // Step 1: Get authentication options from server (public endpoint)
      const beginResponse = await api.post('/api/auth/passkey/authenticate/begin');
      const options = beginResponse.data.publicKeyOptions;

      // Step 2: Use browser API to authenticate
      const assertion = await startAuthentication(options);

      // Step 3: Send assertion to server for verification
      const completeResponse = await api.post(
        '/api/auth/passkey/authenticate/complete',
        {
          id: assertion.id,
          response: assertion.response,
        }
      );

      // Return token and user info
      return {
        success: true,
        token: completeResponse.data.token,
        user: completeResponse.data.user,
      };
    } catch (err: any) {
      let errorMessage = 'Failed to authenticate with passkey';

      if (err.code === 'NotAllowedError') {
        errorMessage = 'Authentication was cancelled';
      } else if (err.code === 'NotSupportedError') {
        errorMessage = 'Your device or browser does not support passkeys';
      } else if (err.code === 'SecurityError') {
        errorMessage = 'Authentication failed — ensure you are on a secure connection';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    registerPasskey,
    authenticatePasskey,
    isSupported,
    isLoading,
    error,
    clearError: () => setError(null),
  };
};
