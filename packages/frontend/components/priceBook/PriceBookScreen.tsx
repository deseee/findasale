/**
 * PriceBookScreen (ADR-140 section 11): everything below the page frame. Reads the status first and shows the plain
 * "not turned on" line while the feature is off, the start card while the shop's book is missing or off, and the four tabs
 * once the book exists. The page (pages/organizer/price-book) only handles sign-in, the URL and the frame.
 */
import React, { useCallback, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { priceBookApi } from '../../lib/priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI, TAB_LABELS } from '../../lib/priceBookCopy';
import type { UnpricedPreset } from '../../lib/priceBookWiring';
import BulkRatesTab from './BulkRatesTab';
import CardPricesTab from './CardPricesTab';
import ChangesTab from './ChangesTab';
import PriceBookHeader from './PriceBookHeader';
import RulesTab from './RulesTab';
import SettingsDrawer from './SettingsDrawer';
import StartCard from './StartCard';
import type { StepperKind } from './RepriceStepper';
import { TAB_KEYS, mutedCls, noticeErrorCls, secondaryBtn } from './ui';
import type { TabKey } from './ui';
import { usePriceBookBook, usePriceBookStatus, useRefreshPriceBook, useReportError } from './usePriceBookData';

export interface PriceBookScreenProps {
  /** False until the sign-in check is done and the person is an organizer. */
  ready: boolean;
  tab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  /** From the URL when the person came from "Price the cards without a price". Optional. */
  preset?: UnpricedPreset | null;
}

const PriceBookScreen: React.FC<PriceBookScreenProps> = ({ ready, tab, onSelectTab, preset }) => {
  const baseId = useId();
  const refresh = useRefreshPriceBook();
  const report = useReportError();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [launchKind, setLaunchKind] = useState<StepperKind | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const selectTab = onSelectTab;

  const statusQuery = usePriceBookStatus(ready);
  const status = statusQuery.data || null;
  const featureOn = !!status && status.enabled;
  const bookQuery = usePriceBookBook(ready && featureOn);
  const book = bookQuery.data || null;
  const toggle = useMutation({
    mutationFn: (next: boolean) => priceBookApi.putBook({ enabled: next }, book ? book.version : null),
    onSuccess: () => {
      void refresh();
    },
    onError: (err) => {
      report(err);
      void refresh();
    },
  });

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % TAB_KEYS.length;
    else if (e.key === 'ArrowLeft') next = (index + TAB_KEYS.length - 1) % TAB_KEYS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TAB_KEYS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = TAB_KEYS[next];
    selectTab(key);
    const el = tabRefs.current[key];
    if (el) el.focus();
  };

  const onApplyToLots = useCallback((): void => {
    setLaunchKind('LOT');
    selectTab('changes');
  }, [selectTab]);
  const onLaunched = useCallback((): void => setLaunchKind(null), []);

  const showTabs = ready && featureOn && !!book && !!status;

  const title = <h1 className="break-words text-2xl font-bold text-warm-900 dark:text-warm-100 sm:text-3xl">{PRICE_BOOK_COPY.title}</h1>;
  const loading = (
    <div className="mt-4 space-y-2">
      {title}
      <p role="status" className={mutedCls}>{PRICE_BOOK_COPY.loading}</p>
    </div>
  );
  const failed = (retry: () => void): React.ReactNode => (
    <div className="mt-4 space-y-3">
      {title}
      <div role="alert" className={noticeErrorCls}>
        <p>{PRICE_BOOK_COPY.loadError}</p>
        <button type="button" className={`${secondaryBtn} mt-2`} onClick={retry}>{PRICE_BOOK_COPY.retry}</button>
      </div>
    </div>
  );

  if (!ready || statusQuery.isLoading) return loading;
  if (statusQuery.isError) return failed(() => void statusQuery.refetch());
  if (!featureOn) {
    return (
      <div className="mt-4 space-y-3">
        {title}
        <p className="text-sm text-warm-700 dark:text-warm-300">{PRICE_BOOK_COPY.pageIntro}</p>
        <p role="status" className="text-sm text-warm-700 dark:text-warm-300">{PRICE_BOOK_COPY.disabled}</p>
      </div>
    );
  }
  if (bookQuery.isLoading) return loading;
  if (bookQuery.isError) return failed(() => void bookQuery.refetch());

  return (
    <div className="mt-4 space-y-6">
      <PriceBookHeader book={book} busy={toggle.isPending} onToggle={(next) => toggle.mutate(next)} onOpenSettings={() => setSettingsOpen(true)} />

      {(!book || !book.enabled) && <StartCard book={book} onChanged={() => void refresh()} />}

      {showTabs && book && status && (
        <>
          <div role="tablist" aria-label={PRICE_BOOK_UI.tabsLabel} className="flex gap-1 overflow-x-auto border-b border-warm-200 dark:border-gray-700">
            {TAB_KEYS.map((key, index) => (
              <button
                key={key}
                ref={(el) => {
                  tabRefs.current[key] = el;
                }}
                id={`${baseId}-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={tab === key}
                aria-controls={`${baseId}-panel`}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => selectTab(key)}
                onKeyDown={(e) => onTabKeyDown(e, index)}
                className={`min-h-[44px] flex-shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  tab === key
                    ? 'border-amber-600 text-amber-800 dark:border-amber-400 dark:text-amber-300'
                    : 'border-transparent text-warm-700 hover:text-warm-900 dark:text-warm-300 dark:hover:text-warm-100'
                }`}
              >
                {TAB_LABELS[key]}
              </button>
            ))}
          </div>
          <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`} className="min-w-0">
            {tab === 'prices' && <RulesTab book={book} status={status} onOpenSettings={() => setSettingsOpen(true)} />}
            {tab === 'bulk' && <BulkRatesTab book={book} status={status} onApplyToLots={onApplyToLots} />}
            {tab === 'cards' && <CardPricesTab book={book} status={status} />}
            {tab === 'changes' && <ChangesTab book={book} status={status} launchKind={launchKind} onLaunched={onLaunched} preset={preset} />}
          </div>
        </>
      )}

      {settingsOpen && book && status && (
        <SettingsDrawer
          book={book}
          status={status}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
};

export default PriceBookScreen;
