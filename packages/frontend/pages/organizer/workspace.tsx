/**
 * Organizer Workspace Management
 * TEAMS tier feature for multi-user workspace management
 * Only accessible to TEAMS tier organizers
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import {
  useMyWorkspace,
  useWorkspaceMembers,
  useCreateWorkspace,
  useInviteMember,
  useAcceptWorkspaceInvite,
  useRemoveWorkspaceMember,
} from '../../hooks/useWorkspace';
import TierGate from '../../components/TierGate';

export default function WorkspacePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const { tier, isTeams } = useOrganizerTier();

  // Workspace queries
  const { data: workspace, isLoading: workspaceLoading } = useMyWorkspace();
  const { data: membersData, isLoading: membersLoading } = useWorkspaceMembers();

  // Workspace mutations
  const createWorkspaceMutation = useCreateWorkspace();
  const inviteMemberMutation = useInviteMember();
  const acceptInviteMutation = useAcceptWorkspaceInvite();
  const removeMemberMutation = useRemoveWorkspaceMember();

  // Form state
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Auth check
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.push('/login?redirect=/organizer/workspace');
    return null;
  }

  // TierGate handles TEAMS access check in the JSX below

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) {
      showToast('Workspace name is required', 'error');
      return;
    }
    try {
      await createWorkspaceMutation.mutateAsync(workspaceName);
      showToast('Workspace created successfully', 'success');
      setWorkspaceName('');
      setShowCreateForm(false);
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to create workspace';
      showToast(msg, 'error');
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      showToast('Email is required', 'error');
      return;
    }
    try {
      await inviteMemberMutation.mutateAsync({ email: inviteEmail, role: inviteRole });
      showToast('Invitation sent successfully', 'success');
      setInviteEmail('');
      setShowInviteForm(false);
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to invite member';
      showToast(msg, 'error');
    }
  };

  const handleRemoveMember = async (organizerId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }
    try {
      await removeMemberMutation.mutateAsync(organizerId);
      showToast('Member removed successfully', 'success');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to remove member';
      showToast(msg, 'error');
    }
  };

  const isOwner = workspace && workspace.ownerUserId === user.id;
  const members = membersData?.members || [];

  return (
    <TierGate requiredTier="TEAMS" featureName="Team Workspace" description="Multi-user workspace management with role-based access, team collaboration tools, and shared sale operations.">
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Head>
        <title>Team Workspace - FindA.Sale</title>
      </Head>
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/organizer/settings">
              <a className="text-sage-600 hover:text-sage-700 text-sm mb-4 block">← Back to Settings</a>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Team Workspace</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Invite organizers to collaborate in your workspace
            </p>
          </div>
        </div>

        {/* Workspace Info */}
        {workspace ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {workspace.name}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 dark:text-gray-300">
              <div>
                <span className="font-semibold">Workspace URL:</span>
                <br />
                <a
                  href={`https://finda.sale/workspace/${workspace.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 font-medium underline"
                >
                  finda.sale/workspace/{workspace.slug}
                </a>
              </div>
              <div>
                <span className="font-semibold">Created:</span>
                <br />
                {new Date(workspace.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        ) : (
          !workspaceLoading && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8 text-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Create Your Team Workspace
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Create a workspace to invite other organizers to collaborate
              </p>
              {!showCreateForm ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 px-6 rounded-md"
                >
                  Create Workspace
                </button>
              ) : (
                <form onSubmit={handleCreateWorkspace} className="max-w-md mx-auto">
                  <input
                    type="text"
                    placeholder="Workspace name (e.g., 'My Workspace')"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md mb-4 dark:bg-gray-700 dark:text-white"
                    required
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={createWorkspaceMutation.isPending}
                      className="flex-1 bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 px-4 rounded-md disabled:opacity-50"
                    >
                      {createWorkspaceMutation.isPending ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100 font-bold py-2 px-4 rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        )}

        {/* Members Section */}
        {workspace && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Team Members
                  </h2>
                  {/* D-007: Show member count vs cap */}
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {members.length} / 12 members
                  </p>
                </div>
                {isOwner && !showInviteForm && (
                  <div className="flex flex-col items-end">
                    <button
                      onClick={() => setShowInviteForm(true)}
                      disabled={members.length >= 12}
                      className={`font-bold py-2 px-4 rounded-md text-sm transition-all ${
                        members.length >= 12
                          ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50'
                          : 'bg-sage-600 hover:bg-sage-700 text-white'
                      }`}
                    >
                      Invite Member
                    </button>
                    {members.length >= 12 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 text-right">
                        Team is at capacity. <Link href="/pricing" className="font-semibold hover:underline">Upgrade to Enterprise</Link>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Invite Form */}
              {isOwner && showInviteForm && (
                <form onSubmit={handleInviteMember} className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input
                      type="email"
                      placeholder="Organizer email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                      required
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'MEMBER')}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={inviteMemberMutation.isPending}
                        className="flex-1 bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 px-4 rounded-md disabled:opacity-50"
                      >
                        {inviteMemberMutation.isPending ? 'Sending...' : 'Send'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowInviteForm(false)}
                        className="bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100 font-bold py-2 px-4 rounded-md"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Members List */}
            {members.length > 0 ? (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {members.map((member) => (
                  <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                    <div className="flex items-center gap-4">
                      {member.organizer.profilePhoto && (
                        <img
                          src={member.organizer.profilePhoto}
                          alt={member.organizer.businessName}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {member.organizer.businessName}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {member.organizer.user?.email}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sage-100 text-sage-700 dark:bg-sage-900 dark:text-sage-200">
                            {member.role}
                          </span>
                          {!member.acceptedAt && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOwner && member.organizerId !== workspace.ownerId && (
                      <button
                        onClick={() => handleRemoveMember(member.organizerId)}
                        disabled={removeMemberMutation.isPending}
                        className="text-red-600 hover:text-red-700 font-semibold text-sm disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                No members yet. Invite organizers to get started.
              </div>
            )}
          </div>
        )}

        {/* Pending Invite */}
        {!workspace && !workspaceLoading && members.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-4">
              Pending Workspace Invitation
            </h2>
            <p className="text-blue-800 dark:text-blue-200 mb-4">
              You've been invited to a workspace. Accept the invitation to join.
            </p>
            <button
              onClick={() => acceptInviteMutation.mutate()}
              disabled={acceptInviteMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-md disabled:opacity-50"
            >
              {acceptInviteMutation.isPending ? 'Accepting...' : 'Accept Invitation'}
            </button>
          </div>
        )}
      </div>
    </div>
    </TierGate>
  );
}
