/**
 * Workspace Permission Service
 * Manages role-based permissions for team collaboration
 * Queries custom overrides from DB, falls back to system defaults
 */

import { prisma } from '../lib/prisma';
import { WorkspaceRole } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, WORKSPACE_PERMISSIONS } from '../utils/workspacePermissions';

/**
 * Check if a role has a specific permission in a workspace
 * Returns true if role has permission (via custom override or default)
 */
export const checkPermission = async (
  workspaceId: string,
  role: WorkspaceRole,
  permission: string
): Promise<boolean> => {
  try {
    // First check for custom override
    const customOverride = await prisma.workspacePermission.findUnique({
      where: {
        workspaceId_role_action: {
          workspaceId,
          role,
          action: permission,
        },
      },
    });

    if (customOverride) {
      return customOverride.allowed;
    }

    // Fall back to default role permissions
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role] || [];
    return defaultPerms.includes(permission);
  } catch (error) {
    console.error(`[workspacePermissionService] Error checking permission ${permission} for role ${role}:`, error);
    // Fail closed: if we can't verify, deny access
    return false;
  }
};

/**
 * Get all permissions for a role in a workspace
 * If custom overrides exist, they represent the complete permission state.
 * If no overrides exist, fall back to defaults.
 */
export const getPermissionsForRole = async (
  workspaceId: string,
  role: WorkspaceRole
): Promise<string[]> => {
  try {
    // Get custom permissions for this role in this workspace
    const customPerms = await prisma.workspacePermission.findMany({
      where: {
        workspaceId,
        role,
      },
    });

    // If custom overrides exist, they are the source of truth
    if (customPerms.length > 0) {
      return customPerms.filter(p => p.allowed).map(p => p.action);
    }

    // Otherwise fall back to default role permissions
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role] || [];
    return defaultPerms;
  } catch (error) {
    console.error(`[workspacePermissionService] Error fetching permissions for role ${role}:`, error);
    // Return defaults on error
    return DEFAULT_ROLE_PERMISSIONS[role] || [];
  }
};

/**
 * Set custom permissions for a role in a workspace
 * Stores the COMPLETE permission state (allowed and denied)
 * Deletes all existing permissions and recreates from the provided list
 */
export const setPermissionsForRole = async (
  workspaceId: string,
  role: WorkspaceRole,
  permissions: string[]
): Promise<void> => {
  try {
    // Delete all existing custom permissions for this role in this workspace
    await prisma.workspacePermission.deleteMany({
      where: {
        workspaceId,
        role,
      },
    });

    // Get all known permission actions to determine allowed/denied state
    const allPermissions = Object.values(WORKSPACE_PERMISSIONS);
    const permissionSet = new Set(permissions);

    // Create rows for ALL permissions — allowed if in the list, denied if not
    const permissionRows = allPermissions.map(action => ({
      workspaceId,
      role,
      action,
      allowed: permissionSet.has(action),
    }));

    await prisma.workspacePermission.createMany({
      data: permissionRows,
      skipDuplicates: true,
    });
  } catch (error) {
    console.error(
      `[workspacePermissionService] Error setting permissions for role ${role}:`,
      error
    );
    throw error;
  }
};

/**
 * Reset all custom permissions for a workspace to system defaults
 * Removes all WorkspacePermission records, falling back to defaults
 */
export const resetToDefaults = async (workspaceId: string): Promise<void> => {
  try {
    await prisma.workspacePermission.deleteMany({
      where: { workspaceId },
    });
  } catch (error) {
    console.error(
      `[workspacePermissionService] Error resetting workspace ${workspaceId} to defaults:`,
      error
    );
    throw error;
  }
};

/**
 * Apply a workspace template's permissions to a workspace
 * Loads the template from WorkspaceRoleTemplate, sets permissions for each role
 */
export const applyTemplate = async (
  workspaceId: string,
  templateName: string
): Promise<void> => {
  try {
    // Find the template
    const template = await prisma.workspaceRoleTemplate.findUnique({
      where: { name: templateName },
    });

    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Template permissions is a String[] of action names
    const templatePermActions = template.permissions || [];

    // Delete existing custom permissions for this workspace
    await resetToDefaults(workspaceId);

    // Apply template permissions as custom overrides for the MEMBER role
    // (templates define what non-owner roles can do)
    if (templatePermActions.length > 0) {
      await setPermissionsForRole(workspaceId, 'MEMBER' as WorkspaceRole, templatePermActions);
    }
  } catch (error) {
    console.error(
      `[workspacePermissionService] Error applying template '${templateName}' to workspace ${workspaceId}:`,
      error
    );
    throw error;
  }
};
