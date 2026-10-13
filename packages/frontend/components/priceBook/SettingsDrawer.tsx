/**
 * SettingsDrawer (ADR-140 section 11.2): the book's own settings in a side drawer. Condition percents, the non-English
 * percent, when to ask the shop to look at a big move, how long a hand edit is left alone, the store credit percent, the
 * default rule (percent, never below, never above, rounding), which kind of price to look at first, the Magic catalog switch,
 * and the age limits for typed and sold-history prices.
 *
 * Every number is typed as plain text and read by the library parsers. A number that does not read is reported next to its
 * field and nothing is sent. Only the settings that changed are sent, with the book version (ifVersion), so a stale screen
 * is stopped by the server. Escape or the backdrop closes the drawer; unsaved changes ask first, inline.
 */
import React, { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookSettings, PriceBookStatus, PriceBookView } from '../../lib/priceBook';
import {
  PRICE_BOOK_COPY,
  PRICE_BOOK_UI,
  ROUNDING_DIRECTION_LABELS,
  ROUNDING_MODE_LABELS,
  SOURCE_PHRASES,
} from '../../lib/priceBookCopy';
import { formatBps, parseMoneyToCents, parsePercentToBps } from '../../lib/priceBookRules';
import AccessibleModal from '../AccessibleModal';
import { useToast } from '../ToastContext';
import {
  checkboxCls,
  drawerContentCls,
  drawerOverlayCls,
  headingCls,
  inputCls,
  labelCls,
  mutedCls,
  noticeErrorCls,
  optionsFrom,
  parseWholeNumber,
  primaryBtn,
  secondaryBtn,
  smallBtn,
  subHeadingCls,
} from './ui';

export type SettingKind = 'percent' | 'days' | 'count' | 'money';
export type SettingGroup = 'conditions' | 'review' | 'buying' | 'rule' | 'sources' | 'sold';

export interface SettingField {
  key: keyof PriceBookSettings;
  label: string;
  kind: SettingKind;
  /** Percent fields are checked in basis points; days and counts in whole numbers; money in cents. */
  min: number;
  max: number;
  nullable?: boolean;
  group: SettingGroup;
}

const MONEY_MAX = 100_000_000;

/** The same ranges the server checks (bookService.ts INT_SETTINGS), so a value outside them is stopped before it is sent. */
export const SETTING_FIELDS: ReadonlyArray<SettingField> = [
  { key: 'condNmBps', label: PRICE_BOOK_UI.settingCondNm, kind: 'percent', min: 1, max: 20000, group: 'conditions' },
  { key: 'condLpBps', label: PRICE_BOOK_UI.settingCondLp, kind: 'percent', min: 1, max: 20000, group: 'conditions' },
  { key: 'condMpBps', label: PRICE_BOOK_UI.settingCondMp, kind: 'percent', min: 1, max: 20000, group: 'conditions' },
  { key: 'condHpBps', label: PRICE_BOOK_UI.settingCondHp, kind: 'percent', min: 1, max: 20000, group: 'conditions' },
  { key: 'condDmgBps', label: PRICE_BOOK_UI.settingCondDmg, kind: 'percent', min: 1, max: 20000, group: 'conditions' },
  { key: 'nonEnglishBps', label: PRICE_BOOK_UI.settingNonEnglish, kind: 'percent', min: 1, max: 20000, group: 'conditions' },
  { key: 'movementReviewBps', label: PRICE_BOOK_UI.settingMovement, kind: 'percent', min: 100, max: 100000, group: 'review' },
  { key: 'manualLockDays', label: PRICE_BOOK_UI.settingLockDays, kind: 'days', min: 0, max: 365, group: 'review' },
  { key: 'buyCreditBps', label: PRICE_BOOK_UI.settingCredit, kind: 'percent', min: 10000, max: 30000, group: 'buying' },
  { key: 'retailPercentBps', label: PRICE_BOOK_UI.settingRetailPercent, kind: 'percent', min: 1, max: 100000, group: 'rule' },
  { key: 'defaultFloorCents', label: PRICE_BOOK_UI.settingFloor, kind: 'money', min: 0, max: MONEY_MAX, group: 'rule' },
  { key: 'defaultCeilingCents', label: PRICE_BOOK_UI.settingCeiling, kind: 'money', min: 0, max: MONEY_MAX, nullable: true, group: 'rule' },
  { key: 'referenceWarnDays', label: PRICE_BOOK_UI.settingWarnDays, kind: 'days', min: 1, max: 3650, group: 'sources' },
  { key: 'referenceMaxDays', label: PRICE_BOOK_UI.settingMaxDays, kind: 'days', min: 1, max: 3650, group: 'sources' },
  { key: 'soldHistoryMinSales', label: PRICE_BOOK_UI.settingSoldMin, kind: 'count', min: 1, max: 20, group: 'sold' },
  { key: 'soldHistoryMaxSales', label: PRICE_BOOK_UI.settingSoldMax, kind: 'count', min: 1, max: 50, group: 'sold' },
  { key: 'soldHistoryWindowDays', label: PRICE_BOOK_UI.settingSoldWindow, kind: 'days', min: 7, max: 1095, group: 'sold' },
];

export interface SettingsForm {
  text: Record<string, string>;
  roundingMode: string;
  roundingDirection: string;
  allowCatalogReference: boolean;
  referenceOrder: string[];
}

function textFromValue(field: SettingField, value: number | null): string {
  if (value === null) return '';
  if (field.kind === 'percent') return formatBps(value);
  if (field.kind === 'money') return (value / 100).toFixed(2);
  return String(value);
}

export function formFromBook(book: PriceBookView): SettingsForm {
  const text: Record<string, string> = {};
  const src = book as unknown as Record<string, number | null>;
  SETTING_FIELDS.forEach((f) => {
    text[f.key] = textFromValue(f, src[f.key]);
  });
  return {
    text,
    roundingMode: book.defaultRoundingMode,
    roundingDirection: book.defaultRoundingDirection,
    allowCatalogReference: book.allowCatalogReference,
    referenceOrder: book.referenceOrder.slice(),
  };
}

function parseField(field: SettingField, raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return field.nullable ? null : undefined;
  let n: number | null;
  if (field.kind === 'percent') n = parsePercentToBps(t);
  else if (field.kind === 'money') n = parseMoneyToCents(t);
  else n = parseWholeNumber(t, field.min, field.max);
  if (n === null || n < field.min || n > field.max) return undefined;
  return n;
}

export interface SettingsRead {
  /** Only the settings that differ from the book. */
  patch: Partial<PriceBookSettings>;
  /** Field key to message. Empty when everything reads. */
  errors: Record<string, string>;
}

/** Reads the typed form. Nothing is guessed: a value that does not read is an error for that field and the patch is not used. */
export function patchFromForm(form: SettingsForm, book: PriceBookView): SettingsRead {
  const errors: Record<string, string> = {};
  const values: Record<string, number | null> = {};
  const src = book as unknown as Record<string, number | null>;
  SETTING_FIELDS.forEach((f) => {
    const v = parseField(f, form.text[f.key] === undefined ? '' : form.text[f.key]);
    if (v === undefined) errors[f.key] = PRICE_BOOK_UI.errorField(f.label);
    else values[f.key] = v;
  });
  const num = (key: keyof PriceBookSettings): number | null => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : src[key]);
  const floor = num('defaultFloorCents');
  const ceiling = num('defaultCeilingCents');
  if (!errors.defaultCeilingCents && typeof floor === 'number' && typeof ceiling === 'number' && ceiling < floor) {
    errors.defaultCeilingCents = PRICE_BOOK_UI.errorRange(PRICE_BOOK_UI.settingFloor, PRICE_BOOK_UI.settingCeiling);
  }
  const warn = num('referenceWarnDays');
  const max = num('referenceMaxDays');
  if (!errors.referenceMaxDays && typeof warn === 'number' && typeof max === 'number' && max < warn) {
    errors.referenceMaxDays = PRICE_BOOK_UI.errorRange(PRICE_BOOK_UI.settingWarnDays, PRICE_BOOK_UI.settingMaxDays);
  }
  const minSales = num('soldHistoryMinSales');
  const maxSales = num('soldHistoryMaxSales');
  if (!errors.soldHistoryMaxSales && typeof minSales === 'number' && typeof maxSales === 'number' && maxSales < minSales) {
    errors.soldHistoryMaxSales = PRICE_BOOK_UI.errorRange(PRICE_BOOK_UI.settingSoldMin, PRICE_BOOK_UI.settingSoldMax);
  }

  const patch: Record<string, unknown> = {};
  SETTING_FIELDS.forEach((f) => {
    if (errors[f.key] || !Object.prototype.hasOwnProperty.call(values, f.key)) return;
    if (values[f.key] !== src[f.key]) patch[f.key] = values[f.key];
  });
  if (form.roundingMode !== book.defaultRoundingMode) patch.defaultRoundingMode = form.roundingMode;
  if (form.roundingDirection !== book.defaultRoundingDirection) patch.defaultRoundingDirection = form.roundingDirection;
  if (form.allowCatalogReference !== book.allowCatalogReference) patch.allowCatalogReference = form.allowCatalogReference;
  if (form.referenceOrder.join('|') !== book.referenceOrder.join('|')) patch.referenceOrder = form.referenceOrder.slice();
  return { patch: patch as Partial<PriceBookSettings>, errors };
}

/** The range line under a field: "From 1 to 200 percent." */
export function rangeHint(field: SettingField): string {
  if (field.kind === 'percent') return PRICE_BOOK_UI.rangePercent(field.min / 100, field.max / 100);
  if (field.kind === 'days') return PRICE_BOOK_UI.rangeDays(field.min, field.max);
  if (field.kind === 'count') return PRICE_BOOK_UI.rangeCount(field.min, field.max);
  return '';
}

export interface SettingsDrawerProps {
  book: PriceBookView;
  status: PriceBookStatus;
  onClose: () => void;
  onSaved: () => void;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ book, status, onClose, onSaved }) => {
  const baseId = useId();
  const { showToast } = useToast();
  const [initialForm] = useState<SettingsForm>(() => formFromBook(book));
  const [form, setForm] = useState<SettingsForm>(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [askDiscard, setAskDiscard] = useState(false);

  const read = patchFromForm(form, book);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const errors: Record<string, string> = submitted ? read.errors : {};

  const save = useMutation({
    mutationFn: (patch: Partial<PriceBookSettings>) => priceBookApi.putBook(patch, book.version),
    onSuccess: () => {
      showToast(PRICE_BOOK_UI.settingsSaved, 'success');
      onSaved();
    },
    onError: (err) => setServerError(readPriceBookError(err).message),
  });

  const requestClose = (): void => {
    if (dirty && !save.isPending) setAskDiscard(true);
    else onClose();
  };

  const press = (): void => {
    setServerError('');
    setSubmitted(true);
    if (Object.keys(read.errors).length > 0) return;
    if (Object.keys(read.patch).length === 0) {
      onClose();
      return;
    }
    save.mutate(read.patch);
  };

  const setText = (key: string, value: string): void => setForm((f) => ({ ...f, text: { ...f.text, [key]: value } }));

  const moveSource = (kind: string, direction: 'up' | 'down'): void => {
    setForm((f) => {
      const visible = f.referenceOrder.filter((k) => k !== 'LICENSED_FEED');
      const hidden = f.referenceOrder.filter((k) => k === 'LICENSED_FEED');
      const at = visible.indexOf(kind);
      const to = direction === 'up' ? at - 1 : at + 1;
      if (at < 0 || to < 0 || to >= visible.length) return f;
      const next = visible.slice();
      next[at] = next[to];
      next[to] = kind;
      return { ...f, referenceOrder: next.concat(hidden) };
    });
  };

  const titleId = `${baseId}-title`;
  const roundingModes = optionsFrom(status.vocabulary.roundingMode, ROUNDING_MODE_LABELS);
  const roundingDirections = optionsFrom(status.vocabulary.roundingDirection, ROUNDING_DIRECTION_LABELS);
  const catalogOn = status.catalogReference.platformOn;
  const visibleOrder = form.referenceOrder.filter((k) => k !== 'LICENSED_FEED');

  const renderField = (field: SettingField): React.ReactNode => {
    const id = `${baseId}-${field.key}`;
    const err = errors[field.key];
    const hint = rangeHint(field);
    const describedBy = [hint ? `${id}-hint` : '', err ? `${id}-err` : ''].filter((x) => x).join(' ') || undefined;
    return (
      <div key={field.key}>
        <label htmlFor={id} className={labelCls}>{field.label}</label>
        <input
          id={id}
          className={inputCls}
          type="text"
          inputMode={field.kind === 'money' || field.kind === 'percent' ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={form.text[field.key] === undefined ? '' : form.text[field.key]}
          aria-invalid={err ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => setText(field.key, e.target.value)}
        />
        {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-warm-500 dark:text-warm-400">{hint}</p>}
        {err && <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{err}</p>}
      </div>
    );
  };

  const group = (g: SettingGroup): React.ReactNode[] => SETTING_FIELDS.filter((f) => f.group === g).map(renderField);

  return (
    <AccessibleModal isOpen onClose={requestClose} ariaLabelledBy={titleId} overlayClassName={drawerOverlayCls} contentClassName={drawerContentCls}>
      <div className="min-w-0 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className={headingCls}>{PRICE_BOOK_COPY.settings}</h2>
          <button type="button" className={smallBtn} onClick={requestClose}>{PRICE_BOOK_UI.close}</button>
        </div>

        <fieldset className="space-y-3">
          <legend className={subHeadingCls}>{PRICE_BOOK_UI.groupConditions}</legend>
          <p className={mutedCls}>{PRICE_BOOK_UI.conditionsHelp}</p>
          {group('conditions')}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className={subHeadingCls}>{PRICE_BOOK_UI.groupReview}</legend>
          {group('review')}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className={subHeadingCls}>{PRICE_BOOK_UI.groupBuying}</legend>
          <p className={mutedCls}>{PRICE_BOOK_UI.creditHelp}</p>
          {group('buying')}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className={subHeadingCls}>{PRICE_BOOK_COPY.ruleDefault}</legend>
          {group('rule')}
          <div>
            <label htmlFor={`${baseId}-roundmode`} className={labelCls}>{PRICE_BOOK_UI.fieldRoundingMode}</label>
            <select id={`${baseId}-roundmode`} className={inputCls} value={form.roundingMode} onChange={(e) => setForm((f) => ({ ...f, roundingMode: e.target.value }))}>
              {roundingModes.map((m) => (
                <option key={m.code} value={m.code}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${baseId}-rounddir`} className={labelCls}>{PRICE_BOOK_UI.fieldRoundingDirection}</label>
            <select id={`${baseId}-rounddir`} className={inputCls} value={form.roundingDirection} onChange={(e) => setForm((f) => ({ ...f, roundingDirection: e.target.value }))}>
              {roundingDirections.map((m) => (
                <option key={m.code} value={m.code}>{m.label}</option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className={subHeadingCls}>{PRICE_BOOK_UI.groupSources}</legend>
          <p className={mutedCls}>{PRICE_BOOK_UI.settingOrderHelp}</p>
          <ol className="space-y-2">
            {visibleOrder.map((kind, i) => {
              const word = Object.prototype.hasOwnProperty.call(SOURCE_PHRASES, kind) ? SOURCE_PHRASES[kind] : kind;
              return (
                <li key={kind} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-warm-200 px-3 py-1 dark:border-gray-700">
                  <span className="min-w-0 break-words text-sm text-warm-900 dark:text-warm-100">{PRICE_BOOK_UI.orderItem(i + 1, word)}</span>
                  <span className="flex flex-shrink-0 gap-1">
                    <button type="button" className={smallBtn} disabled={i === 0} aria-label={PRICE_BOOK_UI.ruleAction(PRICE_BOOK_COPY.ruleUp, word)} onClick={() => moveSource(kind, 'up')}>
                      {PRICE_BOOK_COPY.ruleUp}
                    </button>
                    <button type="button" className={smallBtn} disabled={i >= visibleOrder.length - 1} aria-label={PRICE_BOOK_UI.ruleAction(PRICE_BOOK_COPY.ruleDown, word)} onClick={() => moveSource(kind, 'down')}>
                      {PRICE_BOOK_COPY.ruleDown}
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          <label className="flex min-h-[44px] items-start gap-2 text-sm text-warm-800 dark:text-warm-200">
            <input
              type="checkbox"
              className={`${checkboxCls} mt-0.5`}
              checked={form.allowCatalogReference}
              disabled={!catalogOn}
              aria-describedby={`${baseId}-catalog-help`}
              onChange={(e) => setForm((f) => ({ ...f, allowCatalogReference: e.target.checked }))}
            />
            <span>{PRICE_BOOK_COPY.catalogSettingLabel}</span>
          </label>
          <p id={`${baseId}-catalog-help`} className={mutedCls}>
            {PRICE_BOOK_COPY.catalogSettingHelp}
            {!catalogOn ? ` ${PRICE_BOOK_UI.catalogPlatformOff}` : ''}
          </p>
          {group('sources')}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className={subHeadingCls}>{PRICE_BOOK_UI.groupSold}</legend>
          {group('sold')}
        </fieldset>

        {serverError && <p role="alert" className={noticeErrorCls}>{serverError}</p>}
        {Object.keys(errors).length > 0 && <p role="alert" className={noticeErrorCls}>{PRICE_BOOK_UI.settingsFixMarked}</p>}

        {askDiscard && (
          <div role="alertdialog" aria-labelledby={`${baseId}-discard`} className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
            <p id={`${baseId}-discard`} className="text-sm text-amber-900 dark:text-amber-100">{PRICE_BOOK_UI.discardQuestion}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className={secondaryBtn} onClick={() => setAskDiscard(false)}>{PRICE_BOOK_UI.discardNo}</button>
              <button type="button" className={secondaryBtn} onClick={onClose}>{PRICE_BOOK_UI.discardYes}</button>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryBtn} onClick={requestClose} disabled={save.isPending}>{PRICE_BOOK_UI.cancel}</button>
          <button type="button" className={primaryBtn} onClick={press} disabled={save.isPending}>
            {save.isPending ? PRICE_BOOK_UI.saving : PRICE_BOOK_UI.save}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

export default SettingsDrawer;
