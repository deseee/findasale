import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import TeamSeatUpsellModal from './TeamSeatUpsellModal';

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
  const { updateUser } = useAuth();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Workspace Name
  const [workspaceName, setWorkspaceName] = useState('');

  // Step 2: Invite Members
  const [invitees, setInvitees] = useState<InviteeWithRole[]>([]);
  const [tempEmail, setTempEmail] = useState('');
  const [tempRole, setTempRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');

  // Upsell Modal state
  const [showSeatUpsellModal, setShowSeatUpsellModal] = useState(false);
  const [seatLimit, setSeatLimit] = useState<number | undefined>(undefined);
  // Invitees not yet sent because the member cap was hit; retried (all of them) after a seat purchase.
  const [unsentInvitees, setUnsentInvitees] = useState<InviteeWithRole[]>([]);
  // For the seat modal's "Seat 1 of 3 needed" line: seats this batch needs in total, and seats bought so far.
  const [seatsNeededTotal, setSeatsNeededTotal] = useState(0);
  const [seatsBought, setSeatsBought] = useState(0);

  // Handle Escape key to close the wizard. Ignored while the seat modal is open (it handles its own
  // Escape) or a request is in flight, so Escape can never unmount the wizard mid-payment.
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose && !showSeatUpsellModal && !isLoading) {
        onClose();
      }
    };

    // This Escape is ignored while the seat modal is open because of the showSeatUpsellModal guard
    // above. Capture phase makes sure that state is read before the modal's own Escape handler
    // closes it; in the bubble phase the modal would already be closed and this would also close
    // the wizard behind it.
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [onClose, showSeatUpsellModal, isLoading]);


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

  const handleDismiss = async () => {
    // If X is clicked, still mark the onboarding as complete to prevent re-appearing
    try {
      setIsLoading(true);
      // Mark TEAMS onboarding as complete even if skipped
      await api.patch('/users/me', {
        teamsOnboardingComplete: true,
      });

      // Update user context immediately to reflect the change
      updateUser({ teamsOnboardingComplete: true });

      showToast('You can set up your workspace later', 'info');

      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      console.error('Error dismissing TEAMS onboarding:', error);
      const msg = error.response?.data?.message || 'Failed to dismiss onboarding';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Sends invites in order. Stops at the first MEMBER_CAP_EXCEEDED and returns every invitee not yet
  // sent (that one and all after it) so none are silently dropped. With tolerant=false any other
  // error is re-thrown; with tolerant=true other failures are collected in `failed` and sending continues.
  const sendInvites = async (
    list: InviteeWithRole[],
    tolerant: boolean
  ): Promise<{ capHit?: { rest: InviteeWithRole[]; limit?: number }; failed: InviteeWithRole[] }> => {
    const failed: InviteeWithRole[] = [];
    for (let i = 0; i < list.length; i++) {
      const invitee = list[i];
      try {
        await api.post('/workspace/invite', { email: invitee.email, role: invitee.role });
      } catch (inviteErr: any) {
        if (inviteErr.response?.data?.code === 'MEMBER_CAP_EXCEEDED') {
          const limit = inviteErr.response?.data?.limit;
          return { capHit: { rest: list.slice(i), limit: typeof limit === 'number' ? limit : undefined }, failed };
        }
        // Already a member / already invited: the person is in, so count it as sent (idempotent retry).
        if (inviteErr.response?.status === 400 && /already/i.test(String(inviteErr.response?.data?.message || ''))) continue;
        if (!tolerant) throw inviteErr;
        failed.push(invitee);
      }
    }
    return { failed };
  };

  // Marks TEAMS onboarding complete and leaves the wizard for the workspace page.
  const finishOnboarding = async () => {
    await api.patch('/users/me', {
      teamsOnboardingComplete: true,
    });

    // Update user context immediately to reflect the change
    updateUser({ teamsOnboardingComplete: true });

    showToast('TEAMS workspace setup complete!', 'success');

    if (onComplete) {
      onComplete();
    }
    // Always navigate to workspace page after completion
    router.push('/organizer/workspace');
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      // Step 1: Create workspace (with recovery for retry scenario)
      let workspaceId: string;
      try {
        const workspaceRes = await api.post('/workspace', {
          name: workspaceName.trim(),
        });
        workspaceId = workspaceRes.data.id;
      } catch (createErr: any) {
        const status = createErr.response?.status;
        const msg = createErr.response?.data?.message || '';
        if (status === 400 && msg.toLowerCase().includes('already exists')) {
          // Workspace was already created (retry scenario) — fetch existing
          const existing = await api.get('/workspace');
          workspaceId = existing.data.id;
        } else {
          throw createErr; // surface real error
        }
      }

      // Step 2: Invite members
      // After a cancelled seat purchase only the held-back invitees are still unsent; resending the
      // whole list would re-invite people who are already in.
      const sent = await sendInvites(unsentInvitees.length > 0 ? unsentInvitees : invitees, false);
      if (sent.capHit) {
        // Show upsell modal and stop processing; don't mark onboarding as complete yet
        setIsLoading(false);
        setUnsentInvitees(sent.capHit.rest);
        setSeatsNeededTotal(seatsBought + sent.capHit.rest.length);
        setSeatLimit(sent.capHit.limit);
        setShowSeatUpsellModal(true);
        return;
      }

      // Step 3: Mark teams onboarding as complete
      await finishOnboarding();
    } catch (error: any) {
      console.error('Error completing TEAMS onboarding:', error);
      const msg = error.response?.data?.message || error.response?.data?.error || 'Failed to setup workspace';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Escape hatch after a cancelled seat purchase: finish setup without the invitations that need a seat.
  const handleSkipUnsent = async () => {
    const skipped = unsentInvitees.map((i) => i.email);
    setIsLoading(true);
    try {
      setUnsentInvitees([]);
      setSeatsNeededTotal(0);
      setSeatsBought(0);
      if (skipped.length > 0) {
        showToast(`Skipped ${skipped.length === 1 ? 'this invitation' : 'these invitations'}: ${skipped.join(', ')}. You can invite them later from your workspace page.`, 'warning');
      }
      await finishOnboarding();
    } catch (error: any) {
      console.error('Error finishing TEAMS onboarding:', error);
      showToast(error.response?.data?.message || error.response?.data?.error || 'Failed to complete setup', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpsellSuccess = async () => {
    // After a seat purchase, retry EVERY invitee that was held back by the cap, then complete onboarding.
    setIsLoading(true);
    setSeatsBought((n) => n + 1);
    try {
      const sent = await sendInvites(unsentInvitees, true);
      if (sent.capHit) {
        // Still over the cap: ask for another seat; onboarding stays open until every invitee is sent.
        setUnsentInvitees(sent.capHit.rest);
        setSeatLimit(sent.capHit.limit);
        setShowSeatUpsellModal(true);
        const n = sent.capHit.rest.length;
        showToast(`${n} more ${n === 1 ? 'invitee needs' : 'invitees need'} a seat before ${n === 1 ? 'it' : 'they'} can be invited.`, 'warning');
        return;
      }
      setUnsentInvitees([]);
      if (sent.failed.length > 0) {
        showToast(`These invitations could not be sent: ${sent.failed.map(f => f.email).join(', ')}. You can invite them again from your workspace page.`, 'warning');
      }

      setSeatsNeededTotal(0);
      setSeatsBought(0);
      await finishOnboarding();
    } catch (error: any) {
      console.error('Error completing TEAMS onboarding after upsell:', error);
      const msg = error.response?.data?.message || error.response?.data?.error || 'Failed to complete setup';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-96 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome to TEAMS!
          </h2>
          <button
            onClick={handleDismiss}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 cursor-pointer"
            title="Close and skip for now"
          >
            ✕
          </button>
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
                aria-label="e.g., Grand Rapids Sales Team" onChange={(e) => setWorkspaceName(e.target.value)}
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
                  Add other organizers to your workspace (optional. You can add more later).
                </p>
              </div>

              {/* Invite Form */}
              <div className="space-y-3 mb-6">
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="organizer@example.com"
                    value={tempEmail}
                    aria-label="organizer@example.com" onChange={(e) => setTempEmail(e.target.value)}
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

              {unsentInvitees.length > 0 && !showSeatUpsellModal && (
                <div role="alert" className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
                  <p className="mb-3">
                    {unsentInvitees.length} {unsentInvitees.length === 1 ? 'invitation is' : 'invitations are'} waiting for a seat: {unsentInvitees.map((i) => i.email).join(', ')}. Complete Setup will ask for the seat again, or you can skip {unsentInvitees.length === 1 ? 'it' : 'them'} and invite later.
                  </p>
                  <button
                    type="button"
                    onClick={handleSkipUnsent}
                    disabled={isLoading}
                    className="px-4 py-2 min-h-touch border border-amber-300 dark:border-amber-700 rounded-md font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
                  >
                    Skip these invitations and finish
                  </button>
                </div>
              )}

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
                          {invitee.email} <span className="text-xs bg-sage-100 dark:bg-sage-700 text-sage-700 dark:text-sage-100 px-2 py-0.5 rounded">({invitee.role})</span>
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

      {/* Team Seat Upsell Modal */}
      <TeamSeatUpsellModal
        isOpen={showSeatUpsellModal}
        onClose={() => setShowSeatUpsellModal(false)}
        onSuccess={handleUpsellSuccess}
        memberLimit={seatLimit}
        pendingCount={seatsNeededTotal}
        seatNumber={seatsBought + 1}
      />
    </div>
  );
};

export default TeamsOnboardingWizard;
