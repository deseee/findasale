/**
 * ColumnChooser (ADR-134 #642, batch B8): "Which column is which?" for files whose columns were not recognised
 * (the card name column is required) and for a seller who wants to change what was detected.
 *
 * Sends a columnMapping override: field -> header. A field the seller left empty is omitted (the importer's own
 * detection stays), except a field that was detected before and that the seller switched off, which is sent as an empty
 * string so the backend drops it (services/cardIntake/importers/index.ts applyColumnOverride).
 */
import React, { useState } from 'react';
import type { FieldInfo } from '../../lib/cardIntake';
import { CORE_MAPPING_FIELDS } from '../../lib/cardIntake';
import { INTAKE_COPY } from '../../lib/cardIntakeCopy';
import { cardCls, headingCls, inputCls, labelCls, mutedCls, noticeWarnCls, primaryBtn, secondaryBtn } from './ui';

export interface ColumnChooserProps {
  headers: string[];
  fields: FieldInfo[];
  /** What was detected before (field -> header), or {} when nothing is known. */
  detected: Record<string, string>;
  busy: boolean;
  /** Show the "checking again clears your choices" warning (true once a preview exists). */
  warnReset: boolean;
  onApply: (mapping: Record<string, string>) => void;
}

const ColumnChooser: React.FC<ColumnChooserProps> = ({ headers, fields, detected, busy, warnReset, onApply }) => {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    Object.keys(detected).forEach((k) => {
      if (headers.indexOf(detected[k]) >= 0) init[k] = detected[k];
    });
    return init;
  });
  const [showMore, setShowMore] = useState(false);
  const [triedApply, setTriedApply] = useState(false);

  const core = fields.filter((f) => CORE_MAPPING_FIELDS.indexOf(f.value) >= 0);
  const more = fields.filter((f) => CORE_MAPPING_FIELDS.indexOf(f.value) < 0);
  const shown = showMore ? core.concat(more) : core;
  const missingName = !values.name;

  const apply = () => {
    setTriedApply(true);
    if (missingName) return;
    const out: Record<string, string> = {};
    shown.forEach((f) => {
      const v = values[f.value] || '';
      if (v) out[f.value] = v;
      else if (Object.prototype.hasOwnProperty.call(detected, f.value)) out[f.value] = '';
    });
    onApply(out);
  };

  if (headers.length === 0) {
    return (
      <div className={noticeWarnCls} role="status">
        {INTAKE_COPY.columnsNoHeaders}
      </div>
    );
  }

  return (
    <section aria-labelledby="ci-columns-heading" className={cardCls}>
      <h3 id="ci-columns-heading" className={headingCls}>
        {INTAKE_COPY.columnsHeading}
      </h3>
      <p className={`mt-1 ${mutedCls}`}>{INTAKE_COPY.columnsIntro}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((f) => {
          const id = `ci-col-${f.value}`;
          const invalid = f.value === 'name' && triedApply && missingName;
          return (
            <div key={f.value} className="min-w-0">
              <label htmlFor={id} className={labelCls}>
                {f.label}
                {f.value === 'name' ? <span aria-hidden="true"> *</span> : null}
              </label>
              <select
                id={id}
                className={inputCls}
                value={values[f.value] || ''}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? 'ci-col-name-error' : undefined}
                disabled={busy}
                onChange={(e) => {
                  const v = e.target.value;
                  setValues((prev) => {
                    const next = { ...prev };
                    if (v) next[f.value] = v;
                    else delete next[f.value];
                    return next;
                  });
                }}
              >
                <option value="">{INTAKE_COPY.columnsNone}</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              {invalid ? (
                <p id="ci-col-name-error" className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {INTAKE_COPY.columnsNeedName}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {more.length > 0 ? (
        <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className={`mt-3 ${secondaryBtn}`}>
          {showMore ? INTAKE_COPY.columnsLess : INTAKE_COPY.columnsMore}
        </button>
      ) : null}
      {warnReset ? <p className={`mt-3 ${noticeWarnCls}`}>{INTAKE_COPY.columnsChangeWarning}</p> : null}
      <div className="mt-4">
        <button type="button" onClick={apply} disabled={busy} className={primaryBtn}>
          {INTAKE_COPY.columnsApply}
        </button>
      </div>
    </section>
  );
};

export default ColumnChooser;
