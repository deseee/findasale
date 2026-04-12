/**
 * Workspace Role Templates
 * Pre-defined permission templates for different team structures
 * Applied during workspace creation or role configuration
 */

import { WORKSPACE_PERMISSIONS } from './workspacePermissions';

export interface WorkspaceTemplate {
  name: string;
  description: string;
  isSystemDefault?: boolean;
  // roles: Record<WorkspaceRole, string[]>
  roles: Record<string, string[]>;
}

/**
 * System-defined templates
 * Each template defines role → permissions mapping
 */
export const WORKSPACE_TEMPLATES: Record<string, WorkspaceTemplate> = {
  EMPTY: {
    name: 'Empty',
    description: 'Blank workspace with no preset roles',
    isSystemDefault: false,
    roles: {},
  },

  SOLO: {
    name: 'Solo',
    description: 'Just you — full admin control',
    isSystemDefault: true,
    roles: {
      OWNER: Object.values(WORKSPACE_PERMISSIONS),
    },
  },

  TWO_PERSON: {
    name: '2-Person Team',
    description: 'You + 1 assistant',
    isSystemDefault: true,
    roles: {
      OWNER: Object.values(WORKSPACE_PERMISSIONS),
      MEMBER: [
        WORKSPACE_PERMISSIONS.VIEW_INVENTORY,
        WORKSPACE_PERMISSIONS.ADD_ITEMS,
        WORKSPACE_PERMISSIONS.VIEW_PRICING,
        WORKSPACE_PERMISSIONS.PROCESS_POS,
        WORKSPACE_PERMISSIONS.SEND_TEAM_CHAT,
      ],
    },
  },

  FIVE_PERSON: {
    name: '5-Person Team',
    description: 'Full team with managers and members',
    isSystemDefault: true,
    roles: {
      OWNER: Object.values(WORKSPACE_PERMISSIONS),
      MANAGER: [
        WORKSPACE_PERMISSIONS.VIEW_INVENTORY,
        WORKSPACE_PERMISSIONS.ADD_ITEMS,
        WORKSPACE_PERMISSIONS.EDIT_ITEMS,
        WORKSPACE_PERMISSIONS.VIEW_PRICING,
        WORKSPACE_PERMISSIONS.EDIT_PRICING,
        WORKSPACE_PERMISSIONS.VIEW_AI_SUGGESTIONS,
        WORKSPACE_PERMISSIONS.APPROVE_AI_TAGS,
        WORKSPACE_PERMISSIONS.PROCESS_POS,
        WORKSPACE_PERMISSIONS.VIEW_SALES_ANALYTICS,
        WORKSPACE_PERMISSIONS.VIEW_STAFF,
        WORKSPACE_PERMISSIONS.VIEW_PERFORMANCE,
        WORKSPACE_PERMISSIONS.SEND_TEAM_CHAT,
        WORKSPACE_PERMISSIONS.CREATE_TASKS,
      ],
      MEMBER: [
        WORKSPACE_PERMISSIONS.VIEW_INVENTORY,
        WORKSPACE_PERMISSIONS.ADD_ITEMS,
        WORKSPACE_PERMISSIONS.VIEW_PRICING,
        WORKSPACE_PERMISSIONS.PROCESS_POS,
        WORKSPACE_PERMISSIONS.SEND_TEAM_CHAT,
      ],
    },
  },

  CUSTOM: {
    name: 'Custom',
    description: 'Build your own permission set',
    isSystemDefault: false,
    roles: {},
  },
};

/**
 * Get a template by name
 */
export const getTemplate = (templateName: string): WorkspaceTemplate | undefined => {
  return WORKSPACE_TEMPLATES[templateName.toUpperCase()];
};

/**
 * Get all system default templates (for UI dropdowns, workspace setup)
 */
export const getDefaultTemplates = (): WorkspaceTemplate[] => {
  return Object.values(WORKSPACE_TEMPLATES).filter(t => t.isSystemDefault);
};

/**
 * Serialize template permissions to JSON for storage in WorkspaceRoleTemplate.permissions
 */
export const serializeTemplatePermissions = (template: WorkspaceTemplate): string => {
  return JSON.stringify(template.roles);
};

/**
 * Parse stored template permissions from JSON
 */
export const parseTemplatePermissions = (
  permissionsJson: string
): Record<string, string[]> => {
  try {
    return JSON.parse(permissionsJson);
  } catch (error) {
    console.error('[workspaceTemplates] Failed to parse permissions JSON:', error);
    return {};
  }
};
