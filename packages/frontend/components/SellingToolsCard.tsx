/**
 * SellingToolsCard -- collapsible "Selling tools" quick-access card for the organizer dashboard.
 *
 * Built 2026-09-29 to replace the never-rendered SELLING_TOOLS constant in pages/organizer/dashboard.tsx
 * (specced S350/S367 but never wired). Entries are NOT hand-listed here: they come from
 * lib/organizerNav.ts (entries flagged `quickAccess`), so labels, hrefs and tier requirements are the
 * same ones the sidebar, mobile menu and avatar dropdown use.
 *
 * Tier handling: useOrganizerTier().canAccess() decides each entry. Gated entries the organizer cannot
 * use render dimmed with a lock and a PRO/TEAMS badge and link to /organizer/subscription (the same
 * upgrade destination the nav uses). While the tier is still unknown (auth loading, or the tier could
 * not be resolved) nothing is shown as locked and no upgrade copy is rendered, so a paying organizer is
 * never told to buy a plan they already own; the entries link straight to their pages, which enforce
 * their own gates.
 *
 * Collapsed state is a per-browser convenience kept in localStorage (wrapped in try/catch).
 * Dark mode and phone widths (2-column grid) supported.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Lock } from 'lucide-react';
import { useOrganizerTier } from '../hooks/useOrganizerTier';
import { quickAccessNavEntries } from '../lib/organizerNav';

const STORAGE_KEY = 'dashboard_sellingToolsCollapsed';
const UPGRADE_HREF = '/organizer/subscription';

const SellingToolsCard: React.FC = () => {
  const { canAccess, tierKnown } = useOrganizerTier();
  const [collapsed, setCollapsed] = useState(false);
  const entries = quickAccessNavEntries();

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true);
    } catch {
      // storage unavailable (private window, blocked site data): stay expanded
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  if (entries.length === 0) return null;

  return (
    <section
      aria-labelledby="selling-tools-heading"
      className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="selling-tools-panel"
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <span>
          <span id="selling-tools-heading" className="block text-lg font-semibold text-warm-900 dark:text-warm-100">
            Selling tools
          </span>
          <span className="block text-sm text-warm-600 dark:text-warm-400">Quick access to what you use most</span>
        </span>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-warm-500 dark:text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          aria-hidden="true"
        />
      </button>

      {!collapsed && (
        <div id="selling-tools-panel" className="px-4 sm:px-6 pb-5">
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {entries.map((entry) => {
              const Icon = entry.icon;
              const gated = entry.requiredTier !== 'SIMPLE';
              const locked = gated && tierKnown && !canAccess(entry.requiredTier);
              const href = locked ? UPGRADE_HREF : entry.href;
              return (
                <li key={entry.id}>
                  <Link
                    href={href}
                    title={locked ? `${entry.label} needs ${entry.requiredTier}. Upgrade to unlock.` : entry.title}
                    className={`relative flex h-full flex-col items-start gap-2 rounded-lg border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      locked
                        ? 'border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-900/40 text-warm-500 dark:text-gray-400 hover:border-amber-300 dark:hover:border-amber-700'
                        : 'border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 hover:border-amber-300 dark:hover:border-amber-700'
                    }`}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <Icon
                        className={`h-5 w-5 flex-shrink-0 ${locked ? 'text-warm-400 dark:text-gray-500' : 'text-amber-600 dark:text-amber-400'}`}
                        aria-hidden="true"
                      />
                      {gated && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            locked
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
                              : 'bg-warm-100 dark:bg-gray-700 text-warm-600 dark:text-gray-300'
                          }`}
                        >
                          {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
                          {entry.requiredTier}
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-medium leading-snug">{entry.label}</span>
                    {locked && <span className="sr-only">Requires {entry.requiredTier}. Opens the upgrade page.</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};

export default SellingToolsCard;
