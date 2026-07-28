/**
 * Persistent sub-nav for the 3 organizer-facing Market Hub management pages
 * (Hub Details / Vendor Booths / Register), so an organizer moving between
 * them never loses their place. Warm-* palette to match the vendor-booths
 * and cart pages, regardless of which of the 3 pages this renders on.
 */

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useHubById } from '../hooks/useHubs';

interface HubManagementNavProps {
  hubId: string;
}

export default function HubManagementNav({ hubId }: HubManagementNavProps) {
  const router = useRouter();
  const { data } = useHubById(hubId);
  const hubName = data?.hub?.name;

  const tabs = [
    { label: 'Hub Details', href: `/organizer/hubs/${hubId}/manage` },
    { label: 'Vendor Booths', href: `/organizer/hubs/${hubId}/vendor-booths` },
    { label: 'Register', href: `/organizer/hubs/${hubId}/cart` },
  ];

  // asPath (not pathname) is needed here because pathname is the dynamic route
  // template (e.g. "/organizer/hubs/[hubId]/manage") and won't match the real
  // hubId-bearing href we're comparing against.
  const currentPath = router.asPath.split('?')[0].split('#')[0];

  return (
    <div className="mb-6">
      {hubName && (
        <p className="text-sm font-medium text-warm-500 dark:text-warm-400 mb-2">{hubName}</p>
      )}
      <nav className="flex gap-1 border-b border-warm-200 dark:border-gray-700" aria-label="Hub management">
        {tabs.map((tab) => {
          const isActive = currentPath === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                isActive
                  ? 'border-amber-600 text-amber-700 dark:text-amber-400'
                  : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
