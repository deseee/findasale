/**
 * BulkBar (ADR-138 batch B7): the same change for many cards at once.
 *
 * With nothing selected it offers "Select all" for the tab being shown. With cards selected it shows what can be done:
 * set a condition, set a finish, use the Suggested condition, skip, bring back, remove (after a question). Each button is
 * switched off when none of the selected cards can take that change (lib/cardScanQueue.ts planBulk); the server still has the
 * last word and reports how many it left alone. Suggested conditions are applied only here, by this tap, never on their own.
 */
import React, { useId, useState } from 'react';
import type { BulkExtras, ScanBulkAction, ScanEntry } from '../../lib/cardScan';
import { BULK_MAX_IDS } from '../../lib/cardScan';
import type { VocabOption } from '../../lib/cardIntake';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import { planBulk } from '../../lib/cardScanQueue';
import ScanNotice from './ScanNotice';
import { inputCls, mutedCls, secondaryBtn, smallBtn } from './ui';

export interface BulkBarProps {
  selected: ScanEntry[];
  /** Cards on the current tab that can be selected. */
  selectableCount: number;
  conditions: readonly VocabOption[];
  finishes: readonly VocabOption[];
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onRun: (action: ScanBulkAction, extras: BulkExtras) => void;
}

const BulkBar: React.FC<BulkBarProps> = ({ selected, selectableCount, conditions, finishes, busy, onSelectAll, onClear, onRun }) => {
  const base = useId();
  const [condition, setCondition] = useState('');
  const [finish, setFinish] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (selected.length === 0) {
    return selectableCount > 0 ? (
      <div>
        <button type="button" onClick={onSelectAll} className={smallBtn}>
          {SCAN_COPY.selectAll}
        </button>
      </div>
    ) : null;
  }

  const can = (action: ScanBulkAction, extras: BulkExtras = {}): boolean => planBulk(action, selected, extras).bodies !== null;
  const run = (action: ScanBulkAction, extras: BulkExtras = {}) => {
    setConfirmRemove(false);
    onRun(action, extras);
  };

  return (
    <section
      aria-label={SCAN_COPY.bulkSelected(selected.length)}
      className="sticky bottom-2 z-10 min-w-0 space-y-3 rounded-lg border border-amber-300 bg-white p-3 shadow-lg dark:border-amber-700 dark:bg-gray-800"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="mr-auto text-sm font-semibold text-warm-900 dark:text-warm-100">
          {SCAN_COPY.bulkSelected(selected.length)}
        </p>
        <button type="button" onClick={onSelectAll} className={smallBtn}>
          {SCAN_COPY.selectAll}
        </button>
        <button type="button" onClick={onClear} className={smallBtn}>
          {SCAN_COPY.clearSelection}
        </button>
      </div>
      {selected.length > BULK_MAX_IDS ? <p className={mutedCls}>{SCAN_COPY.bulkTooMany(BULK_MAX_IDS)}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex gap-2">
          <select
            aria-label={SCAN_COPY.bulkSetCondition}
            value={condition}
            disabled={busy}
            onChange={(e) => setCondition(e.target.value)}
            className={`${inputCls} min-w-0 flex-1`}
          >
            <option value="">{SCAN_COPY.chooseCondition}</option>
            {conditions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || condition === '' || !can('SET_CONDITION', { conditionCode: condition })} onClick={() => run('SET_CONDITION', { conditionCode: condition })} className={smallBtn}>
            {SCAN_COPY.bulkApply}
          </button>
        </div>
        <div className="flex gap-2">
          <select aria-label={SCAN_COPY.bulkSetFinish} value={finish} disabled={busy} onChange={(e) => setFinish(e.target.value)} className={`${inputCls} min-w-0 flex-1`}>
            <option value="">{SCAN_COPY.chooseFinish}</option>
            {finishes.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || finish === '' || !can('SET_FINISH', { finish })} onClick={() => run('SET_FINISH', { finish })} className={smallBtn}>
            {SCAN_COPY.bulkApply}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" disabled={busy || !can('USE_SUGGESTED_CONDITION')} onClick={() => run('USE_SUGGESTED_CONDITION')} className={secondaryBtn}>
          {SCAN_COPY.bulkUseSuggested}
        </button>
        <button type="button" disabled={busy || !can('SKIP')} onClick={() => run('SKIP')} className={secondaryBtn}>
          {SCAN_COPY.bulkSkip}
        </button>
        <button type="button" disabled={busy || !can('UNSKIP')} onClick={() => run('UNSKIP')} className={secondaryBtn}>
          {SCAN_COPY.bulkUnskip}
        </button>
        <button type="button" disabled={busy || !can('DELETE')} aria-expanded={confirmRemove} aria-controls={`${base}-remove`} onClick={() => setConfirmRemove(!confirmRemove)} className={secondaryBtn}>
          {SCAN_COPY.bulkDelete}
        </button>
      </div>

      {confirmRemove ? (
        <div id={`${base}-remove`}>
          <ScanNotice tone="warn" text={SCAN_COPY.bulkDeleteConfirm}>
            <button type="button" disabled={busy} onClick={() => run('DELETE')} className={secondaryBtn}>
              {SCAN_COPY.bulkDeleteYes}
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)} className={secondaryBtn}>
              {SCAN_COPY.bulkDeleteNo}
            </button>
          </ScanNotice>
        </div>
      ) : null}
    </section>
  );
};

export default BulkBar;
