import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import Skeleton from '../../components/Skeleton';

interface PublishedSale {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  city: string;
}

interface WorkspacePublicData {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  ownerName: string;
  ownerUserId: string | null;
  publishedSales: PublishedSale[];
}

export default function PublicWorkspacePage() {
  const router = useRouter();
  const { slug } = router.query;

  const { data: workspace, isLoading, isError } = useQuery({
    queryKey: ['workspace-public', slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await api.get(`/workspace/public/${slug}`);
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
    <>
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

          {/* Published Sales Section */}
          <div className="mt-8 pt-6 border-t border-warm-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Upcoming Sales
            </h2>
            {workspace.publishedSales && workspace.publishedSales.length > 0 ? (
              <div className="space-y-3">
                {workspace.publishedSales.map((sale) => {
                  const startDate = new Date(sale.startDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  });
                  const endDate = new Date(sale.endDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <a
                      key={sale.id}
                      href={`/sales/${sale.id}`}
                      className="block bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md hover:border-sage-300 dark:hover:border-sage-600 transition"
                    >
                      <p className="font-semibold text-warm-900 dark:text-warm-100 mb-1">
                        {sale.title}
                      </p>
                      <p className="text-sm text-warm-600 dark:text-warm-400">
                        {startDate} — {endDate} • {sale.city}
                      </p>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-6 text-center">
                <p className="text-warm-600 dark:text-warm-400">
                  No upcoming sales — check back soon.
                </p>
              </div>
            )}
          </div>

          {/* Contact Section */}
          <div className="mt-8 pt-6 border-t border-warm-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-warm-600 dark:text-warm-400">
              Questions about this workspace or its sales?
            </p>
            <a
              href={workspace.ownerUserId ? `/messages?to=${workspace.ownerUserId}` : '/'}
              className="inline-block bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Message {workspace.ownerName}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
