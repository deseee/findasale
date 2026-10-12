/**
 * PriceField (ADR-138 batch B7): the price of one card. The seller types it; it is saved when they leave the box or press Enter.
 * An empty box clears the price. Nothing here ever fills a price by itself: the suggested price is a separate button.
 */
import React, { useEffect, useId, useState } from 'react';
import { normalizePrice } from '../../lib/cardScan';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import { inputCls, labelCls } from './ui';

export interface PriceFieldProps {
  value: number | null;
  disabled?: boolean;
  onCommit: (price: number | null) => void;
}

function show(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}

const PriceField: React.FC<PriceFieldProps> = ({ value, disabled, onCommit }) => {
  const id = useId();
  const [draft, setDraft] = useState<string>(show(value));

  // A newer price from the server (or the suggested price button) replaces what is in the box.
  useEffect(() => {
    setDraft(show(value));
  }, [value]);

  const commit = () => {
    const text = draft.replace(/[$,\s]/g, '');
    if (text === '') {
      if (value !== null) onCommit(null);
      setDraft('');
      return;
    }
    const parsed = normalizePrice(Number(text));
    if (parsed === null) {
      setDraft(show(value));
      return;
    }
    setDraft(show(parsed));
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {SCAN_COPY.priceLabel}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className={`${inputCls} max-w-[10rem]`}
      />
    </div>
  );
};

export default PriceField;
