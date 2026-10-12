/**
 * TabBar (ADR-138 batch B7): a row of tabs with the keyboard behaviour screen reader users expect.
 * Left and right arrows move between tabs, Home and End jump to the first and last. Only the active tab is in the tab order.
 * The panel it controls should use panelId(idBase) as its id, role="tabpanel" and tabId(idBase, active) in aria-labelledby.
 */
import React from 'react';

export interface TabItem {
  id: string;
  label: string;
}

export function tabId(idBase: string, id: string): string {
  return `${idBase}-tab-${id}`;
}

export function panelId(idBase: string): string {
  return `${idBase}-panel`;
}

export interface TabBarProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  idBase: string;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, active, onChange, ariaLabel, idBase }) => {
  const move = (to: number) => {
    if (tabs.length === 0) return;
    const target = tabs[(to + tabs.length) % tabs.length];
    onChange(target.id);
    const el = document.getElementById(tabId(idBase, target.id));
    if (el) el.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      move(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      move(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(tabs.length - 1);
    }
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            id={tabId(idBase, t.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(idBase)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              selected
                ? 'border-amber-700 bg-amber-700 text-white'
                : 'border-warm-300 bg-white text-warm-800 hover:border-amber-400 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

export default TabBar;
