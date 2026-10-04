/**
 * ProgressBar (ADR-134 #642, batch B8): a labelled bar for the upload and the import.
 * `percent` null shows a moving bar for work that has no count (reading a file on the server).
 */
import React from 'react';

export interface ProgressBarProps {
  label: string;
  percent: number | null;
  /** Text under the bar, for example "400 of 2,000 rows". */
  detail?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, percent, detail }) => {
  const known = percent !== null;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 break-words font-medium text-warm-900 dark:text-warm-100">{label}</span>
        {known ? <span className="flex-shrink-0 tabular-nums text-warm-700 dark:text-warm-300">{percent}%</span> : null}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? (percent as number) : undefined}
        className="h-3 w-full overflow-hidden rounded-full bg-warm-200 dark:bg-gray-700"
      >
        <div
          className={`h-full rounded-full bg-amber-600 transition-[width] duration-300 ${known ? '' : 'w-1/3 animate-pulse'}`}
          style={known ? { width: `${percent}%` } : undefined}
        />
      </div>
      {detail ? <p className="mt-1 text-sm text-warm-600 dark:text-warm-300">{detail}</p> : null}
    </div>
  );
};

export default ProgressBar;
