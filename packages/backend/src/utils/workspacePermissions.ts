/**
 * Workspace Permissions Constants and Default Role Mappings
 * Centralizes all permission strings and default role→permission assignments
 */

export const WORKSPACE_PERMISSIONS = {
  // Inventory
  VIEW_INVENTORY: 'view_inventory',
  ADD_ITEMS: 'add_items',
  EDIT_ITEMS: 'edit_items',
  DELETE_ITEMS: 'delete_items',
  BULK_IMPORT: 'bulk_import',
  // Pricing
  VIEW_PRICING: 'view_pricing',
  EDIT_PRICING: 'edit_pricing',
  VIEW_AI_SUGGESTIONS: 'view_ai_suggestions',
  APPROVE_AI_TAGS: 'approve_ai_tags',
  // POS
  PROCESS_POS: 'process_pos',
  VIEW_SALES_ANALYTICS: 'view_sales_analytics',
  VOID_TRANSACTIONS: 'void_transactions',
  // Team
  VIEW_STAFF: 'view_staff',
  INVITE_STAFF: 'invite_staff',
  EDIT_STAFF_ROLES: 'edit_staff_roles',
  VIEW_PERFORMANCE: 'view_performance',
  // Workspace
  MANAGE_WORKSPACE_SETTINGS: 'manage_workspace_settings',
  EDIT_PERMISSIONS: 'edit_permissions',
  VIEW_BILLING: 'view_billing',
  // Communication
  SEND_TEAM_CHAT: 'send_team_chat',
  BROADCAST_ALERTS: 'broadcast_alerts',
  CREATE_TASKS: 'create_tasks',
} as const;

export type WorkspacePermissionKey = typeof WORKSPACE_PERMISSIONS[keyof typeof WORKSPACE_PERMISSIONS];

/**
 * Default role → permission mappings
 * Applied when no custom overrides exist in WorkspacePermission table
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: Object.values(WORKSPACE_PERMISSIONS), // All permissions

  ADMIN: Object.values(WORKSPACE_PERMISSIONS).filter(p => p !== 'view_billing'), // All except billing

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

  // MEMBER is legacy; same as STAFF
  MEMBER: [
    WORKSPACE_PERMISSIONS.VIEW_INVENTORY,
    WORKSPACE_PERMISSIONS.ADD_ITEMS,
    WORKSPACE_PERMISSIONS.VIEW_PRICING,
    WORKSPACE_PERMISSIONS.PROCESS_POS,
    WORKSPACE_PERMISSIONS.SEND_TEAM_CHAT,
  ],

  STAFF: [
    WORKSPACE_PERMISSIONS.VIEW_INVENTORY,
    WORKSPACE_PERMISSIONS.ADD_ITEMS,
    WORKSPACE_PERMISSIONS.VIEW_PRICING,
    WORKSPACE_PERMISSIONS.PROCESS_POS,
    WORKSPACE_PERMISSIONS.SEND_TEAM_CHAT,
  ],

  VIEWER: [
    WORKSPACE_PERMISSIONS.VIEW_INVENTORY,
    WORKSPACE_PERMISSIONS.VIEW_PRICING,
    WORKSPACE_PERMISSIONS.VIEW_STAFF,
    WORKSPACE_PERMISSIONS.VIEW_SALES_ANALYTICS,
  ],
};
