import React, { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface InviteeWithRole {
  email: string;
  role: 'ADMIN' | 'MEMBER';
}

interface TeamsOnboardingWizardProps {
  onComplete?: () => void;
  onClose?: () => void;
}

const TeamsOnboardingWizard: React.FC<TeamsOnboardingWizardProps> = ({ onComplete, onClose }) => {
  const router = useRouter();
  const { showToast } = useToast();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Workspace Name
  const [workspaceName, setWorkspaceName] = useState('');

  // Step 2: Invite Members
  const [invitees, setInvitees] = useState<InviteeWithRole[]>([]);
  const [tempEmail, setTempEmail] = useState('');
  const [tempRole, setTempRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');

  const handleAddInvitee = () => {
    if (!tempEmail.trim()) {
      showToast('Email is required', 'error');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(tempEmail)) {
      showToast('Invalid email format', 'error');
      return;
    }

    // Check if already added
    if (invitees.some(inv => inv.email === tempEmail)) {
      showToast('This email is already added', 'error');
      return;
    }

    setInvitees([...invitees, { email: tempEmail, role: tempRole }]);
    setTempEmail('');
  };

  const handleRemoveInvitee = (email: string) => {
    setInvitees(invitees.filter(inv => inv.email !== email));
  };

  const handleUpdateInviteeRole = (email: string, newRole: 'ADMIN' | 'MEMBER') => {
    setInvitees(invitees.map(inv => (inv.email === email ? { ...inv, role: newRole } : inv)));
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!workspaceName.trim()) {
        showToast('Workspace name is required', 'error');
        return;
      }
      if (workspaceName.trim().length < 3) {
        showToast('Workspace name must be at least 3 characters', 'error');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      // Step 1: Create workspace
      const workspaceRes = await api.post('/api/workspace', {
        name: workspaceName.trim(),
      });

      const workspaceId = workspaceRes.data.id;

      // Step 2: Invite members
      for (const invitee of invitees) {
        await api.post('/api/workspace/invite', {
          email: invitee.email,
          role: invitee.role,
        });
      }

      // Step 3: Mark teams onboarding as complete
      await api.patch('/api/users/me', {
        teamsOnboardingComplete: true,
      });

      showToast('TEAMS workspace setup complete!', 'success');

      // Redirect to workspace management page
      if (onComplete) {
        onComplete();
      } else {
        router.push('/organizer/workspace');
      }
    } catch (error: any) {
      console.error('Error completing TEAMS onboarding:', error);
      const msg = error.response?.data?.error || 'Failed to setup workspace';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-96 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome to TEAMS!
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Step 1: Workspace Name */}
          {currentStep === 1 && (
            <div>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Step 1: Name Your Workspace
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
                  Create a workspace name for your team's sales operations.
                </p>
              </div>
              <input
                type="text"
                placeholder="e.g., Grand Rapids Sales Team"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-sage-600"
                autoFocus
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                3-50 characters recommended for clarity.
              </p>
            </div>
          )}

          {/* Step 2: Invite Members */}
          {currentStep === 2 && (
            <div>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Step 2: Invite Team Members
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
                  Add other organizers to your workspace (optional — you can add more later).
                </p>
              </div>

              {/* Invite Form */}
              <div className="space-y-3 mb-6">
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="organizer@example.com"
                    value={tempEmail}
                    onChange={(e) => setTempEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddInvitee()}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-sage-600"
                  />
                  <select
                    value={tempRole}
                    onChange={(e) => setTempRole(e.target.value as 'ADMIN' | 'MEMBER')}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-sage-600"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddInvitee}
                    className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white font-medium rounded-md transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Invitees List */}
              {invitees.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-4 max-h-40 overflow-y-auto">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    Invited Members ({invitees.length}):
                  </p>
                  <div className="space-y-2">
                    {invitees.map((invitee) => (
                      <div key={invitee.email} className="flex items-center justify-between bg-white dark:bg-gray-600 p-2 rounded">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm text-gray-900 dark:text-white truncate">
                            {invitee.email}
                          </span>
                        </div>
                        <select
                          value={invitee.role}
                          onChange={(e) => handleUpdateInviteeRole(invitee.email, e.target.value as 'ADMIN' | 'MEMBER')}
                          className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-500 rounded dark:bg-gray-700 dark:text-white"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveInvitee(invitee.email)}
                          className="ml-2 text-red-600 hover:text-red-700 text-sm font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Permissions Review */}
          {currentStep === 3 && (
            <div>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Step 3: Review Setup
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Review your workspace settings before completing setup.
                </p>
              </div>

              {/* Review Summary */}
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Workspace Name:
                  </p>
                  <p className="text-gray-700 dark:text-gray-300">{workspaceName}</p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Team Members to Invite:
                  </p>
                  {invitees.length > 0 ? (
                    <ul className="space-y-1">
                      {invitees.map((invitee) => (
                        <li key={invitee.email} className="text-gray-700 dark:text-gray-300 text-sm">
                          {invitee.email} <span className="text-xs bg-sage-100 dark:bg-sage-900 text-sage-700 dark:text-sage-200 px-2 py-0.5 rounded">({invitee.role})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      No members invited yet. You can add them later.
                    </p>
                  )}
                </div>

                <div className="bg-blue-50 dark:bg-blue-900 rounded-md p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    ℹ️ You can manage workspace members and permissions anytime from the <strong>Team Workspace</strong> page.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          {/* Step Indicator */}
          <div className="flex gap-1">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`w-2 h-2 rounded-full transition ${
                  step <= currentStep ? 'bg-sage-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
              >
                Back
              </button>
            )}

            {currentStep < 3 ? (
              <button
                onClick={handleNext}
                disabled={isLoading || (currentStep === 1 && !workspaceName.trim())}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-md font-medium transition disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition disabled:opacity-50"
              >
                {isLoading ? 'Setting up...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamsOnboardingWizard;
