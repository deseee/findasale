/**
 * ScanQueue (ADR-138 batch B7): the review queue.
 *
 * Four tabs (Needs a decision / Ready / Skipped / Committed) over the cards of one scan, identical cards counted together,
 * a bulk bar for many cards at once, and a card for each entry. Every region has its own empty, loading and error wording.
 * The tab, the selection and the "show more" count are this component's own state; the cards come from the server.
 * A long list shows 40 groups at a time so a phone stays quick.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { VocabOption } from '../../lib/cardIntake';
import type { BulkExtras, ScanBulkAction, ScanEntry, ScanEntryPatch, ScanSession } from '../../lib/cardScan';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import {
  SCAN_FILTERS,
  canEditEntry,
  defaultFilter,
  emptyMessage,
  emptySelection,
  filterEntries,
  filterTabs,
  groupEntries,
  pruneSelection,
  selectFiltered,
  selectedCount,
  selectedEntries,
  toggleSelected,
} from '../../lib/cardScanQueue';
import type { ScanFilter, Selection } from '../../lib/cardScanQueue';
import BulkBar from './BulkBar';
import ScanEntryCard from './ScanEntryCard';
import ScanNotice from './ScanNotice';
import TabBar, { panelId, tabId } from './TabBar';
import { headingCls, mutedCls, secondaryBtn } from './ui';
import Skeleton from '../Skeleton';

const GROUPS_PER_PAGE = 40;
const ID_BASE = 'cs-filter';

export interface ScanQueueProps {
  entries: ScanEntry[];
  session: ScanSession | null;
  loading: boolean;
  refreshFailed: boolean;
  busy: boolean;
  savingIds: Record<string, true>;
  thumbs: Record<string, string>;
  imageCache: Record<string, string>;
  conditions: readonly VocabOption[];
  finishes: readonly VocabOption[];
  onChange: (entryId: string, patch: ScanEntryPatch) => void;
  onRememberImage: (printingId: string, imageUrl: string | null) => void;
  onBulk: (action: ScanBulkAction, selected: ScanEntry[], extras: BulkExtras) => Promise<boolean>;
}

const ScanQueue: React.FC<ScanQueueProps> = ({
  entries,
  session,
  loading,
  refreshFailed,
  busy,
  savingIds,
  thumbs,
  imageCache,
  conditions,
  finishes,
  onChange,
  onRememberImage,
  onBulk,
}) => {
  const [chosenFilter, setChosenFilter] = useState<ScanFilter | null>(null);
  const [selection, setSelection] = useState<Selection>(emptySelection());
  const [limit, setLimit] = useState(GROUPS_PER_PAGE);

  const active: ScanFilter = chosenFilter || defaultFilter(entries);
  const tabs = filterTabs(entries, active);
  const visible = filterEntries(entries, active);
  const groups = groupEntries(visible);
  const shown = groups.slice(0, limit);
  const chosen = selectedEntries(selection, entries);

  // Drop selections for cards that were removed or can no longer be changed.
  useEffect(() => {
    setSelection((sel) => {
      const next = pruneSelection(sel, entries);
      return selectedCount(next) === selectedCount(sel) ? sel : next;
    });
  }, [entries]);

  const changeTab = (id: string) => {
    const hit = SCAN_FILTERS.filter((f) => f === id)[0];
    if (!hit) return;
    setChosenFilter(hit);
    setLimit(GROUPS_PER_PAGE);
  };

  const toggle = useCallback((entryId: string) => setSelection((sel) => toggleSelected(sel, entryId)), []);

  const runBulk = async (action: ScanBulkAction, extras: BulkExtras) => {
    const ok = await onBulk(action, chosen, extras);
    if (ok) setSelection(emptySelection());
  };

  const selectableOnTab = selectedCount(selectFiltered(entries, active));
  const editableSession = !!session && session.status === 'OPEN';

  const renderCard = (e: ScanEntry) => (
    <ScanEntryCard
      key={e.id}
      entry={e}
      editable={canEditEntry(e, session)}
      saving={savingIds[e.id] === true}
      thumbUrl={thumbs[e.id] || null}
      imageCache={imageCache}
      conditions={conditions}
      finishes={finishes}
      selected={selection[e.id] === true}
      onToggleSelect={toggle}
      onChange={onChange}
      onRememberImage={onRememberImage}
    />
  );

  return (
    <section aria-labelledby="cs-queue-heading" className="min-w-0 space-y-4">
      <h2 id="cs-queue-heading" className={headingCls}>
        {SCAN_COPY.queueHeading}
      </h2>

      {refreshFailed ? <ScanNotice tone="warn" text={SCAN_COPY.refreshFailed} /> : null}

      {loading ? (
        <div role="status" aria-label={SCAN_COPY.loadingEntries} className="space-y-3">
          <p className={mutedCls}>{SCAN_COPY.loadingEntries}</p>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3 rounded-lg border border-warm-200 p-3 dark:border-gray-700">
              <Skeleton className="h-40 w-28" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <ScanNotice tone="info" text={SCAN_COPY.emptyAll} />
      ) : (
        <>
          <TabBar tabs={tabs.map((t) => ({ id: t.filter, label: t.text }))} active={active} onChange={changeTab} ariaLabel={SCAN_COPY.filtersLabel} idBase={ID_BASE} />

          <div id={panelId(ID_BASE)} role="tabpanel" aria-labelledby={tabId(ID_BASE, active)} className="min-w-0 space-y-3">
            {editableSession && active !== 'COMMITTED' ? (
              <BulkBar
                selected={chosen}
                selectableCount={selectableOnTab}
                conditions={conditions}
                finishes={finishes}
                busy={busy}
                onSelectAll={() => setSelection(selectFiltered(entries, active))}
                onClear={() => setSelection(emptySelection())}
                onRun={(action, extras) => {
                  void runBulk(action, extras);
                }}
              />
            ) : null}

            {visible.length === 0 ? (
              <p className={mutedCls}>{emptyMessage(active)}</p>
            ) : (
              <ul className="space-y-3">
                {shown.map((g) =>
                  g.entries.length > 1 ? (
                    <li key={g.key}>
                      <section aria-label={SCAN_COPY.groupCount(g.copies)} className="min-w-0 space-y-2 rounded-lg border-l-4 border-amber-500 bg-warm-50 p-2 dark:bg-gray-900">
                        <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{SCAN_COPY.groupCount(g.copies)}</p>
                        {g.held > 0 ? <p className={mutedCls}>{SCAN_COPY.groupHeldNote(g.held)}</p> : null}
                        <div className="space-y-2">{g.entries.map(renderCard)}</div>
                      </section>
                    </li>
                  ) : (
                    <li key={g.key}>{renderCard(g.first)}</li>
                  ),
                )}
              </ul>
            )}

            {groups.length > shown.length ? (
              <div className="flex flex-col items-start gap-2">
                <p className={mutedCls}>{SCAN_COPY.showingCount(shown.length, groups.length)}</p>
                <button type="button" onClick={() => setLimit(limit + GROUPS_PER_PAGE)} className={secondaryBtn}>
                  {SCAN_COPY.showMore}
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
};

export default ScanQueue;
