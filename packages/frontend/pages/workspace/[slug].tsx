import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import Skeleton from '../../components/Skeleton';
import useAuthStore from '../../lib/stores/useAuthStore';

interface WorkspaceMember {
  id: string;
  organizerId: string;
  role: string;
  acceptedAt: string | null;
  organizer: {
    id: string;
    businessName: string;
    profilePhoto?: string;
    user?: { email: string };
  };
}

interface WorkspaceInternal {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  ownerId: string;
  owner: {
    id: string;
    user: { id: string; name?: string; email: string };
  };
  members: WorkspaceMember[];
  settings?: {
    description?: string;
  };
}

export default function WorkspacePage() {
  const router = useRouter();
  const { slug } = router.query;
  const { user, isLoading: authLoading } = useAuthStore();

  const { data: workspace, isLoading, isError } = useQuery({
    queryKey: ['workspace-internal', slug],
    queryFn: async () => {
      if (!slug) return null;
      try {
        const { data } = await api.get(`/workspace`);
        // Filter by slug to verify the user is a member of this workspace
        if (data?.slug === slug) return data as WorkspaceInternal;
        // If no workspace found or slug doesn't match, throw error
        throw new Error('Workspace not found or you are not a member');
      } catch (error: any) {
        // 404 or other errors mean the user doesn't have access
        throw new Error('Workspace not found or you are not a member');
      }
    },
    enabled: !!slug && !authLoading && !!user,
    retry: 1,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`);
    }
  }, [user, authLoading, router]);

  if (authLoading || isLoading) {
    return (
      <>
        <Head>
          <title>Workspace | FindA.Sale</title>
        </Head>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Skeleton className="h-8 mb-4 w-1/2" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </>
    );
  }

  if (isError || !workspace) {
    return (
      <>
        <Head>
          <title>Workspace Not Found | FindA.Sale</title>
        </Head>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
            <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Workspace Not Found
            </h1>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              We couldn't find the workspace you're looking for. You may not be a member of this workspace.
            </p>
            <a
              href="/organizer/dashboard"
              className="inline-block bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </>
    );
  }

  const acceptedMembers = workspace.members.filter((m) => m.acceptedAt !== null);
  const createdDate = new Date(workspace.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <Head>
        <title>{workspace.name} Workspace | FindA.Sale</title>
        <meta name="description" content={`Team collaboration workspace for ${workspace.name}`} />
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Workspace Header */}
        <div className="mb-8">
          <a
            href="/organizer/dashboard"
            className="text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 text-sm font-medium mb-4 inline-block"
          >
            ← Back to Dashboard
          </a>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                {workspace.name}
              </h1>
              <p className="text-warm-600 dark:text-warm-400">
                Team collaboration hub
              </p>
            </div>
            <a
              href={`/organizer/workspace`}
              className="inline-block bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold py-2 px-6 rounded-lg transition whitespace-nowrap"
            >
              Workspace Settings
            </a>
          </div>

          {/* Workspace Description */}
          {workspace.settings?.description && (
            <div className="mb-6 bg-warm-50 dark:bg-gray-700 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-warm-600 dark:text-warm-400 mb-2">
                About This Workspace
              </h3>
              <p className="text-warm-900 dark:text-warm-100 leading-relaxed">
                {workspace.settings.description}
              </p>
            </div>
          )}

          {/* Workspace Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Team Members</p>
              <p className="text-2xl font-bold text-warm-900 dark:text-warm-100 mt-1">
                {acceptedMembers.length + 1}
              </p>
            </div>

            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Workspace Owner</p>
              <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mt-1 truncate">
                {workspace.owner?.user?.name || workspace.owner?.user?.email || 'Unknown'}
              </p>
            </div>

            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Created</p>
              <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mt-1">
                {createdDate}
              </p>
            </div>

            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Workspace ID</p>
              <p className="text-xs font-mono text-warm-900 dark:text-warm-100 mt-1 truncate">
                {workspace.id}
              </p>
            </div>
          </div>
        </div>

        {/* Two-column layout for team and activity */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Team Members Section - Left Column (spans 1) */}
          <div className="md:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                Team Members
              </h2>

              {/* Owner */}
              <div className="mb-4 pb-4 border-b border-warm-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  {workspace.owner?.id && (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sage-400 to-sage-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {(workspace.owner?.user?.name || workspace.owner?.user?.email || 'O')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm">
                      {workspace.owner?.user?.name || workspace.owner?.user?.email || 'Owner'}
                    </p>
                    <p className="text-xs text-warm-600 dark:text-warm-400">
                      Owner
                    </p>
                  </div>
                </div>
              </div>

              {/* Other Members */}
              {acceptedMembers.length > 0 ? (
                <div className="space-y-4">
                  {acceptedMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-warm-300 to-warm-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {(member.organizer?.businessName || member.organizer?.user?.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm truncate">
                          {member.organizer?.businessName || member.organizer?.user?.email}
                        </p>
                        <p className="text-xs text-warm-600 dark:text-warm-400 capitalize">
                          {member.role.toLowerCase()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-sm text-warm-600 dark:text-warm-400">
                    No team members yet. Invite members in workspace settings.
                  </p>
                </div>
              )}

              {/* Pending Invitations */}
              {workspace.members.some((m) => !m.acceptedAt) && (
                <div className="mt-6 pt-6 border-t border-warm-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-warm-600 dark:text-warm-400 mb-3 uppercase">
                    Pending Invitations
                  </p>
                  <div className="space-y-3">
                    {workspace.members
                      .filter((m) => !m.acceptedAt)
                      .map((member) => (
                        <div key={member.id} className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
                          <p className="text-xs text-warm-600 dark:text-warm-400 truncate">
                            {member.organizer?.user?.email}
                          </p>
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium ml-auto flex-shrink-0">
                            Pending
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activity & Features - Right Column (spans 2) */}
          <div className="md:col-span-2 space-y-6">
            {/* Coming Soon - Activity Feed */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                Team Activity
              </h2>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <span className="font-semibold">Coming soon:</span> Real-time activity feed showing items sold, team events, and notifications.
                </p>
              </div>
            </div>

            {/* Coming Soon - Team Communication */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                Team Communications
              </h2>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <span className="font-semibold">Coming soon:</span> Per-sale team chat and broadcast messages for quick team coordination.
                </p>
              </div>
            </div>

            {/* Coming Soon - Tasks & Assignments */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                Tasks & Assignments
              </h2>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <span className="font-semibold">Coming soon:</span> Assign tasks to team members based on skills and availability.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="/organizer/workspace"
              className="block bg-warm-50 dark:bg-gray-700 hover:bg-warm-100 dark:hover:bg-gray-600 border border-warm-200 dark:border-gray-600 rounded-lg p-4 transition text-center"
            >
              <p className="font-semibold text-warm-900 dark:text-warm-100 mb-1">Manage Workspace</p>
              <p className="text-xs text-warm-600 dark:text-warm-400">Settings, members, roles</p>
            </a>

            <a
              href="/organizer/dashboard"
              className="block bg-sage-50 dark:bg-gray-700 hover:bg-sage-100 dark:hover:bg-gray-600 border border-sage-200 dark:border-gray-600 rounded-lg p-4 transition text-center"
            >
              <p className="font-semibold text-warm-900 dark:text-warm-100 mb-1">View Sales</p>
              <p className="text-xs text-warm-600 dark:text-warm-400">All your active sales</p>
            </a>

            <a
              href="/organizer/dashboard"
              className="block bg-amber-50 dark:bg-gray-700 hover:bg-amber-100 dark:hover:bg-gray-600 border border-amber-200 dark:border-gray-600 rounded-lg p-4 transition text-center"
            >
              <p className="font-semibold text-warm-900 dark:text-warm-100 mb-1">Create Sale</p>
              <p className="text-xs text-warm-600 dark:text-warm-400">Start a new event</p>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
