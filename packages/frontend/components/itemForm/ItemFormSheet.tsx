/**
 * ItemFormSheet
 *
 * Slide-up host for the shared item form (ItemFormBody variant "sheet"), used from Add Items and Review so an organizer
 * can edit every field without leaving the page. The sheet never navigates away.
 *
 *   <ItemFormSheet open={open} itemId={id} onClose={() => setOpen(false)} onSaved={(item) => ...} />
 *
 * Behavior:
 *  - role="dialog" aria-modal panel, rendered in a portal on document.body.
 *  - Focus moves into the panel on open, Tab and Shift+Tab stay inside it, and focus returns to the opener on close.
 *  - Escape and a tap on the backdrop ask to close. If the form has unsaved changes, a leave confirmation shows first
 *    ("Keep editing" or "Discard changes"). Escape is ignored while a nested overlay (a confirm, the camera, the barcode
 *    scanner) is open: those handle their own Escape.
 *  - Page scroll is locked while open; the form scrolls inside the panel.
 *  - Full height on phones (390px) with 16px side gutters and the form's sticky Save bar at the bottom; a centered
 *    sheet on wider screens. Dark mode classes mirror light mode.
 *
 * Saving keeps the sheet open (onSaved is called with the saved item); the host decides whether to close.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ItemFormBody from './ItemFormBody';

export interface ItemFormSheetProps {
  open: boolean;
  itemId: string;
  onClose: () => void;
  onSaved?: (item: any) => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('hidden') && el.getClientRects().length > 0 && !el.closest('[inert]')
  );
}

export const ItemFormSheet: React.FC<ItemFormSheetProps> = ({ open, itemId, onClose, onSaved }) => {
  const [mounted, setMounted] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const dirtyRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      setConfirmLeave(true);
    } else {
      onCloseRef.current();
    }
  }, []);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  // Reset per opening, remember the opener, move focus in, restore focus on close.
  useEffect(() => {
    if (!open || !mounted) return;
    dirtyRef.current = false;
    setConfirmLeave(false);
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = visibleFocusables(panel)[0];
      (first || panel).focus();
    });
    return () => {
      window.cancelAnimationFrame(raf);
      const opener = openerRef.current;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, mounted, itemId]);

  // Lock page scroll while open.
  useEffect(() => {
    if (!open || !mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, mounted]);

  // Escape: close the leave confirmation first, otherwise ask to close. Nested overlays handle their own Escape.
  useEffect(() => {
    if (!open || !mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.querySelector('[data-nested-overlay="true"]')) return;
      e.preventDefault();
      if (confirmLeave) setConfirmLeave(false);
      else requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, mounted, confirmLeave, requestClose]);

  // While the leave confirmation is up, the form behind it cannot be reached by keyboard or screen reader.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (confirmLeave) {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
      const raf = window.requestAnimationFrame(() => keepEditingRef.current?.focus());
      return () => {
        window.cancelAnimationFrame(raf);
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      };
    }
    return undefined;
  }, [confirmLeave]);

  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = visibleFocusables(panel);
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" data-testid="item-form-sheet-root">
      <style>{`
        @keyframes iffSheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes iffFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .iff-sheet-panel { animation: iffSheetIn 220ms ease-out backwards; }
        .iff-sheet-backdrop { animation: iffFadeIn 180ms ease-out backwards; }
        @media (prefers-reduced-motion: reduce) { .iff-sheet-panel, .iff-sheet-backdrop { animation: none; } }
      `}</style>
      <div
        className="iff-sheet-backdrop absolute inset-0 bg-black/50"
        onClick={requestClose}
        aria-hidden="true"
        data-testid="item-form-sheet-backdrop"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-form-sheet-title"
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
        className="iff-sheet-panel absolute inset-0 sm:inset-x-0 sm:top-auto sm:bottom-0 sm:mx-auto sm:max-w-2xl sm:h-[92vh] flex flex-col bg-white dark:bg-gray-800 sm:rounded-t-2xl shadow-2xl outline-none"
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 min-h-[56px] border-b border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 sm:rounded-t-2xl">
          <h2 id="item-form-sheet-title" className="text-base font-bold text-warm-900 dark:text-warm-100 truncate">
            Edit item
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex-shrink-0 w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-warm-600 dark:text-warm-300 hover:bg-warm-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-0 pb-0">
          <ItemFormBody
            itemId={itemId}
            variant="sheet"
            onSaved={onSaved}
            onClose={requestClose}
            onDirtyChange={handleDirtyChange}
          />
        </div>

        {confirmLeave ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-black/40 sm:rounded-t-2xl">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="item-form-sheet-leave-title"
              aria-describedby="item-form-sheet-leave-text"
              className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-900 p-6 shadow-lg"
            >
              <h3 id="item-form-sheet-leave-title" className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                Discard your changes?
              </h3>
              <p id="item-form-sheet-leave-text" className="text-sm text-warm-600 dark:text-warm-300 mb-5">
                You have changes that are not saved yet.
              </p>
              <div className="flex gap-3">
                <button
                  ref={keepEditingRef}
                  type="button"
                  onClick={() => setConfirmLeave(false)}
                  className="flex-1 min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dirtyRef.current = false;
                    setConfirmLeave(false);
                    onCloseRef.current();
                  }}
                  className="flex-1 min-h-[44px] bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 font-semibold py-2 px-4 rounded-lg"
                >
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
};

export default ItemFormSheet;
