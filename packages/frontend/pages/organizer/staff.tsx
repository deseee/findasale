/**
 * Staff / Team Management Page
 *
 * TEAMS organizers can manage workspace members:
 * - Create workspace if not exists
 * - View current members with join dates and roles
 * - Invite new members by email
 * - Remove members (owner only)
 * - Tier upgrade wall for non-TEAMS organizers
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import {
  useMyWorkspace,
  useWorkspaceMembers,
  useCreateWorkspace,
  useInviteMember,
  useRemoveWorkspaceMember,
} from '../../hooks/useWorkspace';
import { formatDistanceToNow, parseISO } from 'date-fns';
import Skeleton from '../../components/Skeleton';

const OrganizerStaffPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { tier } = useOrganizerTier();

  // Form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [workspaceName, setWorkspaceName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Workspace & members queries
  const { data: workspace, isLoading: workspaceLoading } = useMyWorkspace();
  const { data: membersData, isLoading: membersLoading } = useWorkspaceMembers();

  // Mutations
  const createWorkspaceMutation = useCreateWorkspace();
  const inviteMutation = useInviteMember();
  const removeMutation = useRemoveWorkspaceMember();

  if (authLoading) return null;
  if (!user || !user.roles?.includes('ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Non-TEAMS: show tier upgrade wall
  if (tier !== 'TEAMS') {
    return (
      <>
        <Head>
          <title>Staff Accounts - FindA.Sale</title>
          <meta name="description" content="Upgrade to TEAMS to manage your staff" />
        </Head>
        <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">👥</div>
            <h1 className="text-4xl font-bold text-warm-900 dark:text-gray-100 mb-4">
              Staff Accounts
            </h1>
            <p className="text-lg text-warm-700 dark:text-gray-400 mb-8">
              Upgrade to TEAMS to manage your staff and collaborate with team members.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
                <strong>TEAMS feature</strong> — Includes workspace management and team collaboration
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Current tier: <strong>{tier}</strong>
              </p>
            </div>
            <Link
              href="/organizer/pricing"
              className="inline-block px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              Upgrade to TEAMS
            </Link>
          </div>
        </div>
      </>
    );
  }

  // TEAMS tier: show staff management
  const isOwner = workspace?.ownerId === user?.id;
  const members = membersData?.members || [];

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) {
      showToast('Workspace name is required', 'error');
      return;
    }
    try {
      await createWorkspaceMutation.mutateAsync(workspaceName.trim());
      setWorkspaceName('');
      setShowCreateForm(false);
      showToast('Workspace created', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to create workspace', 'error');
    }
  };

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) {
      showToast('Email is required', 'error');
      return;
    }
    if (!workspace) {
      showToast('Workspace not found', 'error');
      return;
    }
    try {
      await inviteMutation.mutateAsync({ email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail('');
      showToast('Invitation sent', 'success');
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message || 'Failed to send invite';
      showToast(errMsg, 'error');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm('Are you sure you want to remove this member?')) {
      return;
    }
    try {
      await removeMutation.mutateAsync(memberId);
      showToast('Member removed', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to remove member', 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Staff Accounts - FindA.Sale</title>
        <meta name="description" content="Manage your team members and staff access" />
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/organizer/dashboard"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Staff & Team</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage team members and collaboration
            </p>
          </div>

          {/* Loading state */}
          {workspaceLoading || (membersLoading && workspace) ? (
            <div className="space-y-4">
              <Skeleton className="h-32 rounded-lg" />
              <Skeleton className="h-64 rounded-lg" />
            </div>
          ) : null}

          {/* No workspace */}
          {!workspace && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 mb-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Create Your Workspace
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Set up a workspace to invite team members and collaborate on sales.
              </p>

              {!showCreateForm ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Create Workspace
                </button>
              ) : (
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="Workspace name (e.g., My Sales Team)"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={handleCreateWorkspace}
                    disabled={createWorkspaceMutation.isPending || !workspaceName.trim()}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {createWorkspaceMutation.isPending ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Workspace info & invite form */}
          {workspace && (
            <div className="space-y-8">
              {/* Workspace header */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {workspace.name}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {isOwner ? 'You own this workspace' : 'You are a member of this workspace'}
                </p>
              </div>

              {/* Invite form */}
              {isOwner && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    Invite Team Member
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        placeholder="colleague@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Role
                      </label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'MEMBER')}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="MEMBER">Member (can view sales)</option>
                        <option value="ADMIN">Admin (can manage team)</option>
                      </select>
                    </div>
                    <button
                      onClick={handleInviteMember}
                      disabled={inviteMutation.isPending || !inviteEmail.trim()}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
                    </button>
                  </div>
                </div>
              )}

              {/* Members list */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    Team Members ({members.length + 1})
                  </h3>
                </div>

                {members.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    No team members yet. Invite someone to get started.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                            Email
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                            Role
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                            Joined
                          </th>
                          {isOwner && (
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {members.map((member) => (
                          <tr
                            key={member.id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {member.organizer?.profilePhoto && (
                                  <img
                                    src={member.organizer.profilePhoto}
                                    alt={member.organizer?.businessName}
                                    className="h-8 w-8 rounded-full object-cover"
                                  />
                                )}
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                  {member.organizer?.businessName || 'Unknown'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                              {member.organizer?.user?.email || 'N/A'}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                                  member.role === 'ADMIN'
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200'
                                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                                }`}
                              >
                                {member.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                              {formatDistanceToNow(parseISO(member.invitedAt), {
                                addSuffix: true,
                              })}
                            </td>
                            {isOwner && (
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => handleRemoveMember(member.organizerId)}
                                  disabled={removeMutation.isPending}
                                  className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerStaffPage;
