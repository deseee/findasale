/**
 * UploadStep (ADR-134 #642, batch B8): step 1 of the card intake. Choose a spreadsheet, see what files we can read,
 * set the few optional choices, and check the file.
 *
 * States: formats loading and failed (FormatHints), no file, file chosen, file refused before upload (type, size, empty),
 * uploading (a real percentage from the upload), parsing (the server reading the file; no count is available, so the bar
 * moves without a number), failure (plain wording, plus the column chooser when no name column was found), cancelled.
 */
import React, { useRef } from 'react';
import type { FieldInfo, FormatsInfo, IntakeFailure, IntakeOptions, VocabOption } from '../../lib/cardIntake';
import { INTAKE_COPY } from '../../lib/cardIntakeCopy';
import ColumnChooser from './ColumnChooser';
import ErrorNotice from './ErrorNotice';
import FormatHints from './FormatHints';
import ProgressBar from './ProgressBar';
import { cardCls, formatBytes, headingCls, inputCls, labelCls, mutedCls, noticeInfoCls, noticeWarnCls, primaryBtn, secondaryBtn } from './ui';

export type CheckPhase = 'idle' | 'uploading' | 'parsing';

export interface UploadStepProps {
  formats: FormatsInfo | undefined;
  formatsLoading: boolean;
  formatsFailed: boolean;
  onRetryFormats: () => void;
  games: readonly VocabOption[];
  conditions: readonly VocabOption[];
  file: File | null;
  fileProblem: string | null;
  onFile: (file: File | null) => void;
  options: IntakeOptions;
  onOptions: (next: IntakeOptions) => void;
  phase: CheckPhase;
  uploadPercent: number;
  failure: IntakeFailure | null;
  onDismissFailure: () => void;
  /** Header names of the chosen file, set when the column chooser should show. */
  chooserHeaders: string[] | null;
  chooserFields: FieldInfo[];
  onApplyMapping: (mapping: Record<string, string>) => void;
  onCheck: () => void;
  onCancelCheck: () => void;
  /** True when the last check was stopped by the seller. */
  wasCancelled: boolean;
}

const UploadStep: React.FC<UploadStepProps> = (p) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = p.phase !== 'idle';
  const canCheck = !!p.file && !p.fileProblem && !busy;

  const setOpt = (patch: Partial<IntakeOptions>) => p.onOptions({ ...p.options, ...patch });

  return (
    <div className="space-y-4">
      <section aria-labelledby="ci-upload-heading" className={cardCls}>
        <h3 id="ci-upload-heading" className={headingCls}>
          {INTAKE_COPY.uploadHeading}
        </h3>

        <div className="mt-3">
          <label
            htmlFor="ci-file"
            className={`flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-warm-300 px-4 py-6 text-center text-sm font-semibold text-warm-800 focus-within:ring-2 focus-within:ring-amber-500 hover:border-amber-400 dark:border-gray-600 dark:text-warm-200 ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            <span className="min-w-0 break-words">{p.file ? INTAKE_COPY.changeFile : INTAKE_COPY.chooseFile}</span>
            <input
              id="ci-file"
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
              className="sr-only"
              disabled={busy}
              aria-label={INTAKE_COPY.fileInputLabel}
              onChange={(e) => {
                const chosen = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                p.onFile(chosen);
                // Let the same file be chosen again later (for example after fixing it and saving it).
                e.target.value = '';
              }}
            />
          </label>
          <p className={`mt-2 break-words ${mutedCls}`} aria-live="polite">
            {p.file ? `${p.file.name} (${formatBytes(p.file.size)})` : INTAKE_COPY.noFileChosen}
          </p>
          {p.fileProblem ? (
            <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
              {p.fileProblem}
            </p>
          ) : null}
        </div>

        <details className="mt-4 rounded-lg border border-warm-200 dark:border-gray-700">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-semibold text-warm-800 dark:text-warm-200">
            {INTAKE_COPY.optionsHeading}
          </summary>
          <div className="space-y-3 px-3 pb-3">
            <p className={mutedCls}>{INTAKE_COPY.optionsHint}</p>
            <div>
              <label htmlFor="ci-opt-format" className={labelCls}>
                {INTAKE_COPY.formatLabel}
              </label>
              <select id="ci-opt-format" className={inputCls} value={p.options.format} disabled={busy} onChange={(e) => setOpt({ format: e.target.value })}>
                <option value="auto">{INTAKE_COPY.formatAuto}</option>
                {(p.formats ? p.formats.importers : []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ci-opt-game" className={labelCls}>
                {INTAKE_COPY.gameLabel}
              </label>
              <select id="ci-opt-game" className={inputCls} value={p.options.game} disabled={busy} onChange={(e) => setOpt({ game: e.target.value })}>
                <option value="">{INTAKE_COPY.gameAuto}</option>
                {p.games.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ci-opt-cond" className={labelCls}>
                {INTAKE_COPY.defaultConditionLabel}
              </label>
              <select
                id="ci-opt-cond"
                className={inputCls}
                value={p.options.defaultCondition}
                disabled={busy}
                aria-describedby="ci-opt-cond-hint"
                onChange={(e) => setOpt({ defaultCondition: e.target.value })}
              >
                <option value="">{INTAKE_COPY.defaultConditionNone}</option>
                {p.conditions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p id="ci-opt-cond-hint" className={`mt-1 ${mutedCls}`}>
                {INTAKE_COPY.defaultConditionHint}
              </p>
            </div>
          </div>
        </details>

        {busy ? (
          <div className="mt-4" role="status" aria-live="polite">
            {p.phase === 'uploading' ? (
              <ProgressBar label={INTAKE_COPY.uploading} percent={p.uploadPercent} />
            ) : (
              <>
                <ProgressBar label={INTAKE_COPY.parsing} percent={null} />
                <p className={`mt-2 ${mutedCls}`}>{INTAKE_COPY.parsingHint}</p>
              </>
            )}
            <div className="mt-3">
              <button type="button" onClick={p.onCancelCheck} className={secondaryBtn}>
                {INTAKE_COPY.cancelCheck}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={p.onCheck} disabled={!canCheck} className={primaryBtn}>
              {INTAKE_COPY.checkFile}
            </button>
          </div>
        )}
      </section>

      {p.wasCancelled && !busy && !p.failure ? <p className={noticeInfoCls}>{INTAKE_COPY.checkStopped}</p> : null}
      {p.failure && !busy ? <ErrorNotice failure={p.failure} onDismiss={p.onDismissFailure} /> : null}

      {p.chooserHeaders && !busy ? (
        p.chooserFields.length > 0 ? (
          <ColumnChooser headers={p.chooserHeaders} fields={p.chooserFields} detected={{}} busy={busy} warnReset={false} onApply={p.onApplyMapping} />
        ) : (
          <p className={noticeWarnCls}>{INTAKE_COPY.columnsNoHeaders}</p>
        )
      ) : null}

      <FormatHints formats={p.formats} loading={p.formatsLoading} failed={p.formatsFailed} onRetry={p.onRetryFormats} />

      <section aria-labelledby="ci-resume-heading" className={noticeInfoCls}>
        <h3 id="ci-resume-heading" className="font-semibold text-warm-900 dark:text-warm-100">
          {INTAKE_COPY.resumeHeading}
        </h3>
        <p className="mt-1">{INTAKE_COPY.resumeBody}</p>
      </section>
    </div>
  );
};

export default UploadStep;
