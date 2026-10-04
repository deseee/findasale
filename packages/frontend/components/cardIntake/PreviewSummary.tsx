/**
 * PreviewSummary (ADR-134 #642, batch B8): what the file check found, shown at the top of step 2.
 * Counts, catalog notices, the first rows of the file (a table from 768 px up, a list of cards below), and the
 * "change which column is which" panel.
 */
import React from 'react';
import type { FieldInfo, PreviewData, SampleRow, VocabOption } from '../../lib/cardIntake';
import { optionLabel } from '../../lib/cardIntake';
import { INTAKE_COPY, wordingForRowError } from '../../lib/cardIntakeCopy';
import ColumnChooser from './ColumnChooser';
import { cardCls, headingCls, mutedCls, noticeWarnCls } from './ui';

export interface PreviewSummaryProps {
  preview: PreviewData;
  fields: FieldInfo[];
  conditions: readonly VocabOption[];
  finishes: readonly VocabOption[];
  busy: boolean;
  onApplyMapping: (mapping: Record<string, string>) => void;
}

function money(price: number | null): string {
  return price === null ? '' : '$' + price.toFixed(2);
}

function setLine(r: SampleRow): string {
  const parts: string[] = [];
  if (r.setCode) parts.push(r.setCode.toUpperCase());
  else if (r.setName) parts.push(r.setName);
  if (r.collectorNumber) parts.push('#' + r.collectorNumber);
  return parts.join(' ');
}

const Stat: React.FC<{ label: string; value: number; tone?: 'warn' }> = ({ label, value, tone }) => (
  <div className={`min-w-0 rounded-lg border px-3 py-2 ${tone === 'warn' && value > 0 ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20' : 'border-warm-200 bg-warm-50 dark:border-gray-700 dark:bg-gray-900'}`}>
    <dt className="text-xs text-warm-600 dark:text-warm-300">{label}</dt>
    <dd className="text-xl font-semibold tabular-nums text-warm-900 dark:text-warm-100">{value.toLocaleString('en-US')}</dd>
  </div>
);

const PreviewSummary: React.FC<PreviewSummaryProps> = ({ preview, fields, conditions, finishes, busy, onApplyMapping }) => {
  const s = preview.summary;
  const needsLook = s.review.AMBIGUOUS_PRINTING + s.review.FINISH_AMBIGUOUS;
  const sample = preview.sample.slice(0, 10);

  const cellText = (r: SampleRow) => ({
    set: setLine(r),
    finish: r.finish ? optionLabel(finishes, r.finish) : '',
    condition: r.conditionCode ? optionLabel(conditions, r.conditionCode) : '',
    price: money(r.price),
  });

  return (
    <section aria-labelledby="ci-preview-heading" className={cardCls}>
      <h3 id="ci-preview-heading" className={headingCls}>
        {INTAKE_COPY.previewHeading}
      </h3>
      <p className={`mt-1 break-words ${mutedCls}`}>
        {preview.fileName ? INTAKE_COPY.previewFile(preview.fileName) + '. ' : ''}
        {INTAKE_COPY.previewFormat(preview.formatLabel || preview.detectedFormat)}. {INTAKE_COPY.previewRows(preview.rowsTotal)}.
      </p>

      {!preview.catalog.catalogReady ? <p className={`mt-3 ${noticeWarnCls}`}>{INTAKE_COPY.catalogOff}</p> : null}

      <dl className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        <Stat label={INTAKE_COPY.statWillCreate} value={s.willCreate} />
        <Stat label={INTAKE_COPY.statWillMerge} value={s.willMerge} />
        <Stat label={INTAKE_COPY.statNeedsLook} value={needsLook} tone="warn" />
        <Stat label={INTAKE_COPY.statNoMatch} value={s.noCatalogMatch} />
        <Stat label={INTAKE_COPY.statProblems} value={s.errors} tone="warn" />
        <Stat label={INTAKE_COPY.statNeedsPrice} value={s.needsPrice} />
      </dl>

      <h4 className="mt-5 text-sm font-semibold text-warm-900 dark:text-warm-100">{INTAKE_COPY.sampleHeading}</h4>
      {sample.length === 0 ? (
        <p className={`mt-2 ${mutedCls}`}>{INTAKE_COPY.sampleEmpty}</p>
      ) : (
        <>
          {/* Phones and small tablets: one card per row */}
          <ul className="mt-2 space-y-2 md:hidden">
            {sample.map((r) => {
              const c = cellText(r);
              return (
                <li key={r.row} className="min-w-0 rounded-lg border border-warm-200 p-3 text-sm dark:border-gray-700">
                  <p className="break-words font-semibold text-warm-900 dark:text-warm-100">
                    <span className="sr-only">{INTAKE_COPY.sampleRowLabel(r.row)}. </span>
                    {r.name || INTAKE_COPY.problemsFirstBlank}
                  </p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-warm-700 dark:text-warm-300">
                    <div>
                      <dt className="inline text-warm-500 dark:text-gray-400">{INTAKE_COPY.sampleQty}: </dt>
                      <dd className="inline">{r.quantity}</dd>
                    </div>
                    {c.set ? (
                      <div className="min-w-0 break-words">
                        <dt className="inline text-warm-500 dark:text-gray-400">{INTAKE_COPY.sampleSet}: </dt>
                        <dd className="inline">{c.set}</dd>
                      </div>
                    ) : null}
                    {c.finish ? (
                      <div>
                        <dt className="inline text-warm-500 dark:text-gray-400">{INTAKE_COPY.sampleFinish}: </dt>
                        <dd className="inline">{c.finish}</dd>
                      </div>
                    ) : null}
                    {c.condition ? (
                      <div>
                        <dt className="inline text-warm-500 dark:text-gray-400">{INTAKE_COPY.sampleCondition}: </dt>
                        <dd className="inline">{c.condition}</dd>
                      </div>
                    ) : null}
                    {c.price ? (
                      <div>
                        <dt className="inline text-warm-500 dark:text-gray-400">{INTAKE_COPY.samplePrice}: </dt>
                        <dd className="inline">{c.price}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {r.errorCode ? <p className="mt-1 text-red-700 dark:text-red-300">{wordingForRowError(r.errorCode).label}</p> : null}
                </li>
              );
            })}
          </ul>
          {/* From 768 px: a table */}
          <div className="mt-2 hidden md:block">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <caption className="sr-only">{INTAKE_COPY.sampleHeading}</caption>
              <thead>
                <tr className="border-b border-warm-200 text-warm-600 dark:border-gray-700 dark:text-warm-300">
                  <th scope="col" className="w-14 py-2 pr-2 font-medium">
                    {INTAKE_COPY.sampleRowColumn}
                  </th>
                  <th scope="col" className="w-2/5 py-2 pr-2 font-medium">
                    {INTAKE_COPY.sampleCardColumn}
                  </th>
                  <th scope="col" className="py-2 pr-2 font-medium">
                    {INTAKE_COPY.sampleSet}
                  </th>
                  <th scope="col" className="w-14 py-2 pr-2 font-medium">
                    {INTAKE_COPY.sampleQty}
                  </th>
                  <th scope="col" className="py-2 pr-2 font-medium">
                    {INTAKE_COPY.sampleFinish}
                  </th>
                  <th scope="col" className="py-2 pr-2 font-medium">
                    {INTAKE_COPY.sampleCondition}
                  </th>
                  <th scope="col" className="w-20 py-2 font-medium">
                    {INTAKE_COPY.samplePrice}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sample.map((r) => {
                  const c = cellText(r);
                  return (
                    <tr key={r.row} className="border-b border-warm-100 align-top text-warm-800 dark:border-gray-800 dark:text-warm-200">
                      <td className="py-2 pr-2 tabular-nums">{r.row}</td>
                      <td className="break-words py-2 pr-2 font-medium">
                        {r.name || INTAKE_COPY.problemsFirstBlank}
                        {r.errorCode ? <span className="block font-normal text-red-700 dark:text-red-300">{wordingForRowError(r.errorCode).label}</span> : null}
                      </td>
                      <td className="break-words py-2 pr-2">{c.set}</td>
                      <td className="py-2 pr-2 tabular-nums">{r.quantity}</td>
                      <td className="break-words py-2 pr-2">{c.finish}</td>
                      <td className="break-words py-2 pr-2">{c.condition}</td>
                      <td className="py-2 tabular-nums">{c.price}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <details className="mt-5 rounded-lg border border-warm-200 dark:border-gray-700">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-semibold text-warm-800 dark:text-warm-200">
          {INTAKE_COPY.columnsChange}
        </summary>
        <div className="p-3">
          <ColumnChooser headers={preview.headers} fields={fields} detected={preview.columnMapping} busy={busy} warnReset onApply={onApplyMapping} />
        </div>
      </details>
    </section>
  );
};

export default PreviewSummary;
