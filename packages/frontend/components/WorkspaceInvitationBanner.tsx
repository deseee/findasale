import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { usePendingWorkspaceInvitations, PendingInvitation } from '../hooks/useWorkspace';
import { useAcceptWorkspaceInvite } from '../hooks/useWorkspace';
import { useToast } from './ToastContext';

const WorkspaceInvitationBanner: React.FC = () => {
  const router = useRouter();
  const { showToast } = useToast();
  const { data: pendingInvitations = [], isLoading, isError } = usePendingWorkspaceInvitations();
  const acceptMutation = useAcceptWorkspaceInvite();
  const [dismissed, setDismissed] = useState<string[]>([]);

  if (isLoading || isError || pendingInvitations.length === 0) {
    return null;
  }

  // Filter out dismissed invitations
  const visibleInvitations = pendingInvitations.filter(
    (inv) => !dismissed.includes(inv.id)
  );

  if (visibleInvitations.length === 0) {
    return null;
  }

  const invitation = visibleInvitations[0]; // Show first pending invitation

  const handleAccept = async () => {
    try {
      await acceptMutation.mutateAsync();
      showToast(`You've joined ${invitation.workspace.name}!`, 'success');
      setTimeout(() => {
        router.push('/organizer/dashboard');
      }, 500);
    } catch (error: any) {
      showToast('Failed to accept invitation. Please try again.', 'error');
      console.error('Error accepting invitation:', error);
    }
  };

  const handleDismiss = () => {
    setDismissed((prev) => [...prev, invitation.id]);
  };

  return (
    <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-l-4 border-emerald-600 rounded-lg p-4 mb-6 shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-emerald-900">Workspace Invitation</h3>
            <p className="text-sm text-emerald-800 mt-1">
              You've been invited to join <span className="font-medium">{invitation.workspace.name}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleAccept}
            disabled={acceptMutation.isPending}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {acceptMutation.isPending ? 'Accepting...' : 'Accept'}
          </button>
          <button
            onClick={handleDismiss}
            disabled={acceptMutation.isPending}
            className="p-2 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Dismiss invitation"
          >
            <X className="w-4 h-4 text-emerald-700" />
          </button>
        </div>
      </div>

      {acceptMutation.isError && (
        <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">Failed to accept invitation. Please try again.</p>
        </div>
      )}
    </div>
  );
};

export default WorkspaceInvitationBanner;
