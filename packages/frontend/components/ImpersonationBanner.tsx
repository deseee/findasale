import React from 'react';
import { useAuth } from './AuthContext';

/**
 * Impersonation Banner (2026-09-25, exit-impersonation-adr)
 *
 * Persistent, non-dismissible strip shown for the whole duration of an admin
 * "Log in as" session. Reads user.impersonatedBy, which middleware/auth.ts now
 * forwards from the JWT onto req.user (and therefore GET /auth/me), so this
 * survives a page refresh mid-impersonation -- not just the initial click.
 *
 * Deliberately NOT dismissible: an admin acting as another user with no visible
 * indicator was exactly the gap this feature closes (see the ADR).
 */
const ImpersonationBanner: React.FC = () => {
  const { user, exitImpersonation } = useAuth();

  if (!user?.impersonatedBy) {
    return null;
  }

  const adminLabel = user.impersonatingAdminName || user.impersonatingAdminEmail || 'an admin';

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-amber-950 shadow-md">
      <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            Impersonating <strong>{user.name || user.email}</strong> -- logged in as {adminLabel}
          </span>
        </div>
        <button
          onClick={() => exitImpersonation()}
          className="text-xs font-semibold px-3 py-1 rounded bg-amber-950 text-amber-50 hover:bg-amber-900 transition-colors flex-shrink-0"
        >
          Exit impersonation
        </button>
      </div>
    </div>
  );
};

export default ImpersonationBanner;
