/**
 * ItemFormSection
 *
 * A titled, collapsible section for item forms. Presentational only: it owns no form
 * state, so everything inside it stays mounted (collapsed content is hidden, not
 * unmounted) and keeps working while closed. Built to be reused by the Edit Item page
 * now and by the shared item form (inside a sheet) later.
 *
 * Open state:
 *  - Starts open when `defaultOpen` or `forceOpen` is true.
 *  - `forceOpen` should be true when any field inside already has a value. Whenever it
 *    turns true the section opens (a value must never sit hidden). Once the organizer
 *    has seen the section they can still collapse it by hand.
 *  - Bump `openSignal` (any increasing number) to open the section from outside, for
 *    example when a summary chip elsewhere on the page links to it.
 *
 * Accessibility: the header is a real button with aria-expanded / aria-controls, 44px
 * minimum tap height. Dark mode classes follow the rest of the app.
 */

import React, { useEffect, useState } from 'react';

export interface ItemFormSectionProps {
  /** Anchor id, used for in-page links (the section scrolls below the sticky header). */
  id?: string;
  title: string;
  /** Open on first render. Default false. */
  defaultOpen?: boolean;
  /** True when a child field already holds a value: open now and whenever it becomes true. */
  forceOpen?: boolean;
  /** Increase this number to open the section programmatically. */
  openSignal?: number;
  /** Short text shown next to the title, mainly useful while the section is collapsed. */
  summary?: React.ReactNode;
  /** "card" is a full section card; "nested" is a lighter group inside a card. */
  variant?: 'card' | 'nested';
  children: React.ReactNode;
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    className={`w-4 h-4 flex-shrink-0 text-warm-500 dark:text-warm-400 transition-transform ${open ? 'rotate-180' : ''}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const ItemFormSection: React.FC<ItemFormSectionProps> = ({
  id,
  title,
  defaultOpen = false,
  forceOpen = false,
  openSignal,
  summary,
  variant = 'card',
  children,
}) => {
  const [open, setOpen] = useState<boolean>(defaultOpen || forceOpen);

  // A value must never sit hidden: open whenever forceOpen turns true.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  // Programmatic open (for example from a summary chip that links here).
  useEffect(() => {
    if (openSignal !== undefined && openSignal > 0) setOpen(true);
  }, [openSignal]);

  const baseId = id || `item-form-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const panelId = `${baseId}-panel`;
  const isCard = variant === 'card';

  return (
    <section
      id={id}
      className={
        isCard
          ? 'scroll-mt-44 md:scroll-mt-36 rounded-xl border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800'
          : 'scroll-mt-44 md:scroll-mt-36 rounded-lg border border-warm-200 dark:border-gray-700'
      }
    >
      <h2 className="m-0 text-base leading-normal">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={panelId}
          className={`w-full min-h-[44px] flex items-center justify-between gap-3 text-left hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors ${
            isCard ? 'px-4 py-3 rounded-xl' : 'px-3 py-2 rounded-lg'
          }`}
        >
          <span className="min-w-0 flex items-baseline gap-2">
            <span
              className={
                isCard
                  ? 'text-base font-semibold text-warm-900 dark:text-warm-100'
                  : 'text-sm font-medium text-warm-800 dark:text-warm-200'
              }
            >
              {title}
            </span>
            {summary ? (
              <span className="min-w-0 truncate text-xs font-normal text-warm-500 dark:text-warm-400">{summary}</span>
            ) : null}
          </span>
          <Chevron open={open} />
        </button>
      </h2>
      <div id={panelId} hidden={!open} className={isCard ? 'px-4 pb-4 pt-1 space-y-5' : 'px-3 pb-3 pt-1 space-y-4'}>
        {children}
      </div>
    </section>
  );
};

export default ItemFormSection;
