/**
 * Per-platform status chips for the item form, from lib/platformStatusView.ts.
 *  - PlatformChipStrip: the compact strip in the sticky item header (listed platforms only).
 *  - PlatformStatusList: the top of "Where this is listed": listed platforms with their status, then every other
 *    platform collapsed under "Other marketplaces". Extension marketplaces show the prompt text only, never a push button.
 */
import React from 'react';
import type { PlatformChip } from '../../lib/platformStatusView';
import ItemFormSection from './ItemFormSection';

const KIND_CLASS: Record<PlatformChip['kind'], string> = {
  live: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  manual: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  paused: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  quiet: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

export const PlatformChipStrip: React.FC<{
  chips: PlatformChip[];
  onJump: () => void;
  emptyText: string;
}> = ({ chips, onJump, emptyText }) => {
  const listed = chips.filter((c) => c.listed);
  if (listed.length === 0) {
    return <span className="text-[11px] text-warm-500 dark:text-warm-400">{emptyText}</span>;
  }
  return (
    <>
      {listed.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={onJump}
          title="Jump to Where this is listed"
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${KIND_CLASS[chip.kind]}`}
        >
          {chip.short}
        </button>
      ))}
    </>
  );
};

const Row: React.FC<{ chip: PlatformChip }> = ({ chip }) => (
  <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1" data-testid={`platform-chip-${chip.key}`}>
    <span className="text-sm font-medium text-warm-800 dark:text-warm-200">{chip.label}</span>
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${KIND_CLASS[chip.kind]}`}>{chip.long}</span>
    {chip.prompt ? (
      <span className="w-full text-xs text-amber-700 dark:text-amber-400">
        {chip.prompt}. FindA.Sale does not change this listing for you.
      </span>
    ) : null}
  </li>
);

export const PlatformStatusList: React.FC<{ chips: PlatformChip[] }> = ({ chips }) => {
  const listed = chips.filter((c) => c.listed);
  const other = chips.filter((c) => !c.listed);
  return (
    <div data-testid="platform-status-list">
      {listed.length > 0 ? (
        <ul className="divide-y divide-warm-100 dark:divide-gray-700">
          {listed.map((chip) => (
            <Row key={chip.key} chip={chip} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-warm-600 dark:text-warm-300">Not listed on any marketplace yet.</p>
      )}
      <div className="mt-3">
        <ItemFormSection title="Other marketplaces" variant="nested" defaultOpen={false}>
          <ul className="divide-y divide-warm-100 dark:divide-gray-700">
            {other.map((chip) => (
              <Row key={chip.key} chip={chip} />
            ))}
          </ul>
        </ItemFormSection>
      </div>
    </div>
  );
};
