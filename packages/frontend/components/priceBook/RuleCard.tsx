/**
 * RuleCard (ADR-140 section 11.2): one pricing rule shown as a plain sentence from describeRule, with Edit, Up, Down,
 * Turn off (or on) and Delete as real buttons. Up and Down are buttons, so reordering never needs a drag.
 */
import React from 'react';
import type { PriceBookRule } from '../../lib/priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI } from '../../lib/priceBookCopy';
import { describeRule } from '../../lib/priceBookRules';
import { smallBtn } from './ui';

export interface RuleCardProps {
  rule: PriceBookRule;
  index: number;
  count: number;
  busy: boolean;
  onEdit: (rule: PriceBookRule) => void;
  onMove: (rule: PriceBookRule, direction: 'up' | 'down') => void;
  onToggle: (rule: PriceBookRule) => void;
  onDelete: (rule: PriceBookRule) => void;
}

const RuleCard: React.FC<RuleCardProps> = ({ rule, index, count, busy, onEdit, onMove, onToggle, onDelete }) => {
  const name = rule.name;
  return (
    <li
      className={`min-w-0 rounded-lg border p-3 ${
        rule.enabled
          ? 'border-warm-200 bg-white dark:border-gray-700 dark:bg-gray-800'
          : 'border-warm-200 bg-warm-50 opacity-80 dark:border-gray-700 dark:bg-gray-900'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 break-words text-sm font-semibold text-warm-900 dark:text-warm-100">{name}</p>
        {!rule.enabled && (
          <span className="inline-block rounded-full bg-warm-200 px-2 py-0.5 text-xs font-semibold text-warm-800 dark:bg-gray-700 dark:text-warm-100">
            {PRICE_BOOK_COPY.ruleOffBadge}
          </span>
        )}
      </div>
      <p className="mt-1 break-words text-sm text-warm-700 dark:text-warm-300">{describeRule(rule)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={smallBtn} disabled={busy} aria-label={PRICE_BOOK_UI.ruleAction(PRICE_BOOK_COPY.ruleEdit, name)} onClick={() => onEdit(rule)}>
          {PRICE_BOOK_COPY.ruleEdit}
        </button>
        <button
          type="button"
          className={smallBtn}
          disabled={busy || index === 0}
          aria-label={PRICE_BOOK_UI.ruleAction(PRICE_BOOK_COPY.ruleUp, name)}
          onClick={() => onMove(rule, 'up')}
        >
          {PRICE_BOOK_COPY.ruleUp}
        </button>
        <button
          type="button"
          className={smallBtn}
          disabled={busy || index >= count - 1}
          aria-label={PRICE_BOOK_UI.ruleAction(PRICE_BOOK_COPY.ruleDown, name)}
          onClick={() => onMove(rule, 'down')}
        >
          {PRICE_BOOK_COPY.ruleDown}
        </button>
        <button
          type="button"
          className={smallBtn}
          disabled={busy}
          aria-label={PRICE_BOOK_UI.ruleAction(rule.enabled ? PRICE_BOOK_COPY.ruleTurnOff : PRICE_BOOK_COPY.ruleTurnOn, name)}
          onClick={() => onToggle(rule)}
        >
          {rule.enabled ? PRICE_BOOK_COPY.ruleTurnOff : PRICE_BOOK_COPY.ruleTurnOn}
        </button>
        <button type="button" className={smallBtn} disabled={busy} aria-label={PRICE_BOOK_UI.ruleAction(PRICE_BOOK_COPY.ruleDelete, name)} onClick={() => onDelete(rule)}>
          {PRICE_BOOK_COPY.ruleDelete}
        </button>
      </div>
    </li>
  );
};

export default RuleCard;
