/**
 * QuantityStepper (ADR-138 batch B7): the copies of one card. Two 44 px buttons around the number.
 * The labels come from lib/cardScanCopy.ts; the number is announced politely when it changes.
 */
import React from 'react';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import { labelCls, smallBtn } from './ui';

export interface QuantityStepperProps {
  value: number;
  disabled?: boolean;
  onStep: (delta: number) => void;
}

const QuantityStepper: React.FC<QuantityStepperProps> = ({ value, disabled, onStep }) => (
  <div className="min-w-0">
    <span className={labelCls}>{SCAN_COPY.quantityLabel}</span>
    <div className="flex items-center gap-2">
      <button type="button" aria-label={SCAN_COPY.quantityLess} disabled={disabled || value <= 1} onClick={() => onStep(-1)} className={`${smallBtn} w-11`}>
        <span aria-hidden="true">-</span>
      </button>
      <span aria-live="polite" className="min-w-[2.5rem] text-center text-base font-semibold text-warm-900 dark:text-warm-100">
        {value}
      </span>
      <button type="button" aria-label={SCAN_COPY.quantityMore} disabled={disabled} onClick={() => onStep(1)} className={`${smallBtn} w-11`}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  </div>
);

export default QuantityStepper;
