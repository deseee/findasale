/**
 * Organizer Workspace Settings
 * TEAMS tier feature for workspace configuration
 *
 * Sections:
 * 1. Workspace Identity (name, slug, description, created date)
 * 2. Workspace Templates (Empty, Solo, 2-Person, 5-Person, Custom)
 * 3. Role & Permission Builder (ADMIN, MANAGER, STAFF, VIEWER tabs)
 * 4. Brand Rules (dress code, photo standards, arrival time, custom rules)
 * 5. Cost Calculator (members, fees, total cost)
 * 6. Danger Zone (delete workspace)
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import { useMyWorkspace } from '../../hooks/useWorkspace';
import {
  useWorkspaceSettings,
  useUpdateWorkspaceSettings,
  useApplyTemplate,
  useWorkspacePermissions,
  useUpdatePermissions,
  useCostCalculator,
} from '../../hooks/useWorkspaceSettings';
import TierGate from '../../components/TierGate';

// Permission categories and actions for display
const PERMISSION_CATEGORIES = [
  {
    name: 'Inventory',
    permissions: ['view_inventory', 'add_items', 'edit_items', 'delete_items', 'bulk_import', 'approve_ai_tags'],
  },
  {
    name: 'Pricing',
    permissions: ['view_pricing', 'edit_pricing', 'view_ai_suggestions'],
  },
  {
    name: 'POS',
    permissions: ['process_pos', 'view_sales_analytics', 'void_transactions'],
  },
  {
    name: 'Team',
    permissions: ['view_staff', 'invite_staff', 'edit_staff_roles', 'view_performance'],
  },
  {
    name: 'Workspace',
    permissions: ['manage_workspace_settings', 'edit_permissions', 'view_billing'],
  },
  {
    name: 'Communication',
    permissions: ['send_team_chat', 'broadcast_alerts', 'create_tasks'],
  },
];

// Display name mapping for permission actions
const PERMISSION_DISPLAY_NAMES: Record<string, string> = {
  view_ai_suggestions: 'View Suggestions',
  approve_ai_tags: 'Approve Tags',
};

// Template definitions
const TEMPLATES = [
  {
    name: 'Empty',
    description: 'Start with no pre-configured roles',
    recommendedTeamSize: 1,
  },
  {
    name: 'Solo',
    description: 'Single organizer, all permissions',
    recommendedTeamSize: 1,
  },
  {
    name: '2-Person',
    description: 'Owner + 1 manager with full access',
    recommendedTeamSize: 2,
  },
  {
    name: '5-Person',
    description: 'Full team structure with role separation',
    recommendedTeamSize: 5,
  },
];

const WORKSPACE_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { isTeams } = useOrganizerTier();

  // Queries
  const { data: workspace, isLoading: workspaceLoading } = useMyWorkspace();
  const { data: settings, isLoading: settingsLoading } = useWorkspaceSettings(isTeams ? workspace?.id || null : null);
  const { data: permissions, isLoading: permissionsLoading } = useWorkspacePermissions(isTeams ? workspace?.id || null : null);
  const { data: costData, isLoading: costLoading } = useCostCalculator(isTeams ? workspace?.id || null : null);

  // Mutations
  const updateSettingsMutation = useUpdateWorkspaceSettings(workspace?.id || null);
  const applyTemplateMutation = useApplyTemplate(workspace?.id || null);
  const updatePermissionsMutation = useUpdatePermissions(workspace?.id || null);

  // Local state
  const [workspaceName, setWorkspaceName] = useState('');
  const [description, setDescription] = useState('');
  const [activeRoleTab, setActiveRoleTab] = useState('ADMIN');
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, boolean>>({});
  const [showTemplateConfirm, setShowTemplateConfirm] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [brandRules, setBrandRules] = useState({
    dressCode: '',
    photoStandards: '',
    customerServiceStandards: '',
    customRules: '',
  });

  // Initialize local state from queries
  useEffect(() => {
    if (workspace) {
      setWorkspaceName(workspace.name || '');
    }
  }, [workspace]);

  useEffect(() => {
    if (settings) {
      setDescription((settings as any).description || '');
    }
  }, [settings]);

  useEffect(() => {
    if (permissions && Array.isArray(permissions) && activeRoleTab) {
      const rolePerms = permissions.find((rp) => rp.role === activeRoleTab);
      if (rolePerms) {
        const permMap: Record<string, boolean> = {};
        rolePerms.permissions.forEach((cat) => {
          cat.permissions.forEach((perm) => {
            permMap[perm.action] = perm.allowed;
          });
        });
        setSelectedPermissions(permMap);
      }
    }
  }, [permissions, activeRoleTab]);

  // Auth check
  if (authLoading) {
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

  if (!workspace) {
    return (
      <TierGate requiredTier="TEAMS" featureName="Workspace Settings" description="Configure team workspace settings, permissions, and cost breakdown.">
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-600 dark:text-gray-300 mb-4">No workspace found. Create one first.</p>
              <Link href="/organizer/workspace">
                <a className="text-sage-600 hover:text-sage-700 font-semibold">Go back</a>
              </Link>
            </div>
          </div>
        </div>
      </TierGate>
    );
  }

  const isOwner = workspace && (workspace.ownerId === user.id || (workspace as any).ownerUserId === user.id);

  const handleUpdateName = async () => {
    if (!workspace) return;
    try {
      await updateSettingsMutation.mutateAsync({
        name: workspaceName,
      });
      showToast('Workspace name updated', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update workspace', 'error');
    }
  };

  const handleApplyTemplate = async () => {
    if (!pendingTemplate || !workspace) return;
    try {
      await applyTemplateMutation.mutateAsync(pendingTemplate);
      showToast(`Template "${pendingTemplate}" applied successfully`, 'success');
      setShowTemplateConfirm(false);
      setPendingTemplate(null);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to apply template', 'error');
    }
  };

  const handleSavePermissions = async () => {
    if (!workspace || !activeRoleTab) return;
    try {
      const allowedActions = Object.entries(selectedPermissions)
        .filter(([_, allowed]) => allowed)
        .map(([action, _]) => action);

      await updatePermissionsMutation.mutateAsync({
        role: activeRoleTab,
        permissions: allowedActions,
      });
      showToast('Permissions saved', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to save permissions', 'error');
    }
  };

  const handleSaveBrandRules = async () => {
    if (!workspace) return;
    try {
      await updateSettingsMutation.mutateAsync({
        brandRules: JSON.stringify(brandRules),
      });
      showToast('Brand rules saved', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to save brand rules', 'error');
    }
  };

  const handleDeleteWorkspace = async () => {
    if (deleteConfirmName !== workspace.name) {
      showToast('Workspace name does not match', 'error');
      return;
    }
    try {
      // TODO: Implement delete endpoint
      showToast('Workspace deletion not yet implemented', 'info');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to delete workspace', 'error');
    }
  };

  return (
    <TierGate requiredTier="TEAMS" featureName="Workspace Settings" description="Configure team workspace settings, permissions, and cost breakdown.">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Head>
          <title>Workspace Settings - FindA.Sale</title>
        </Head>
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="mb-12">
            <Link href="/organizer/dashboard">
              <a className="text-sage-600 hover:text-sage-700 text-sm mb-4 block">← Back to Dashboard</a>
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Workspace Settings</h1>
            <p className="text-gray-600 dark:text-gray-300">Manage your team workspace configuration</p>
          </div>

          {/* SECTION 1: Workspace Identity */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Workspace Identity</h2>
              {workspace && (
                <a
                  href={`/workspace/${workspace.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-sage-600 hover:bg-sage-700 text-white font-semibold py-2 px-4 rounded-md text-sm transition"
                >
                  View Public Workspace →
                </a>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
                {isOwner && (
                  <button
                    onClick={handleUpdateName}
                    disabled={updateSettingsMutation.isPending}
                    className="mt-2 bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 px-4 rounded-md disabled:opacity-50 text-sm"
                  >
                    {updateSettingsMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>

              {/* URL / Slug (read-only) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Workspace URL
                </label>
                <input
                  type="text"
                  value={workspace.slug}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 dark:text-gray-400 text-gray-600 cursor-not-allowed"
                />
              </div>

              {/* Created Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Created
                </label>
                <input
                  type="text"
                  value={new Date(workspace.createdAt).toLocaleDateString()}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 dark:text-gray-400 text-gray-600 cursor-not-allowed"
                />
              </div>
            </div>
          </section>

          {/* SECTION 2: Templates */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Workspace Templates</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Apply a template to quickly configure roles and permissions for your team structure.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {TEMPLATES.map((template) => (
                <div
                  key={template.name}
                  className="border-2 border-gray-200 dark:border-gray-600 rounded-lg p-6 hover:border-sage-500 dark:hover:border-sage-400 transition cursor-pointer"
                >
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{template.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{template.description}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
                    Team size: {template.recommendedTeamSize}
                  </p>
                  <button
                    onClick={() => {
                      setPendingTemplate(template.name);
                      setShowTemplateConfirm(true);
                    }}
                    disabled={applyTemplateMutation.isPending || !isOwner}
                    className="w-full bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 px-4 rounded-md disabled:opacity-50 text-sm transition"
                  >
                    {applyTemplateMutation.isPending ? 'Applying...' : 'Apply'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Template Confirmation Modal */}
          {showTemplateConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Apply Template?</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  This will reset your current permissions to match the "{pendingTemplate}" template. Continue?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleApplyTemplate}
                    disabled={applyTemplateMutation.isPending}
                    className="flex-1 bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 px-4 rounded-md disabled:opacity-50"
                  >
                    {applyTemplateMutation.isPending ? 'Applying...' : 'Apply Template'}
                  </button>
                  <button
                    onClick={() => {
                      setShowTemplateConfirm(false);
                      setPendingTemplate(null);
                    }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100 font-bold py-2 px-4 rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: Role & Permission Builder */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Role & Permissions</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Configure what each role can do. OWNER always has all permissions.
            </p>

            {/* Role Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
              {WORKSPACE_ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => setActiveRoleTab(role)}
                  className={`px-6 py-3 font-semibold transition whitespace-nowrap ${
                    activeRoleTab === role
                      ? 'text-sage-600 dark:text-sage-400 border-b-2 border-sage-600 dark:border-sage-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>

            {/* Permission Grid */}
            {permissionsLoading ? (
              <div className="text-center py-8 text-gray-500">Loading permissions...</div>
            ) : (
              <div>
                {PERMISSION_CATEGORIES.map((category) => (
                  <div key={category.name} className="mb-8">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{category.name}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {category.permissions.map((action) => (
                        <label key={action} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedPermissions[action] ?? false}
                            onChange={(e) =>
                              setSelectedPermissions({
                                ...selectedPermissions,
                                [action]: e.target.checked,
                              })
                            }
                            className="w-4 h-4 text-sage-600 rounded"
                            disabled={activeRoleTab === 'OWNER' || !isOwner}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {PERMISSION_DISPLAY_NAMES[action] || action.replace(/_/g, ' ')}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {isOwner && (
                  <div className="flex gap-3 mt-8">
                    <button
                      onClick={handleSavePermissions}
                      disabled={updatePermissionsMutation.isPending}
                      className="bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 px-6 rounded-md disabled:opacity-50"
                    >
                      {updatePermissionsMutation.isPending ? 'Saving...' : 'Save Permissions'}
                    </button>
                    <button
                      onClick={() => setSelectedPermissions({})}
                      className="bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100 font-bold py-2 px-6 rounded-md"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* SECTION 4: Brand Rules */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Brand Rules</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Set guidelines for your team to follow during sales and operations.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Dress Code */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Dress Code
                </label>
                <input
                  type="text"
                  placeholder="e.g., Business casual"
                  value={brandRules.dressCode}
                  onChange={(e) => setBrandRules({ ...brandRules, dressCode: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>

              {/* Customer Service Standards */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Customer Service Standards
                </label>
                <textarea
                  placeholder="e.g., Response time expectations, customer communication guidelines"
                  value={brandRules.customerServiceStandards}
                  onChange={(e) => setBrandRules({ ...brandRules, customerServiceStandards: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>

              {/* Photo Standards */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Photo Standards
                </label>
                <textarea
                  placeholder="e.g., Well-lit, clear photos at 90-degree angles"
                  value={brandRules.photoStandards}
                  onChange={(e) => setBrandRules({ ...brandRules, photoStandards: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>

              {/* Custom Rules */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Custom Rules
                </label>
                <textarea
                  placeholder="Any other guidelines for your team"
                  value={brandRules.customRules}
                  onChange={(e) => setBrandRules({ ...brandRules, customRules: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            {isOwner && (
              <button
                onClick={handleSaveBrandRules}
                disabled={updateSettingsMutation.isPending}
                className="mt-6 bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 px-6 rounded-md disabled:opacity-50"
              >
                {updateSettingsMutation.isPending ? 'Saving...' : 'Save Brand Rules'}
              </button>
            )}
          </section>

          {/* SECTION 5: Cost Calculator */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Cost Calculator</h2>
            {costLoading ? (
              <div className="text-center py-8 text-gray-500">Loading cost breakdown...</div>
            ) : costData ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Breakdown */}
                <div className="space-y-4">
                  <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Base TEAMS Fee</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">${costData.baseFee}/mo</p>
                  </div>

                  <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Current Members</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {costData.currentMembers} / {costData.maxMembers}
                    </p>
                  </div>

                  <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Additional Seats</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {costData.additionalSeats} × $20/mo = ${costData.additionalSeatsCost}/mo
                    </p>
                  </div>

                  {costData.currentMembers >= costData.maxMembers && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-4">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        Your team is at capacity. Additional members are $20/mo each.
                      </p>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="bg-sage-50 dark:bg-sage-900/20 rounded-lg p-6 flex flex-col justify-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Total Monthly Cost</p>
                  <p className="text-4xl font-bold text-sage-700 dark:text-sage-400">${costData.totalMonthlyCost}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">Billed monthly • No setup fee</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">Unable to load cost information</div>
            )}
          </section>

          {/* SECTION 6: Danger Zone */}
          {isOwner && (
            <section className="bg-red-50 dark:bg-red-900/10 border-2 border-red-200 dark:border-red-800 rounded-lg shadow-md p-8">
              <h2 className="text-2xl font-bold text-red-900 dark:text-red-400 mb-4">Danger Zone</h2>
              <p className="text-red-800 dark:text-red-300 mb-6">
                These actions are permanent and cannot be undone.
              </p>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-md transition"
              >
                Delete Workspace
              </button>
            </section>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Delete Workspace?</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  This action is permanent. Type the workspace name to confirm:
                </p>
                <input
                  type="text"
                  placeholder={workspace.name}
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white mb-6"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteWorkspace}
                    disabled={deleteConfirmName !== workspace.name}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-md"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmName('');
                    }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100 font-bold py-2 px-4 rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </TierGate>
  );
}
