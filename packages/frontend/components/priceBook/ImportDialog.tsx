/**
 * ImportDialog (ADR-140 section 5.5): "Import a price list". The shop's own prices from a CSV file. The file is checked first
 * (a dry run that saves nothing) and the counts are shown before anything is saved. A file with price columns from another
 * site is refused with the plain message the server sends (FOREIGN_PRICE_COLUMN), shown here through the copy module.
 */
import React, { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { priceBookApi, readPriceBookError } from '../../lib/priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI } from '../../lib/priceBookCopy';
import AccessibleModal from '../AccessibleModal';
import {
  dialogContentCls,
  headingCls,
  inputCls,
  labelCls,
  mutedCls,
  noticeErrorCls,
  noticeInfoCls,
  noticeOkCls,
  primaryBtn,
  secondaryBtn,
} from './ui';

/** The size limit the server applies to a price list (ADR-140 section 5.5): 2 MB. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export interface ImportSummary {
  willCreate: number;
  willUpdate: number;
  unresolved: number;
  rejected: Array<{ row: number | null; reason: string }>;
}

function whole(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** Reads the dry run or import answer. Counts that are missing read as 0. Rejected rows keep their row number and reason. */
export function readImportSummary(data: unknown): ImportSummary {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const src = root.summary && typeof root.summary === 'object' ? (root.summary as Record<string, unknown>) : root;
  const rejected: Array<{ row: number | null; reason: string }> = [];
  const list = Array.isArray(src.rejected) ? src.rejected : [];
  list.forEach((x) => {
    const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    const reason = typeof r.reason === 'string' ? r.reason : typeof r.message === 'string' ? r.message : '';
    if (reason) rejected.push({ row: typeof r.row === 'number' ? r.row : null, reason });
  });
  return {
    willCreate: whole(src.willCreate !== undefined ? src.willCreate : src.created),
    willUpdate: whole(src.willUpdate !== undefined ? src.willUpdate : src.updated),
    unresolved: whole(src.unresolved),
    rejected,
  };
}

export interface ImportDialogProps {
  onClose: () => void;
  /** Called after a real import finished, so the list can refresh. */
  onImported: () => void;
}

const ImportDialog: React.FC<ImportDialogProps> = ({ onClose, onImported }) => {
  const baseId = useId();
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [checked, setChecked] = useState<ImportSummary | null>(null);
  const [done, setDone] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');

  const check = useMutation({
    mutationFn: () => priceBookApi.importReferences({ csvText, dryRun: true }),
    onSuccess: (data) => {
      setError('');
      setChecked(readImportSummary(data));
    },
    onError: (err) => {
      setChecked(null);
      setError(readPriceBookError(err).message);
    },
  });

  const run = useMutation({
    mutationFn: () => priceBookApi.importReferences({ csvText, dryRun: false }),
    onSuccess: (data) => {
      setError('');
      setDone(readImportSummary(data));
      onImported();
    },
    onError: (err) => setError(readPriceBookError(err).message),
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files && e.target.files[0];
    setChecked(null);
    setDone(null);
    setError('');
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      setCsvText('');
      setFileName('');
      setError(PRICE_BOOK_UI.importTooBig);
      return;
    }
    try {
      setCsvText(await file.text());
      setFileName(file.name);
    } catch {
      setCsvText('');
      setFileName('');
      setError(PRICE_BOOK_UI.importReadFailed);
    }
  };

  const busy = check.isPending || run.isPending;
  const titleId = `${baseId}-title`;
  const hasText = csvText.trim().length > 0;
  const nothingToSave = checked !== null && checked.willCreate + checked.willUpdate + checked.unresolved === 0;

  return (
    <AccessibleModal isOpen onClose={onClose} ariaLabelledBy={titleId} contentClassName={dialogContentCls}>
      <div className="space-y-4">
        <h2 id={titleId} className={headingCls}>{PRICE_BOOK_COPY.importList}</h2>
        <p className={mutedCls}>{PRICE_BOOK_UI.importHelp}</p>

        <div>
          <label htmlFor={`${baseId}-file`} className={labelCls}>{PRICE_BOOK_UI.importChoose}</label>
          <input
            id={`${baseId}-file`}
            type="file"
            accept=".csv,text/csv"
            className={inputCls}
            disabled={busy}
            onChange={(e) => {
              void onFile(e);
            }}
          />
          {fileName && <p className="mt-1 break-all text-xs text-warm-600 dark:text-warm-400">{fileName}</p>}
        </div>

        <div>
          <label htmlFor={`${baseId}-paste`} className={labelCls}>{PRICE_BOOK_UI.importPaste}</label>
          <textarea
            id={`${baseId}-paste`}
            rows={4}
            className={inputCls}
            value={csvText}
            disabled={busy}
            onChange={(e) => {
              setCsvText(e.target.value);
              setChecked(null);
              setDone(null);
            }}
          />
        </div>

        {error && <p role="alert" className={noticeErrorCls}>{error}</p>}

        {checked && !done && (
          <div role="status" className={noticeInfoCls}>
            <ul className="list-disc space-y-1 pl-5">
              <li>{PRICE_BOOK_UI.importWillCreate(checked.willCreate)}</li>
              <li>{PRICE_BOOK_UI.importWillUpdate(checked.willUpdate)}</li>
              {checked.unresolved > 0 && <li>{PRICE_BOOK_UI.importUnresolved(checked.unresolved)}</li>}
              {checked.rejected.length > 0 && <li>{PRICE_BOOK_UI.importRejected(checked.rejected.length)}</li>}
            </ul>
            {checked.rejected.length > 0 && (
              <ul className="mt-2 max-h-40 list-none space-y-1 overflow-y-auto">
                {checked.rejected.slice(0, 50).map((r, i) => (
                  <li key={`${i}-${r.reason}`} className="break-words text-xs">
                    {r.row === null ? r.reason : PRICE_BOOK_UI.importRow(r.row, r.reason)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {done && (
          <p role="status" className={noticeOkCls}>
            {PRICE_BOOK_UI.importDone(done.willCreate, done.willUpdate)}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryBtn} onClick={onClose} disabled={run.isPending}>
            {done ? PRICE_BOOK_UI.close : PRICE_BOOK_UI.cancel}
          </button>
          {!done && (
            <button type="button" className={secondaryBtn} disabled={busy || !hasText} onClick={() => check.mutate()}>
              {check.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_UI.importCheck}
            </button>
          )}
          {!done && (
            <button type="button" className={primaryBtn} disabled={busy || !checked || nothingToSave} onClick={() => run.mutate()}>
              {run.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_UI.importRun}
            </button>
          )}
        </div>
      </div>
    </AccessibleModal>
  );
};

export default ImportDialog;
