/**
 * StepIndicator (ADR-134 #642, batch B8): the four steps of the card intake.
 * At 375 px the steps stack in one column; from the sm breakpoint they sit in a row.
 * A step the seller has already reached is a button (min 44 px) so they can go back and change a choice.
 */
import React from 'react';
import { INTAKE_COPY, INTAKE_STEPS, IntakeStepId } from '../../lib/cardIntakeCopy';

export interface StepIndicatorProps {
  current: IntakeStepId;
  /** Highest step index the seller has reached; steps up to here can be opened. */
  reached: number;
  onGo: (step: IntakeStepId) => void;
  /** Disables going back while an upload or import is running. */
  disabled?: boolean;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ current, reached, onGo, disabled }) => {
  const currentIndex = INTAKE_STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label={INTAKE_COPY.stepsLabel}>
      <ol className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        {INTAKE_STEPS.map((step, i) => {
          const isCurrent = i === currentIndex;
          const isDone = i < currentIndex;
          const canOpen = !disabled && !isCurrent && i <= reached;
          const base =
            'flex min-h-[44px] w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium sm:flex-1';
          const tone = isCurrent
            ? 'border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-900/20 dark:text-amber-100'
            : isDone
              ? 'border-warm-300 bg-white text-warm-800 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-200'
              : 'border-warm-200 bg-warm-50 text-warm-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400';
          const badge = (
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isCurrent ? 'bg-amber-600 text-white' : isDone ? 'bg-green-600 text-white' : 'bg-warm-200 text-warm-700 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              {isDone ? '✓' : i + 1}
            </span>
          );
          const label = (
            <span className="min-w-0 break-words">
              {step.label}
              <span className="sr-only">
                {isCurrent ? `, ${INTAKE_COPY.stepCurrent}` : isDone ? `, ${INTAKE_COPY.stepDone}` : ''}
              </span>
            </span>
          );
          return (
            <li key={step.id} className="min-w-0 sm:flex-1" aria-current={isCurrent ? 'step' : undefined}>
              {canOpen ? (
                <button type="button" onClick={() => onGo(step.id)} className={`${base} ${tone} hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500`}>
                  {badge}
                  {label}
                </button>
              ) : (
                <div className={`${base} ${tone}`}>
                  {badge}
                  {label}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default StepIndicator;
