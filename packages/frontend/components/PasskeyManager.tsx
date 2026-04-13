/**
 * PasskeyManager Component
 *
 * Allows authenticated users to:
 * - View registered passkeys (device name, creation date, last used)
 * - Add a new passkey
 * - Delete existing passkeys
 * - Check browser support for WebAuthn
 */

import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';

interface Passkey {
  id: string;
  credentialId: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const PasskeyManager: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState('');

  // Check WebAuthn support
  useEffect(() => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      setIsSupported(true);
    }
  }, []);

  // Fetch user's passkeys
  const { data: passkeyData, isLoading } = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => api.get('/api/auth/passkey/list').then(r => r.data),
    enabled: !!user && isSupported,
  });

  // Delete passkey mutation
  const deleteMutation = useMutation({
    mutationFn: (credentialId: string) =>
      api.delete(`/api/auth/passkey/${credentialId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      showToast('Passkey deleted successfully', 'success');
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to delete passkey';
      showToast(msg, 'error');
    },
  });

  // Register new passkey
  const handleAddPasskey = async () => {
    if (!isRegistering && !deviceName.trim()) {
      showToast('Please enter a device name', 'error');
      return;
    }

    setIsRegistering(true);
    try {
      // Step 1: Get registration options from server
      const beginResponse = await api.post('/api/auth/passkey/register/begin');
      const options = beginResponse.data.publicKeyOptions;

      // Step 2: Use browser API to create credential
      const credential = await startRegistration(options);

      // Step 3: Send credential to server for verification and storage
      const completeResponse = await api.post(
        '/api/auth/passkey/register/complete',
        {
          id: credential.id,
          rawId: credential.rawId,
          response: credential.response,
          type: credential.type,
          deviceName: deviceName.trim() || 'Passkey',
        }
      );

      showToast(
        `Passkey "${completeResponse.data.deviceName}" registered successfully`,
        'success'
      );
      setDeviceName('');
      queryClient.invalidateQueries({ queryKey: ['passkeys'] });
    } catch (error: any) {
      console.error('Passkey registration error:', error);
      let message = 'Failed to register passkey';

      if (error.code === 'NotAllowedError') {
        message = 'Passkey registration was cancelled';
      } else if (error.code === 'NotSupportedError') {
        message = 'Your device or browser does not support passkeys';
      } else if (error.response?.data?.message) {
        message = error.response.data.message;
      }

      showToast(message, 'error');
    } finally {
      setIsRegistering(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">
          Passkey Authentication
        </h3>
        <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Your browser does not support passkey authentication (WebAuthn). Please use a modern browser like Chrome, Safari, Edge, or Firefox.
          </p>
        </div>
      </div>
    );
  }

  const passkeys = passkeyData?.passkeys || [];

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">
        Passkey Authentication
      </h3>

      <p className="text-warm-600 dark:text-gray-400 mb-6">
        Passkeys are a phishing-resistant way to sign in using your face, fingerprint, or device PIN.
      </p>

      {/* Add Passkey Section */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-3">
          Add a Passkey
        </h4>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
              Device Name (optional)
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g., iPhone Face ID, MacBook Touch ID"
              disabled={isRegistering}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            />
          </div>
          <button
            onClick={handleAddPasskey}
            disabled={isRegistering}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            {isRegistering ? 'Registering...' : 'Add Passkey'}
          </button>
        </div>
      </div>

      {/* Registered Passkeys */}
      <div>
        <h4 className="font-semibold text-warm-900 dark:text-gray-100 mb-3">
          Your Passkeys ({passkeys.length})
        </h4>

        {isLoading ? (
          <p className="text-warm-600 dark:text-gray-400">Loading passkeys...</p>
        ) : passkeys.length === 0 ? (
          <p className="text-warm-600 dark:text-gray-400">
            No passkeys registered yet. Add one above to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {passkeys.map((passkey: Passkey) => (
              <div
                key={passkey.id}
                className="flex items-center justify-between p-3 border rounded-lg dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
              >
                <div className="flex-1">
                  <p className="font-semibold text-warm-900 dark:text-gray-100">
                    {passkey.deviceName}
                  </p>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    Registered {new Date(passkey.createdAt).toLocaleDateString()}
                  </p>
                  {passkey.lastUsedAt && (
                    <p className="text-xs text-warm-500 dark:text-gray-500">
                      Last used {new Date(passkey.lastUsedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => deleteMutation.mutate(passkey.credentialId)}
                  disabled={deleteMutation.isPending}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 font-medium text-sm transition"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PasskeyManager;
