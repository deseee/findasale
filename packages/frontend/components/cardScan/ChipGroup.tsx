/**
 * ChipGroup (ADR-138 batch B7): a labelled row of tappable choices (condition, finish).
 * Each chip is a toggle button (aria-pressed) at least 44 px tall. The chosen one is filled. An optional extra chip, such as the
 * Suggested condition, sits at the end with a dashed outline and is never chosen for the seller.
 */
import React from 'react';
import { chipClass, labelCls } from './ui';

export interface ChipOption {
  code: string;
  label: string;
}

export interface ChipGroupProps {
  label: string;
  options: readonly ChipOption[];
  value: string | null;
  disabled?: boolean;
  onChange: (code: string) => void;
  /** True when the card cannot be saved until this is chosen. Adds a star to the label. */
  needed?: boolean;
  suggested?: { text: string; onUse: () => void } | null;
}

const ChipGroup: React.FC<ChipGroupProps> = ({ label, options, value, disabled, onChange, needed, suggested }) => {
  const labelId = React.useId();
  return (
    <div className="min-w-0">
      <span id={labelId} className={labelCls}>
        {label}
        {needed ? <span aria-hidden="true"> *</span> : null}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.code}
            type="button"
            aria-pressed={value === o.code}
            disabled={disabled}
            onClick={() => onChange(o.code)}
            className={chipClass(value === o.code)}
          >
            {o.label}
          </button>
        ))}
        {suggested ? (
          <button type="button" disabled={disabled} onClick={suggested.onUse} className={chipClass(false, true)}>
            {suggested.text}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default ChipGroup;
