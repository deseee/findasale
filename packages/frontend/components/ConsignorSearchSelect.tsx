/**
 * ConsignorSearchSelect
 *
 * Type-to-filter consignor picker for the quick-edit row on the Add Items page.
 * An organizer can have many consignors, so a plain <select> gets unwieldy; this
 * filters as you type and always offers "Not consigned" to clear the attribution.
 * Presentation only: the parent owns the value and decides when it counts as a real edit.
 * Empty / loading / error states mirror the consignor field in the add-item form.
 */

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

export interface ConsignorOption {
  id: string;
  name: string;
}

interface ConsignorSearchSelectProps {
  /** Currently selected consignor id ('' = none). */
  value: string;
  onChange: (consignorId: string) => void;
  options: ConsignorOption[] | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Name to show for the current value when it is not (yet) in `options`. */
  fallbackName?: string | null;
  /** Unique per instance (several rows can be open at once). */
  inputId: string;
}

const MAX_VISIBLE = 50;

const ConsignorSearchSelect: React.FC<ConsignorSearchSelectProps> = ({
  value,
  onChange,
  options,
  loading = false,
  error = false,
  onRetry,
  fallbackName,
  inputId,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedName = useMemo(() => {
    if (!value) return '';
    const found = (options || []).find((o) => o.id === value);
    return found?.name || fallbackName || '';
  }, [value, options, fallbackName]);

  const filtered = useMemo(() => {
    const list = options || [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((o) => (o.name || '').toLowerCase().includes(q)) : list;
  }, [options, query]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  if (loading) {
    return (
      <input
        id={inputId}
        disabled
        value="Loading consignors..."
        readOnly
        className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm opacity-60"
      />
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Could not load consignors.{' '}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="underline font-medium hover:text-red-700 dark:hover:text-red-300"
          >
            Retry
          </button>
        )}
      </p>
    );
  }

  if (!options || options.length === 0) {
    return (
      <p className="text-sm text-warm-600 dark:text-warm-400">
        No consignors yet.{' '}
        <Link
          href="/organizer/consignors"
          className="underline font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300"
        >
          Add a consignor
        </Link>
      </p>
    );
  }

  const choose = (id: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const listboxId = `${inputId}-listbox`;

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        value={open ? query : selectedName}
        placeholder={open ? 'Type to search consignors...' : 'Not consigned'}
        onFocus={() => {
          cancelClose();
          setQuery('');
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          // Delay so a tap on an option registers before the list closes.
          closeTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && query.trim() && visible.length > 0) choose(visible[0].id);
          }
        }}
        className="w-full min-h-[44px] sm:min-h-0 px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
      />
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white dark:bg-gray-800 border border-warm-300 dark:border-gray-600 rounded shadow-lg text-sm"
        >
          <li role="option" aria-selected={!value}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose('')}
              className="w-full text-left px-3 py-2 min-h-[44px] sm:min-h-0 text-warm-600 dark:text-warm-300 hover:bg-warm-100 dark:hover:bg-gray-700"
            >
              Not consigned
            </button>
          </li>
          {visible.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c.id)}
                className={`w-full text-left px-3 py-2 min-h-[44px] sm:min-h-0 hover:bg-warm-100 dark:hover:bg-gray-700 text-warm-900 dark:text-warm-100 ${
                  c.id === value ? 'font-semibold bg-amber-50 dark:bg-amber-900/20' : ''
                }`}
              >
                {c.name}
              </button>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-3 py-2 text-warm-500 dark:text-warm-400">No consignors match &ldquo;{query.trim()}&rdquo;</li>
          )}
          {filtered.length > MAX_VISIBLE && (
            <li className="px-3 py-2 text-xs text-warm-500 dark:text-warm-400">
              Showing the first {MAX_VISIBLE} of {filtered.length}. Keep typing to narrow the list.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default ConsignorSearchSelect;
