/**
 * RuleEditor (ADR-140 section 11.2): the short form for one rule, in the order the ADR gives: Which cards, Start from, Then,
 * Round, and for buying Pay. A plain sentence under the form shows what the rule will say (describeRule). The form turns what
 * was typed into the request body (inputFromDraft); the server checks every number again. Escape cancels.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RULE_NAME_MAX_CHARS, priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookFamily, PriceBookRule, PriceBookRuleInput, PriceBookVocabulary } from '../../lib/priceBook';
import {
  BASIS_LABELS,
  FINISH_LABELS,
  PRICE_BOOK_COPY,
  PRICE_BOOK_UI,
  PRICE_SOURCE_LABELS,
  RARITY_CLASS_LABELS,
  ROUNDING_DIRECTION_LABELS,
  ROUNDING_MODE_LABELS,
  RULE_GAME_WORDS,
  RULE_LANGUAGE_WORDS,
  SOURCE_PHRASES,
  VARIANT_LABELS,
} from '../../lib/priceBookCopy';
import { describeRule, formatBps, formatMoney, parseMoneyToCents, parsePercentToBps } from '../../lib/priceBookRules';
import type { RuleDescribable } from '../../lib/priceBookRules';
import {
  checkboxCls,
  headingCls,
  inputCls,
  labelCls,
  mutedCls,
  noticeErrorCls,
  noticeInfoCls,
  optionsFrom,
  primaryBtn,
  secondaryBtn,
  sectionCls,
} from './ui';
import { useCardVocabulary } from './usePriceBookData';

// ---------------------------------------------------------------------------
// Draft <-> request body (pure)
// ---------------------------------------------------------------------------

export interface RuleDraft {
  name: string;
  enabled: boolean;
  game: string;
  setCode: string;
  rarityClass: string;
  rarityText: string;
  finish: string;
  language: string;
  variantToken: string;
  refMinText: string;
  refMaxText: string;
  basis: string;
  sourceKinds: string[];
  fixedText: string;
  percentText: string;
  addMode: 'add' | 'subtract';
  addText: string;
  marginText: string;
  floorText: string;
  ceilingText: string;
  roundingMode: string;
  roundingDirection: string;
  creditText: string;
  minOfferText: string;
}

function money(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}

export function draftFromRule(rule: PriceBookRule | null): RuleDraft {
  if (!rule) {
    return {
      name: '',
      enabled: true,
      game: '',
      setCode: '',
      rarityClass: '',
      rarityText: '',
      finish: '',
      language: '',
      variantToken: '',
      refMinText: '',
      refMaxText: '',
      basis: 'REFERENCE',
      sourceKinds: [],
      fixedText: '',
      percentText: '100',
      addMode: 'add',
      addText: '',
      marginText: '',
      floorText: '',
      ceilingText: '',
      roundingMode: '',
      roundingDirection: '',
      creditText: '',
      minOfferText: '',
    };
  }
  return {
    name: rule.name,
    enabled: rule.enabled,
    game: rule.game || '',
    setCode: rule.setCode || '',
    rarityClass: rule.rarityClass || '',
    rarityText: rule.rarityText || '',
    finish: rule.finish || '',
    language: rule.language || '',
    variantToken: rule.variantToken || '',
    refMinText: money(rule.refMinCents),
    refMaxText: money(rule.refMaxCents),
    basis: rule.basis,
    sourceKinds: rule.sourceKinds.slice(),
    fixedText: money(rule.fixedCents),
    percentText: formatBps(rule.percentBps),
    addMode: rule.addCents < 0 ? 'subtract' : 'add',
    addText: rule.addCents === 0 ? '' : money(Math.abs(rule.addCents)),
    marginText: rule.minMarginBps === null ? '' : formatBps(rule.minMarginBps),
    floorText: money(rule.floorCents),
    ceilingText: money(rule.ceilingCents),
    roundingMode: rule.roundingMode || '',
    roundingDirection: rule.roundingDirection || '',
    creditText: rule.creditBps === null ? '' : formatBps(rule.creditBps),
    minOfferText: money(rule.minOfferCents),
  };
}

function orNull(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

/** A money field: empty is null (no value), a good amount is cents, anything else is undefined (a problem). */
function moneyField(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  const c = parseMoneyToCents(text);
  return c === null ? undefined : c;
}

export interface RuleBuild {
  input: PriceBookRuleInput | null;
  /** Field name to the plain message to show next to it. Empty when the form is good. */
  errors: Record<string, string>;
}

/** Turns the typed form into the body the server takes. Numbers that do not read are reported by field, never guessed. */
export function inputFromDraft(draft: RuleDraft, family: PriceBookFamily): RuleBuild {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  if (name === '') errors.name = PRICE_BOOK_UI.errorRuleName;
  else if (name.length > RULE_NAME_MAX_CHARS) errors.name = PRICE_BOOK_UI.errorRuleNameLong(RULE_NAME_MAX_CHARS);

  const refMin = moneyField(draft.refMinText);
  const refMax = moneyField(draft.refMaxText);
  if (refMin === undefined) errors.refMin = PRICE_BOOK_UI.errorField(PRICE_BOOK_UI.fieldWorthFrom);
  if (refMax === undefined) errors.refMax = PRICE_BOOK_UI.errorField(PRICE_BOOK_UI.fieldWorthTo);
  if (typeof refMin === 'number' && typeof refMax === 'number' && refMin > refMax) errors.refMax = PRICE_BOOK_UI.errorRange(PRICE_BOOK_UI.fieldWorthFrom, PRICE_BOOK_UI.fieldWorthTo);

  const fixed = moneyField(draft.fixedText);
  if (draft.basis === 'FIXED_CENTS' && (fixed === undefined || fixed === null || fixed < 1)) errors.fixed = PRICE_BOOK_UI.errorField(PRICE_BOOK_UI.fieldFixedPrice);

  let percentBps = 10000;
  if (draft.basis !== 'FIXED_CENTS') {
    const p = parsePercentToBps(draft.percentText);
    if (p === null || p < 1 || p > 100000) errors.percent = PRICE_BOOK_UI.errorField(PRICE_BOOK_UI.fieldPercent);
    else percentBps = p;
  }

  const add = moneyField(draft.addText);
  if (add === undefined) errors.add = PRICE_BOOK_UI.errorField(PRICE_BOOK_UI.fieldAddAmount);
  let margin: number | null = null;
  if (draft.marginText.trim() !== '') {
    const m = parsePercentToBps(draft.marginText);
    if (m === null) errors.margin = PRICE_BOOK_UI.errorField(PRICE_BOOK_UI.fieldMargin);
    else margin = m;
  }
  const floor = moneyField(draft.floorText);
  const ceiling = moneyField(draft.ceilingText);
  if (floor === undefined) errors.floor = PRICE_BOOK_UI.errorField(PRICE_BOOK_UI.fieldNeverBelow);
  if (ceiling === undefined) errors.ceiling = PRICE_BOOK_UI.errorField(PRICE_BOOK_UI.fieldNeverAbove);
  if (typeof floor === 'number' && typeof ceiling === 'number' && floor > ceiling) errors.ceiling = PRICE_BOOK_UI.errorRange(PRICE_BOOK_UI.fieldNeverBelow, PRICE_BOOK_UI.fieldNeverAbove);

  let creditBps: number | null = null;
  let minOffer: number | null = null;
  if (family === 'BUYLIST') {
    if (draft.creditText.trim() !== '') {
      const c = parsePercentToBps(draft.creditText);
      if (c === null || c < 10000 || c > 30000) errors.credit = PRICE_BOOK_UI.errorCreditRange;
      else creditBps = c;
    }
    const mo = moneyField(draft.minOfferText);
    if (mo === undefined) errors.minOffer = PRICE_BOOK_UI.errorField(PRICE_BOOK_UI.fieldMinOffer);
    else minOffer = mo;
  }

  if (Object.keys(errors).length > 0) return { input: null, errors };

  const input: PriceBookRuleInput = {
    family,
    name,
    enabled: draft.enabled,
    game: orNull(draft.game),
    setCode: orNull(draft.setCode),
    rarityClass: orNull(draft.rarityClass),
    rarityText: orNull(draft.rarityText),
    finish: orNull(draft.finish),
    language: orNull(draft.language),
    variantToken: orNull(draft.variantToken),
    refMinCents: refMin === undefined ? null : refMin,
    refMaxCents: refMax === undefined ? null : refMax,
    sourceKinds: draft.basis === 'REFERENCE' ? draft.sourceKinds.slice() : [],
    basis: draft.basis,
    percentBps,
    addCents: typeof add === 'number' ? (draft.addMode === 'subtract' ? -add : add) : 0,
    fixedCents: draft.basis === 'FIXED_CENTS' && typeof fixed === 'number' ? fixed : null,
    floorCents: floor === undefined ? null : floor,
    ceilingCents: ceiling === undefined ? null : ceiling,
    minMarginBps: margin,
    roundingMode: orNull(draft.roundingMode),
    roundingDirection: orNull(draft.roundingMode) ? orNull(draft.roundingDirection) : null,
    creditBps,
    minOfferCents: minOffer,
  };
  return { input, errors };
}

/** What describeRule reads from a half-filled form: numbers that do not read yet are left out instead of blocking the sentence. */
export function describableFromDraft(draft: RuleDraft, family: PriceBookFamily): RuleDescribable {
  const m = (t: string): number | null => {
    const c = t.trim() === '' ? null : parseMoneyToCents(t);
    return c === null ? null : c;
  };
  const p = parsePercentToBps(draft.percentText);
  const add = m(draft.addText);
  const out: RuleDescribable = {
    family,
    game: orNull(draft.game),
    setCode: orNull(draft.setCode),
    rarityClass: orNull(draft.rarityClass),
    rarityText: orNull(draft.rarityText),
    finish: orNull(draft.finish),
    language: orNull(draft.language),
    variantToken: orNull(draft.variantToken),
    refMinCents: m(draft.refMinText),
    refMaxCents: m(draft.refMaxText),
    sourceKinds: draft.basis === 'REFERENCE' ? draft.sourceKinds : [],
    basis: draft.basis,
    percentBps: draft.basis === 'FIXED_CENTS' ? 10000 : p === null ? 10000 : p,
    addCents: add === null ? 0 : draft.addMode === 'subtract' ? -add : add,
    fixedCents: m(draft.fixedText),
    floorCents: m(draft.floorText),
    ceilingCents: m(draft.ceilingText),
    minMarginBps: draft.marginText.trim() === '' ? null : parsePercentToBps(draft.marginText),
    roundingMode: orNull(draft.roundingMode),
    roundingDirection: orNull(draft.roundingMode) ? orNull(draft.roundingDirection) : null,
    creditBps: family === 'BUYLIST' && draft.creditText.trim() !== '' ? parsePercentToBps(draft.creditText) : null,
    minOfferCents: family === 'BUYLIST' ? m(draft.minOfferText) : null,
  };
  return out;
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export interface RuleEditorProps {
  family: PriceBookFamily;
  /** The rule being edited, or null for a new rule. */
  rule: PriceBookRule | null;
  vocabulary: PriceBookVocabulary;
  /** The book version, sent as ifVersion when a rule is replaced. */
  bookVersion: number;
  onCancel: () => void;
  onSaved: () => void;
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  help?: string;
  children: (describedBy: string | undefined, invalid: boolean) => React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ id, label, error, help, children }) => {
  const errId = `${id}-err`;
  const helpId = `${id}-help`;
  const describedBy = [error ? errId : '', help ? helpId : ''].filter((x) => x).join(' ') || undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children(describedBy, !!error)}
      {help && <p id={helpId} className="mt-1 text-xs text-warm-500 dark:text-warm-400">{help}</p>}
      {error && <p id={errId} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
};

const RuleEditor: React.FC<RuleEditorProps> = ({ family, rule, vocabulary, bookVersion, onCancel, onSaved }) => {
  const baseId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const vocab = useCardVocabulary().data || null;
  const [draft, setDraft] = useState<RuleDraft>(() => draftFromRule(rule));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (nameRef.current) nameRef.current.focus();
  }, []);

  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void => setDraft((d) => ({ ...d, [key]: value }));

  const mutation = useMutation({
    mutationFn: (input: PriceBookRuleInput) =>
      rule ? priceBookApi.updateRule(rule.id, input, bookVersion) : priceBookApi.createRule(input),
    onSuccess: () => onSaved(),
    onError: (err) => setFormError(readPriceBookError(err).message),
  });

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    setFormError('');
    const built = inputFromDraft(draft, family);
    setErrors(built.errors);
    if (built.input) mutation.mutate(built.input);
  };

  const games = optionsFrom(vocab ? vocab.games : null, RULE_GAME_WORDS);
  const languages = optionsFrom(vocab ? vocab.languages : null, RULE_LANGUAGE_WORDS);
  const rarities = optionsFrom(vocabulary.rarityClass, RARITY_CLASS_LABELS, ['UNKNOWN']);
  const finishes = optionsFrom(vocabulary.finish, FINISH_LABELS, ['ANY']);
  const variants = optionsFrom(vocabulary.variantToken, VARIANT_LABELS);
  const bases = optionsFrom(vocabulary.basis, BASIS_LABELS, family === 'RETAIL' ? ['RETAIL_PRICE'] : []);
  const sources = optionsFrom(vocabulary.referenceKind, SOURCE_PHRASES, ['LICENSED_FEED']);
  const roundingModes = optionsFrom(vocabulary.roundingMode, ROUNDING_MODE_LABELS);
  const roundingDirections = optionsFrom(vocabulary.roundingDirection, ROUNDING_DIRECTION_LABELS);

  const sentence = describeRule(describableFromDraft(draft, family));
  const idOf = (name: string): string => `${baseId}-${name}`;
  const titleId = idOf('title');

  const anyOption = <option value="">{PRICE_BOOK_UI.anyOption}</option>;
  const group = 'min-w-0 space-y-3 rounded-lg border border-warm-200 p-3 dark:border-gray-700';
  const legend = 'px-1 text-sm font-semibold text-warm-900 dark:text-warm-100';

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      aria-labelledby={titleId}
      noValidate
      className={sectionCls}
    >
      <h3 id={titleId} className={headingCls}>{rule ? PRICE_BOOK_UI.editRuleHeading : PRICE_BOOK_UI.newRuleHeading(family === 'RETAIL' ? PRICE_BOOK_COPY.sellingHeading : PRICE_BOOK_COPY.buyingHeading)}</h3>

      <Field id={idOf('name')} label={PRICE_BOOK_UI.fieldRuleName} error={errors.name}>
        {(d, invalid) => (
          <input
            ref={nameRef}
            id={idOf('name')}
            className={inputCls}
            type="text"
            maxLength={RULE_NAME_MAX_CHARS}
            value={draft.name}
            aria-invalid={invalid}
            aria-describedby={d}
            onChange={(e) => set('name', e.target.value)}
          />
        )}
      </Field>

      <fieldset className={group}>
        <legend className={legend}>{PRICE_BOOK_COPY.groupWhichCards}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id={idOf('game')} label={PRICE_BOOK_UI.fieldGame}>
            {() => (
              <select id={idOf('game')} className={inputCls} value={draft.game} onChange={(e) => set('game', e.target.value)}>
                {anyOption}
                {games.map((g) => <option key={g.code} value={g.code}>{g.label}</option>)}
              </select>
            )}
          </Field>
          <Field id={idOf('set')} label={PRICE_BOOK_UI.fieldSetCode}>
            {() => <input id={idOf('set')} className={inputCls} type="text" maxLength={20} value={draft.setCode} onChange={(e) => set('setCode', e.target.value)} />}
          </Field>
          <Field id={idOf('rarity')} label={PRICE_BOOK_UI.fieldRarity}>
            {() => (
              <select id={idOf('rarity')} className={inputCls} value={draft.rarityClass} onChange={(e) => set('rarityClass', e.target.value)}>
                {anyOption}
                {rarities.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            )}
          </Field>
          <Field id={idOf('raritytext')} label={PRICE_BOOK_UI.fieldRarityText}>
            {() => <input id={idOf('raritytext')} className={inputCls} type="text" maxLength={60} value={draft.rarityText} onChange={(e) => set('rarityText', e.target.value)} />}
          </Field>
          <Field id={idOf('finish')} label={PRICE_BOOK_UI.fieldFinish}>
            {() => (
              <select id={idOf('finish')} className={inputCls} value={draft.finish} onChange={(e) => set('finish', e.target.value)}>
                {anyOption}
                {finishes.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
              </select>
            )}
          </Field>
          <Field id={idOf('variant')} label={PRICE_BOOK_UI.fieldVariant}>
            {() => (
              <select id={idOf('variant')} className={inputCls} value={draft.variantToken} onChange={(e) => set('variantToken', e.target.value)}>
                {anyOption}
                {variants.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
              </select>
            )}
          </Field>
          <Field id={idOf('language')} label={PRICE_BOOK_UI.fieldLanguage}>
            {() => (
              <select id={idOf('language')} className={inputCls} value={draft.language} onChange={(e) => set('language', e.target.value)}>
                {anyOption}
                {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Field id={idOf('refmin')} label={PRICE_BOOK_UI.fieldWorthFrom} error={errors.refMin}>
              {(d, invalid) => <input id={idOf('refmin')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.refMinText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('refMinText', e.target.value)} />}
            </Field>
            <Field id={idOf('refmax')} label={PRICE_BOOK_UI.fieldWorthTo} error={errors.refMax}>
              {(d, invalid) => <input id={idOf('refmax')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.refMaxText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('refMaxText', e.target.value)} />}
            </Field>
          </div>
        </div>
      </fieldset>

      <fieldset className={group}>
        <legend className={legend}>{PRICE_BOOK_COPY.groupStartFrom}</legend>
        <Field id={idOf('basis')} label={PRICE_BOOK_UI.fieldBasis}>
          {() => (
            <select id={idOf('basis')} className={inputCls} value={draft.basis} onChange={(e) => set('basis', e.target.value)}>
              {bases.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
            </select>
          )}
        </Field>
        {draft.basis === 'REFERENCE' && (
          <fieldset className="space-y-1">
            <legend className={labelCls}>{PRICE_BOOK_UI.fieldSources}</legend>
            <p className={mutedCls}>{PRICE_BOOK_UI.sourcesHelp}</p>
            {sources.map((s) => (
              <label key={s.code} className="flex min-h-[44px] items-center gap-2 text-sm text-warm-800 dark:text-warm-200">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={draft.sourceKinds.indexOf(s.code) >= 0}
                  onChange={(e) =>
                    set('sourceKinds', e.target.checked ? draft.sourceKinds.concat([s.code]) : draft.sourceKinds.filter((k) => k !== s.code))
                  }
                />
                {PRICE_SOURCE_LABELS[s.code] || s.label}
              </label>
            ))}
          </fieldset>
        )}
        {draft.basis === 'FIXED_CENTS' && (
          <Field id={idOf('fixed')} label={PRICE_BOOK_UI.fieldFixedPrice} error={errors.fixed}>
            {(d, invalid) => <input id={idOf('fixed')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.fixedText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('fixedText', e.target.value)} />}
          </Field>
        )}
      </fieldset>

      <fieldset className={group}>
        <legend className={legend}>{PRICE_BOOK_COPY.groupThen}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {draft.basis !== 'FIXED_CENTS' && (
            <Field id={idOf('percent')} label={PRICE_BOOK_UI.fieldPercent} error={errors.percent}>
              {(d, invalid) => <input id={idOf('percent')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.percentText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('percentText', e.target.value)} />}
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field id={idOf('addmode')} label={PRICE_BOOK_UI.fieldAddOrTakeOff}>
              {() => (
                <select id={idOf('addmode')} className={inputCls} value={draft.addMode} onChange={(e) => set('addMode', e.target.value === 'subtract' ? 'subtract' : 'add')}>
                  <option value="add">{PRICE_BOOK_UI.addOption}</option>
                  <option value="subtract">{PRICE_BOOK_UI.takeOffOption}</option>
                </select>
              )}
            </Field>
            <Field id={idOf('add')} label={PRICE_BOOK_UI.fieldAddAmount} error={errors.add}>
              {(d, invalid) => <input id={idOf('add')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.addText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('addText', e.target.value)} />}
            </Field>
          </div>
          <Field id={idOf('floor')} label={PRICE_BOOK_UI.fieldNeverBelow} error={errors.floor}>
            {(d, invalid) => <input id={idOf('floor')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.floorText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('floorText', e.target.value)} />}
          </Field>
          <Field id={idOf('ceiling')} label={PRICE_BOOK_UI.fieldNeverAbove} error={errors.ceiling}>
            {(d, invalid) => <input id={idOf('ceiling')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.ceilingText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('ceilingText', e.target.value)} />}
          </Field>
          <Field id={idOf('margin')} label={PRICE_BOOK_UI.fieldMargin} error={errors.margin} help={PRICE_BOOK_UI.marginHelp}>
            {(d, invalid) => <input id={idOf('margin')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.marginText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('marginText', e.target.value)} />}
          </Field>
        </div>
      </fieldset>

      <fieldset className={group}>
        <legend className={legend}>{PRICE_BOOK_COPY.groupRound}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id={idOf('rmode')} label={PRICE_BOOK_UI.fieldRoundingMode}>
            {() => (
              <select id={idOf('rmode')} className={inputCls} value={draft.roundingMode} onChange={(e) => set('roundingMode', e.target.value)}>
                <option value="">{PRICE_BOOK_UI.usualRounding}</option>
                {roundingModes.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
              </select>
            )}
          </Field>
          <Field id={idOf('rdir')} label={PRICE_BOOK_UI.fieldRoundingDirection}>
            {() => (
              <select id={idOf('rdir')} className={inputCls} value={draft.roundingDirection} disabled={draft.roundingMode === ''} onChange={(e) => set('roundingDirection', e.target.value)}>
                <option value="">{PRICE_BOOK_UI.usualRounding}</option>
                {roundingDirections.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
              </select>
            )}
          </Field>
        </div>
      </fieldset>

      {family === 'BUYLIST' && (
        <fieldset className={group}>
          <legend className={legend}>{PRICE_BOOK_COPY.groupPay}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id={idOf('credit')} label={PRICE_BOOK_UI.fieldCredit} error={errors.credit} help={PRICE_BOOK_UI.creditHelp}>
              {(d, invalid) => <input id={idOf('credit')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.creditText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('creditText', e.target.value)} />}
            </Field>
            <Field id={idOf('minoffer')} label={PRICE_BOOK_UI.fieldMinOffer} error={errors.minOffer}>
              {(d, invalid) => <input id={idOf('minoffer')} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={draft.minOfferText} aria-invalid={invalid} aria-describedby={d} onChange={(e) => set('minOfferText', e.target.value)} />}
            </Field>
          </div>
        </fieldset>
      )}

      <div className={noticeInfoCls} aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide">{PRICE_BOOK_UI.ruleSays}</p>
        <p className="break-words">{sentence}</p>
      </div>

      {formError && <p role="alert" className={noticeErrorCls}>{formError}</p>}
      {Object.keys(errors).length > 0 && <p role="alert" className={noticeErrorCls}>{PRICE_BOOK_UI.fixMarked}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className={secondaryBtn} onClick={onCancel} disabled={mutation.isPending}>{PRICE_BOOK_UI.cancel}</button>
        <button type="submit" className={primaryBtn} disabled={mutation.isPending}>
          {mutation.isPending ? PRICE_BOOK_UI.saving : PRICE_BOOK_UI.saveRule}
        </button>
      </div>
    </form>
  );
};

export default RuleEditor;

// Kept for the render tests: a money amount in the form's own format.
export const formatDraftMoney = (cents: number): string => formatMoney(cents);
