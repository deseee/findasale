/**
 * Team Members Management Page
 *
 * TEAMS organizers can manage workspace team members:
 * - View all members with contact info, role, department
 * - Manage member role (ADMIN/MANAGER/MEMBER/VIEWER)
 * - Update availability schedule (Mon-Sun with start/end times)
 * - View performance snapshots (items sold, revenue, tasks)
 * - Coverage gap alerts for upcoming sales
 * - Remove members (workspace owner only)
 * - Tier upgrade wall for non-TEAMS organizers
 *
 * Role descriptions:
 *   ADMIN    — Can manage team settings, invite members, and configure permissions
 *   MANAGER  — Can assign tasks, approve work, and view analytics
 *   MEMBER   — Can view inventory, process sales, and communicate with the team
 *   VIEWER   — Read-only access for accountants, estate executors, or family members
 */

import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronDown, ChevronUp, Phone, Mail, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import { useMyWorkspace, useInviteMember } from '../../hooks/useWorkspace';
import {
  useStaffList,
  useUpdateStaffProfile,
  useUpdateAvailability,
  useCoverageGaps,
  useRemoveStaffMember,
  useStaffPerformance,
  type StaffMember,
} from '../../hooks/useStaff';
import Skeleton from '../../components/Skeleton';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MEMBER_ROLES = [
  { value: 'ADMIN', label: 'Admin', description: 'Can manage team settings, invite members, and configure permissions' },
  { value: 'MANAGER', label: 'Manager', description: 'Can assign tasks, approve work, and view analytics' },
  { value: 'MEMBER', label: 'Member', description: 'Can view inventory, process sales, and communicate with the team' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only access for accountants, estate executors, or family members' },
];

const INVITE_ROLES = [
  { value: 'MEMBER', label: 'Member', description: 'Can view inventory, process sales, and chat' },
  { value: 'ADMIN', label: 'Admin', description: 'Full team management access' },
  { value: 'MANAGER', label: 'Manager', description: 'Can assign tasks and approve work' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only for accountants, executors, or family' },
];

interface ExpandedState {
  [staffId: string]: boolean;
}

interface EditState {
  [staffId: string]: {
    role?: string;
    department?: string;
    primaryPhone?: string;
  };
}

interface AvailabilityEditState {
  [staffId: string]: {
    [dayKey: string]: { start?: string; end?: string };
  };
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
  MANAGER: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200',
  MEMBER: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200',
  VIEWER: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
  STAFF: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200', // backward compat
};

const OrganizerMembersPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { tier } = useOrganizerTier();

  // Form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('MEMBER');

  // Expansion and editing states
  const [expandedCards, setExpandedCards] = useState<ExpandedState>({});
  const [editingProfile, setEditingProfile] = useState<EditState>({});
  const [editingAvailability, setEditingAvailability] = useState<AvailabilityEditState>({});
  const [removingStaffId, setRemovingStaffId] = useState<string | null>(null);

  // Workspace & staff queries
  const { data: workspace, isLoading: workspaceLoading } = useMyWorkspace();
  const workspaceId = workspace?.id;
  const { data: staffList, isLoading: staffLoading } = useStaffList(workspaceId);
  const { data: coverageGaps, isLoading: gapsLoading } = useCoverageGaps(workspaceId);

  // Mutations
  const inviteMutation = useInviteMember();
  const updateProfileMutation = useUpdateStaffProfile(workspaceId);
  const updateAvailabilityMutation = useUpdateAvailability(workspaceId);
  const removeStaffMutation = useRemoveStaffMember(workspaceId);

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
          <title>Team Members - FindA.Sale</title>
          <meta name="description" content="Upgrade to TEAMS to manage your team members" />
        </Head>
        <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">👥</div>
            <h1 className="text-4xl font-bold text-warm-900 dark:text-gray-100 mb-4">
              Team Members
            </h1>
            <p className="text-lg text-warm-700 dark:text-gray-400 mb-8">
              Upgrade to TEAMS to manage member roles, availability, and performance.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
                <strong>TEAMS feature</strong> — Full team management with scheduling and performance tracking
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

  // TEAMS tier: show member management
  const isOwner = workspace?.ownerUserId === user?.id;
  const members = staffList || [];

  // Normalize STAFF → MEMBER for display
  const displayRole = (role: string) => role === 'STAFF' ? 'MEMBER' : role;

  const handleToggleExpand = (staffId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [staffId]: !prev[staffId],
    }));
    // Clear editing state when collapsing
    if (expandedCards[staffId]) {
      setEditingProfile((prev) => {
        const next = { ...prev };
        delete next[staffId];
        return next;
      });
      setEditingAvailability((prev) => {
        const next = { ...prev };
        delete next[staffId];
        return next;
      });
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

  const handleUpdateProfile = async (staffId: string) => {
    const edits = editingProfile[staffId];
    if (!edits) return;
    try {
      await updateProfileMutation.mutateAsync({ staffId, ...edits });
      setEditingProfile((prev) => {
        const next = { ...prev };
        delete next[staffId];
        return next;
      });
      showToast('Profile updated', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update profile', 'error');
    }
  };

  const handleUpdateAvailability = async (staffId: string) => {
    const edits = editingAvailability[staffId];
    if (!edits) return;
    try {
      // Build availability object from day-based edits
      const availability: Record<string, string | undefined> = {};
      DAYS.forEach((day) => {
        const dayEdits = edits[day];
        if (dayEdits?.start !== undefined) {
          availability[`${day}StartTime`] = dayEdits.start || undefined;
        }
        if (dayEdits?.end !== undefined) {
          availability[`${day}EndTime`] = dayEdits.end || undefined;
        }
      });
      await updateAvailabilityMutation.mutateAsync({ staffId, availability });
      setEditingAvailability((prev) => {
        const next = { ...prev };
        delete next[staffId];
        return next;
      });
      showToast('Availability updated', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update availability', 'error');
    }
  };

  const handleRemoveMember = async (staffId: string) => {
    if (!window.confirm('Are you sure? This will remove the team member from your workspace.')) {
      setRemovingStaffId(null);
      return;
    }
    try {
      await removeStaffMutation.mutateAsync(staffId);
      showToast('Team member removed', 'success');
      setRemovingStaffId(null);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to remove team member', 'error');
    }
  };

  const getAvailabilityValue = (staffMember: StaffMember, day: string, type: 'start' | 'end') => {
    if (!staffMember.availability) return '';
    const key = type === 'start' ? `${day}StartTime` : `${day}EndTime`;
    return (staffMember.availability as any)[key] || '';
  };

  const setAvailabilityValue = (staffId: string, day: string, type: 'start' | 'end', value: string) => {
    setEditingAvailability((prev) => {
      const dayKey = day;
      const existing = prev[staffId] || {};
      const dayEdits = existing[dayKey] || {};
      return {
        ...prev,
        [staffId]: {
          ...existing,
          [dayKey]: {
            ...dayEdits,
            [type === 'start' ? 'start' : 'end']: value,
          },
        },
      };
    });
  };

  return (
    <>
      <Head>
        <title>Team Members - FindA.Sale</title>
        <meta name="description" content="Manage your team members, roles, and availability" />
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/organizer/dashboard"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Team Members</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage your team's roles, availability, and performance
            </p>
          </div>

          {/* Loading state */}
          {workspaceLoading || (staffLoading && workspace) ? (
            <div className="space-y-4">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-64 rounded-lg" />
            </div>
          ) : null}

          {/* Coverage gap alerts */}
          {!gapsLoading && coverageGaps && coverageGaps.length > 0 && (
            <div className="mb-8 space-y-2">
              {coverageGaps.map((gap) => (
                <div
                  key={gap.id}
                  className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 flex items-start gap-3"
                >
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      {gap.message}
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                      {gap.saleName} — {gap.saleDate}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {workspace && (
            <div className="space-y-8">
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
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {INVITE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label} — {r.description}
                          </option>
                        ))}
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

              {/* Team Overview Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Your Team</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {members.length} member{members.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Member cards */}
              {members.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-gray-200 dark:border-gray-700">
                  <div className="text-4xl mb-4">👤</div>
                  <p className="text-gray-600 dark:text-gray-400">
                    No team members yet. Invite someone to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition"
                    >
                      {/* Collapsed view */}
                      <button
                        onClick={() => handleToggleExpand(member.id)}
                        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                      >
                        <div className="flex items-center gap-4 flex-1 text-left">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {member.workspaceMember?.organizer?.businessName || 'Unknown'}
                            </h3>
                            <div className="flex items-center gap-3 mt-1">
                              <span
                                className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                                  ROLE_COLORS[displayRole(member.role)] || ROLE_COLORS.MEMBER
                                }`}
                              >
                                {displayRole(member.role)}
                              </span>
                              {member.department && (
                                <span className="text-xs text-gray-600 dark:text-gray-400">
                                  {member.department}
                                </span>
                              )}
                            </div>
                          </div>
                          {member.primaryPhone && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {member.primaryPhone}
                            </div>
                          )}
                        </div>
                        {expandedCards[member.id] ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </button>

                      {/* Expanded view */}
                      {expandedCards[member.id] && (
                        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-6">
                          {/* Contact info */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                              Contact Information
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <Mail className="w-4 h-4" />
                                {member.workspaceMember?.organizer?.user?.email || 'N/A'}
                              </div>
                              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <Phone className="w-4 h-4" />
                                {member.primaryPhone || 'Not provided'}
                              </div>
                            </div>
                          </div>

                          {/* Role and department */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase">
                                Role
                              </label>
                              <select
                                value={editingProfile[member.id]?.role ?? displayRole(member.role)}
                                onChange={(e) =>
                                  setEditingProfile((prev) => ({
                                    ...prev,
                                    [member.id]: {
                                      ...prev[member.id],
                                      role: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                              >
                                {MEMBER_ROLES.map((r) => (
                                  <option key={r.value} value={r.value}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {MEMBER_ROLES.find((r) => r.value === (editingProfile[member.id]?.role ?? displayRole(member.role)))?.description}
                              </p>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase">
                                Department
                              </label>
                              <input
                                type="text"
                                placeholder="e.g., Sales"
                                value={editingProfile[member.id]?.department ?? member.department ?? ''}
                                onChange={(e) =>
                                  setEditingProfile((prev) => ({
                                    ...prev,
                                    [member.id]: {
                                      ...prev[member.id],
                                      department: e.target.value || undefined,
                                    },
                                  }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                              />
                            </div>
                          </div>

                          {/* Availability grid */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                              Availability
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {DAYS.map((day, idx) => {
                                const startValue =
                                  editingAvailability[member.id]?.[day]?.start ??
                                  getAvailabilityValue(member, day, 'start');
                                const endValue =
                                  editingAvailability[member.id]?.[day]?.end ??
                                  getAvailabilityValue(member, day, 'end');

                                return (
                                  <div key={day} className="flex items-end gap-2">
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                        {DAY_LABELS[idx]}
                                      </label>
                                      <div className="flex gap-2">
                                        <input
                                          type="time"
                                          value={startValue}
                                          onChange={(e) =>
                                            setAvailabilityValue(member.id, day, 'start', e.target.value)
                                          }
                                          className="flex-1 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          placeholder="Start"
                                        />
                                        <input
                                          type="time"
                                          value={endValue}
                                          onChange={(e) =>
                                            setAvailabilityValue(member.id, day, 'end', e.target.value)
                                          }
                                          className="flex-1 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          placeholder="End"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button
                              onClick={() => handleUpdateProfile(member.id)}
                              disabled={
                                updateProfileMutation.isPending ||
                                !editingProfile[member.id]
                              }
                              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm font-medium"
                            >
                              Save Profile
                            </button>
                            <button
                              onClick={() => handleUpdateAvailability(member.id)}
                              disabled={
                                updateAvailabilityMutation.isPending ||
                                !editingAvailability[member.id]
                              }
                              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition text-sm font-medium"
                            >
                              Save Availability
                            </button>
                            {isOwner && (
                              <button
                                onClick={() => handleRemoveMember(member.id)}
                                disabled={removeStaffMutation.isPending}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition text-sm font-medium flex items-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerMembersPage;
