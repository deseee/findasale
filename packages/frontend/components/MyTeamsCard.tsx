import React from 'react';
import Link from 'next/link';
import { useMyWorkspaceMemberships } from '../hooks/useWorkspace';
import Skeleton from './Skeleton';

interface MyTeamsCardProps {
  onWorkspaceClick?: (slug: string) => void;
}

const MyTeamsCard: React.FC<MyTeamsCardProps> = ({ onWorkspaceClick }) => {
  const { data: memberships = [], isLoading, error } = useMyWorkspaceMemberships();

  if (isLoading) {
    return <Skeleton className="h-32 rounded-lg" />;
  }

  if (error || !memberships || memberships.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100">My Teams</h2>
      <div className="grid gap-3">
        {memberships.map((membership) => (
          <Link
            key={membership.workspaceId}
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
        ))}
      </div>
    </div>
  );
};

export default MyTeamsCard;
