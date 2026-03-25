import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Skeleton from '../../components/Skeleton';

interface WorkspacePublicData {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  ownerName: string;
}

export default function PublicWorkspacePage() {
  const router = useRouter();
  const { slug } = router.query;

  const { data: workspace, isLoading, isError } = useQuery({
    queryKey: ['workspace-public', slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await axios.get(`/api/workspace/public/${slug}`);
      return data as WorkspacePublicData;
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Workspace | FindA.Sale</title>
        </Head>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Skeleton className="h-8 mb-4 w-1/2" />
          <Skeleton className="h-64" />
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
              We couldn't find the workspace you're looking for. It may have been deleted or the link may be incorrect.
            </p>
            <a
              href="/"
              className="inline-block bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Back to Home
            </a>
          </div>
        </div>
      </>
    );
  }

  const createdDate = new Date(workspace.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Layout>
      <Head>
        <title>{workspace.name} | FindA.Sale</title>
        <meta name="description" content={`Team workspace for ${workspace.name} on FindA.Sale`} />
      </Head>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Workspace Header */}
        <div className="mb-8">
          <a href="/" className="text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 text-sm font-medium mb-4 inline-block">
            ← Back to FindA.Sale
          </a>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              {workspace.name}
            </h1>
            <p className="text-warm-600 dark:text-warm-400">
              A team workspace for organizers collaborating on estate sales
            </p>
          </div>

          {/* Workspace Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Team Members</p>
              <p className="text-2xl font-bold text-warm-900 dark:text-warm-100 mt-1">
                {workspace.memberCount}
              </p>
            </div>

            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Workspace Lead</p>
              <p className="text-lg font-semibold text-warm-900 dark:text-warm-100 mt-1 truncate">
                {workspace.ownerName}
              </p>
            </div>

            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Created</p>
              <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mt-1">
                {createdDate}
              </p>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-sage-50 dark:bg-sage-900/20 border border-sage-200 dark:border-sage-800 rounded-lg p-4">
            <h3 className="font-semibold text-sage-900 dark:text-sage-100 mb-2">About This Workspace</h3>
            <p className="text-sm text-sage-800 dark:text-sage-200">
              This workspace is a collaboration hub where team members can manage sales, coordinate inventory, and share resources. Team members have secured access to contribute to the workspace.
            </p>
          </div>

          {/* CTA Section */}
          <div className="mt-8 pt-6 border-t border-warm-200 dark:border-gray-700">
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              Looking to join this team? Contact the workspace lead to request an invitation.
            </p>
            <a
              href="/"
              className="inline-block bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Back to FindA.Sale
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
