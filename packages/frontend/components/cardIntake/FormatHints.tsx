/**
 * FormatHints (ADR-134 #642, batch B8): the file types the intake can read, with the how-to line for each.
 * The names and hints come from GET /api/card-intake/formats.
 */
import React from 'react';
import type { FormatsInfo } from '../../lib/cardIntake';
import { INTAKE_COPY } from '../../lib/cardIntakeCopy';
import Skeleton from '../Skeleton';
import { cardCls, headingCls, noticeWarnCls, secondaryBtn } from './ui';

export interface FormatHintsProps {
  formats: FormatsInfo | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}

const FormatHints: React.FC<FormatHintsProps> = ({ formats, loading, failed, onRetry }) => (
  <section aria-labelledby="ci-formats-heading" className={cardCls}>
    <h3 id="ci-formats-heading" className={headingCls}>
      {INTAKE_COPY.formatsHeading}
    </h3>
    {loading ? (
      <div role="status" aria-live="polite" className="mt-3 space-y-2">
        <span className="sr-only">{INTAKE_COPY.formatsLoading}</span>
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
        <Skeleton className="h-5 w-4/6" />
      </div>
    ) : failed || !formats ? (
      <div className={`mt-3 ${noticeWarnCls}`}>
        <p>{INTAKE_COPY.formatsError}</p>
        <button type="button" onClick={onRetry} className={`mt-2 ${secondaryBtn}`}>
          {INTAKE_COPY.formatsRetry}
        </button>
      </div>
    ) : (
      <>
        <ul className="mt-3 space-y-2 text-sm text-warm-700 dark:text-warm-300">
          {formats.importers.map((f) => (
            <li key={f.id} className="break-words">
              {f.hint || f.label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-warm-600 dark:text-warm-300">
          {INTAKE_COPY.limitsRows(formats.limits.maxRows)} {INTAKE_COPY.limitsSize(formats.limits.maxFileMb)}
        </p>
      </>
    )}
  </section>
);

export default FormatHints;
