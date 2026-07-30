import React from 'react';
import Link from 'next/link';
import { useMyWorkspaceMemberships } from '../hooks/useWorkspace';
import Skeleton from './Skeleton';

interface MyTeamsCardProps {
  onWorkspaceClick?: (slug: string) => void;
  // Added 2026-07-30, mirrors MyVendorBoothsCard's variant prop: 'card' (default,
  // embedded on the organizer dashboard) stays silent on loading/error/empty exactly
  // as before. 'page' is for pages/team/registers.tsx -- the one surface a plain team
  // member (no ORGANIZER role) can actually reach, so it needs real loading/error/empty
  // states instead of going silent.
  variant?: 'card' | 'page';
}

const MyTeamsCard: React.FC<MyTeamsCardProps> = ({ onWorkspaceClick, variant = 'card' }) => {
  const { data: memberships = [], isLoading, error, refetch } = useMyWorkspaceMemberships();
  const isPage = variant === 'page';

  if (!isPage && (isLoading || error || !memberships || memberships.length === 0)) {
    return null;
  }

  if (isPage && isLoading) {
    return <Skeleton className="h-32 rounded-lg" />;
  }

  if (isPage && error) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
        <p className="text-warm-900 dark:text-warm-100 font-medium mb-1">We could not load your teams.</p>
        <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
          The connection may have dropped. Your team memberships are safe.
        </p>
        <button
          onClick={() => refetch()}
          className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (isPage && memberships.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
        <p className="text-warm-900 dark:text-warm-100 font-medium mb-1">You are not on a team yet.</p>
        <p className="text-sm text-warm-600 dark:text-warm-400">
          When an organizer adds you to their team, you will see it here. If they also turn on
          register access, the register for their venue shows up here too.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100">My Teams</h2>
      <div className="grid gap-3">
        {memberships.map((membership) => (
          <React.Fragment key={membership.workspaceId}>
            <Link
              href={`/workspace/${membership.workspaceSlug}`}
              onClick={() => onWorkspaceClick?.(membership.workspaceSlug)}
              className="block p-4 border border-warm-200 dark:border-gray-700 rounded-lg hover:shadow-md dark:hover:bg-gray-800/50 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-warm-900 dark:text-warm-100">
                    {membership.workspaceName}
                  </h3>
                  <p className="text-sm text-warm-500 dark:text-warm-400 mt-1">
                    {membership.role}
                  </p>
                </div>
                <span className="text-amber-500 text-lg">→</span>
              </div>
            </Link>

            {/* Register access (2026-07-30, Patrick-directed): the ONLY nav-reachable
                entry point for a plain team member's granted register -- mirrors the
                "Open the register" pattern in MyVendorBoothsCard.tsx, but authenticates
                via this member's own workspace JWT (requireBoothTokenOrTeamMember's
                TEAM_MEMBER branch) instead of a booth token, so no boothToken param is
                needed on the link. */}
            {membership.registerAccessGranted && membership.hubs.length > 0 && (
              <div className="-mt-2 flex flex-wrap gap-2">
                {membership.hubs.map((hub) => (
                  <Link
                    key={hub.id}
                    href={`/organizer/pos?venue=${hub.id}`}
                    className="text-center bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm"
                  >
                    Open the register for {hub.name}
                  </Link>
                ))}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default MyTeamsCard;
