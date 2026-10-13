/**
 * SaleNameHint: gentle, non-blocking hint under the create-sale "Sale name" field when the name
 * reads like a single item ("Oak dresser") instead of an event. Never blocks Continue, no error styling.
 * Spec: claude_docs/ux-spotchecks/guided-first-sale-flow-spec-2026-10-12.md section D1.
 */
import React, { useEffect, useState } from 'react';

const EVENT_WORDS = [
  'sale', 'sales', 'market', 'auction', 'moving', 'yard', 'garage', 'estate', 'clearance', 'liquidation',
  'pop-up', 'popup', 'booth', 'shop', 'store', 'boutique', 'dash', 'event', 'weekend', 'days', 'downsizing',
  'rummage', 'flea', 'tag', 'barn', 'consignment', 'vendor', 'collection', 'family', 'house', 'home',
];

export const DEFAULT_SALE_NAME_SUGGESTION = 'Saturday Moving Sale on Elm St';

/** True when the name is 1 to 4 words and contains none of the event words. */
export function looksLikeItemName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  const lower = trimmed.toLowerCase();
  // "pop-up" is checked as a phrase; every other word is matched on word boundaries
  // after stripping punctuation, so "Sales," and "(Estate)" still count.
  if (lower.includes('pop-up')) return false;
  const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
  return !tokens.some((t) => EVENT_WORDS.includes(t));
}

interface SaleNameHintPalette {
  surfaceElevated: string;
  border: string;
  text: string;
  textDim: string;
  chipBg: string;
}

interface SaleNameHintProps {
  value: string;
  /** First per-type suggestion, or undefined when no sale type is picked yet. */
  suggestion?: string;
  onUseSuggestion: (s: string) => void;
  c: SaleNameHintPalette;
  id?: string;
}

const SaleNameHint: React.FC<SaleNameHintProps> = ({ value, suggestion, onUseSuggestion, c, id }) => {
  const [debounced, setDebounced] = useState(value);
  const [keptValue, setKeptValue] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), 600);
    return () => window.clearTimeout(t);
  }, [value]);

  const show = debounced === value && looksLikeItemName(debounced) && keptValue !== debounced.trim();
  const firstSuggestion = suggestion || DEFAULT_SALE_NAME_SUGGESTION;

  const btnStyle: React.CSSProperties = {
    minHeight: 44, padding: '8px 14px', borderRadius: 8,
    background: c.chipBg, color: c.text, border: `1px solid ${c.border}`,
    fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
  };

  return (
    <div id={id} role="status" aria-live="polite">
      {show && (
        <div style={{
          marginTop: 8, marginBottom: 12, padding: '12px 14px', borderRadius: 10,
          background: c.surfaceElevated, border: `1px solid ${c.border}`,
          fontFamily: 'Inter, sans-serif',
        }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: c.textDim }}>
            This sounds like an item. A sale name describes the event, like &quot;{firstSuggestion}&quot;. You&apos;ll add items like this one right after setup.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <button type="button" style={btnStyle} onClick={() => onUseSuggestion(firstSuggestion)}>
              Use &quot;{firstSuggestion}&quot;
            </button>
            <button type="button" style={btnStyle} onClick={() => setKeptValue(value.trim())}>
              Keep my name
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaleNameHint;
