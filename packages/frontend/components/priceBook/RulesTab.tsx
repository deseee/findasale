/**
 * RulesTab (ADR-140 section 11.2): the "Prices" tab. Two sections, Selling and Buying. Each shows the shop's rules as plain
 * sentences with Edit, Up, Down, Turn off and Delete buttons, the default rule (selling), a starting point button while a
 * section has no rules, and the rule editor. The "Try it" panel sits below. Rules are the shop's own data; nothing here
 * changes an item price.
 */
import React, { useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RULES_MAX_PER_FAMILY, priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookFamily, PriceBookRule, PriceBookStatus, PriceBookView } from '../../lib/priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI } from '../../lib/priceBookCopy';
import { describeRule } from '../../lib/priceBookRules';
import ConfirmDialog from '../ConfirmDialog';
import RuleCard from './RuleCard';
import RuleEditor from './RuleEditor';
import TryItPanel from './TryItPanel';
import { moveId, mutedCls, noticeErrorCls, primaryBtn, ruleToInput, sectionCls, secondaryBtn, smallBtn, subHeadingCls } from './ui';
import { pbKeys, useRefreshPriceBook } from './usePriceBookData';

export interface RulesTabProps {
  book: PriceBookView;
  status: PriceBookStatus;
  onOpenSettings: () => void;
}

interface FamilySectionProps extends RulesTabProps {
  family: PriceBookFamily;
}

type Editing = PriceBookRule | 'new' | null;

const FamilySection: React.FC<FamilySectionProps> = ({ family, book, status, onOpenSettings }) => {
  const baseId = useId();
  const refresh = useRefreshPriceBook();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<PriceBookRule | null>(null);
  const [error, setError] = useState('');

  const list = useQuery({
    queryKey: pbKeys.rules(family),
    queryFn: () => priceBookApi.listRules(family),
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const rules: PriceBookRule[] = list.data || [];

  const onError = (err: unknown): void => {
    setError(readPriceBookError(err).message);
    void refresh();
  };
  const onDone = (): void => {
    setError('');
    void refresh();
  };

  const toggle = useMutation({
    mutationFn: (rule: PriceBookRule) => priceBookApi.updateRule(rule.id, ruleToInput(rule, { enabled: !rule.enabled }), book.version),
    onSuccess: onDone,
    onError,
  });
  const move = useMutation({
    mutationFn: (ids: string[]) => priceBookApi.reorderRules(family, ids),
    onSuccess: onDone,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => priceBookApi.deleteRule(id),
    onSuccess: () => {
      setDeleting(null);
      onDone();
    },
    onError: (err) => {
      setDeleting(null);
      onError(err);
    },
  });
  const starter = useMutation({
    mutationFn: () => priceBookApi.applyTemplate(family === 'RETAIL' ? 'RETAIL_STARTER' : 'BUYLIST_STARTER'),
    onSuccess: onDone,
    onError,
  });

  const busy = toggle.isPending || move.isPending || remove.isPending || starter.isPending;
  const heading = family === 'RETAIL' ? PRICE_BOOK_COPY.sellingHeading : PRICE_BOOK_COPY.buyingHeading;
  const intro = family === 'RETAIL' ? PRICE_BOOK_UI.sellingIntro : PRICE_BOOK_UI.buyingIntro;
  const atLimit = rules.length >= RULES_MAX_PER_FAMILY;
  const titleId = `${baseId}-title`;

  const defaultSentence = describeRule({
    family: 'RETAIL',
    basis: 'REFERENCE',
    percentBps: book.retailPercentBps,
    floorCents: book.defaultFloorCents > 0 ? book.defaultFloorCents : null,
    ceilingCents: book.defaultCeilingCents,
    roundingMode: book.defaultRoundingMode,
    roundingDirection: book.defaultRoundingDirection,
  });

  return (
    <section aria-labelledby={titleId} className={sectionCls}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id={titleId} className={subHeadingCls}>{heading}</h2>
        <button
          type="button"
          className={primaryBtn}
          disabled={busy || atLimit || editing === 'new'}
          onClick={() => {
            setError('');
            setEditing('new');
          }}
        >
          {PRICE_BOOK_COPY.ruleAdd}
        </button>
      </div>
      <p className={mutedCls}>{intro}</p>
      {atLimit && <p className={mutedCls}>{PRICE_BOOK_UI.ruleLimit(RULES_MAX_PER_FAMILY)}</p>}
      {error && <p role="alert" className={noticeErrorCls}>{error}</p>}

      <div aria-live="polite">
        {list.isLoading && <p role="status" className={mutedCls}>{PRICE_BOOK_COPY.loading}</p>}
        {list.isError && (
          <div role="alert" className={noticeErrorCls}>
            <p>{PRICE_BOOK_COPY.loadError}</p>
            <button type="button" className={`${secondaryBtn} mt-2`} onClick={() => list.refetch()}>{PRICE_BOOK_COPY.retry}</button>
          </div>
        )}
        {list.isSuccess && rules.length === 0 && editing !== 'new' && <p className={mutedCls}>{PRICE_BOOK_COPY.noRules}</p>}
      </div>

      {list.isSuccess && rules.length === 0 && (
        <div className="space-y-1">
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => starter.mutate()}>
            {starter.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_COPY.addStarter}
          </button>
          <p className={mutedCls}>{PRICE_BOOK_COPY.starterLabel}</p>
        </div>
      )}

      {rules.length > 0 && (
        <ol className="space-y-3">
          {rules.map((rule, index) =>
            editing !== null && editing !== 'new' && editing.id === rule.id ? (
              <li key={rule.id} className="min-w-0">
                <RuleEditor
                  family={family}
                  rule={rule}
                  vocabulary={status.vocabulary}
                  bookVersion={book.version}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    onDone();
                  }}
                />
              </li>
            ) : (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={index}
                count={rules.length}
                busy={busy}
                onEdit={(r) => {
                  setError('');
                  setEditing(r);
                }}
                onMove={(r, direction) => move.mutate(moveId(rules.map((x) => x.id), r.id, direction))}
                onToggle={(r) => toggle.mutate(r)}
                onDelete={(r) => setDeleting(r)}
              />
            )
          )}
        </ol>
      )}

      {editing === 'new' && (
        <RuleEditor
          family={family}
          rule={null}
          vocabulary={status.vocabulary}
          bookVersion={book.version}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onDone();
          }}
        />
      )}

      {family === 'RETAIL' && (
        <div className="min-w-0 rounded-lg border border-dashed border-warm-300 p-3 dark:border-gray-600">
          <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{PRICE_BOOK_COPY.ruleDefault}</p>
          <p className="mt-1 break-words text-sm text-warm-700 dark:text-warm-300">{defaultSentence}</p>
          <p className={`${mutedCls} mt-1`}>{PRICE_BOOK_UI.defaultRuleCaption}</p>
          <button type="button" className={`${smallBtn} mt-2`} onClick={onOpenSettings}>{PRICE_BOOK_COPY.settings}</button>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        title={PRICE_BOOK_UI.deleteRuleTitle}
        message={PRICE_BOOK_UI.deleteRuleMessage(deleting ? deleting.name : '')}
        confirmLabel={PRICE_BOOK_COPY.ruleDelete}
        cancelLabel={PRICE_BOOK_UI.cancel}
        variant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </section>
  );
};

const RulesTab: React.FC<RulesTabProps> = ({ book, status, onOpenSettings }) => (
  <div className="space-y-6">
    <FamilySection family="RETAIL" book={book} status={status} onOpenSettings={onOpenSettings} />
    <FamilySection family="BUYLIST" book={book} status={status} onOpenSettings={onOpenSettings} />
    <TryItPanel status={status} />
  </div>
);

export default RulesTab;
