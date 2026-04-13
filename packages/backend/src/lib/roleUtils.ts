/**
 * Feature #72: Dual-Role Account Schema — Utility Functions
 *
 * Provides backward-compatible role checking for the migration from single-role
 * (User.role string) to multi-role (User.roles array) architecture.
 *
 * During Phase 1-2, both formats are supported:
 * - Old: req.user.role (string: "USER", "ORGANIZER", "ADMIN")
 * - New: req.user.roles (array: ["USER"], ["USER", "ORGANIZER"], etc.)
 *
 * These utilities handle both and should be used by all auth checks.
 */

export interface UserWithRoles {
  role?: string; // Deprecated; kept for backward compatibility
  roles?: string[]; // New array format
  [key: string]: any;
}

/**
 * Check if a user has a specific role (backward compatible).
 * Works with both old single-role format and new multi-role array format.
 */
export function hasRole(user: UserWithRoles | null | undefined, roleToCheck: string): boolean {
  if (!user) return false;

  // Prefer new roles array if present
  if (user.roles && Array.isArray(user.roles)) {
    return user.roles.includes(roleToCheck);
  }

  // Fall back to old single-role string for backward compatibility
  if (user.role) {
    return user.role === roleToCheck;
  }

  return false;
}

/**
 * Check if user is an organizer (convenience wrapper).
 */
export function isOrganizer(user: UserWithRoles | null | undefined): boolean {
  return hasRole(user, "ORGANIZER");
}

/**
 * Check if user is an admin (convenience wrapper).
 */
export function isAdmin(user: UserWithRoles | null | undefined): boolean {
  return hasRole(user, "ADMIN");
}

/**
 * Get all roles a user has.
 * Returns array in both old and new formats.
 */
export function getUserRoles(user: UserWithRoles | null | undefined): string[] {
  if (!user) return [];

  // Prefer new roles array
  if (user.roles && Array.isArray(user.roles)) {
    return user.roles;
  }

  // Fall back to converting single role to array
  if (user.role) {
    return [user.role];
  }

  return [];
}

/**
 * Normalize user roles to new array format.
 * If only old .role is present, converts to .roles array.
 * Safe to call multiple times.
 */
export function normalizeUserRoles(user: UserWithRoles): UserWithRoles {
  if (!user.roles && user.role) {
    user.roles = [user.role];
  }
  return user;
}
