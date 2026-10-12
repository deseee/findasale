/**
 * ScanEntryCard (ADR-138 batch B7): one card in the review queue.
 *
 * What the seller sees: their own picture (kept in this browser only) beside the card from the card list, whole and uncropped,
 * with the Scryfall credit; what Smart scan read; the notes that matter (same card as the last one, name did not match, looks
 * foil); a printing picker; finish and condition chips with a Suggested chip; quantity; price; Skip.
 *
 * Rules (ADR-138 sections 3.6 and 12): a suggestion is only ever applied by a tap. Whatever the seller picked or typed is
 * shown and wins. The server owns readiness, so the "still needed" chips are exactly the server's `needs` list.
 */
import React, { useState } from 'react';
import { candidateFinishes, optionLabel } from '../../lib/cardIntake';
import type { VocabOption } from '../../lib/cardIntake';
import type { ScanEntry, ScanEntryPatch, ScanNeed } from '../../lib/cardScan';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import {
  entryNotices,
  entrySubtitle,
  entryTitle,
  filterLabel,
  filterOf,
  needChips,
  patchCountAsAnother,
  patchIgnoreHeld,
  patchPickPrinting,
  patchSetCondition,
  patchSetFinish,
  patchSetPrice,
  patchSkip,
  patchStepQuantity,
  patchUseSuggestedCondition,
  printingFinishes,
  suggestedChip,
} from '../../lib/cardScanQueue';
import type { ScanFilter } from '../../lib/cardScanQueue';
import CandidatePicker from './CandidatePicker';
import ChipGroup from './ChipGroup';
import Picture from './Picture';
import PriceField from './PriceField';
import QuantityStepper from './QuantityStepper';
import SuggestedPriceLookup from './SuggestedPriceLookup';
import TypedFields from './TypedFields';
import { mutedCls, pillBase, secondaryBtn, smallBtn } from './ui';

export interface ScanEntryCardProps {
  entry: ScanEntry;
  /** True while the scan is open and this card is not being saved or saved already. */
  editable: boolean;
  /** A change to this card is still on its way to the server. */
  saving: boolean;
  /** Object URL of the seller's own picture, or null (the picture is gone after a reload). */
  thumbUrl: string | null;
  /** Catalog pictures of printings the seller picked by search (printing id to picture address). */
  imageCache: Record<string, string>;
  conditions: readonly VocabOption[];
  finishes: readonly VocabOption[];
  selected: boolean;
  onToggleSelect: (entryId: string) => void;
  onChange: (entryId: string, patch: ScanEntryPatch) => void;
  onRememberImage: (printingId: string, imageUrl: string | null) => void;
}

const PILL_CLS: Record<ScanFilter, string> = {
  NEEDS_DECISION: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  READY: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100',
  SKIPPED: 'bg-warm-200 text-warm-800 dark:bg-gray-700 dark:text-gray-100',
  COMMITTED: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100',
};

function readLine(entry: ScanEntry): string {
  const r = entry.read;
  if (!r) return '';
  const parts: string[] = [];
  if (r.name) parts.push(r.name);
  const set = r.setName || r.setCode;
  if (set) parts.push(set);
  if (r.collectorNumber) parts.push('#' + r.collectorNumber);
  return parts.join(', ');
}

const ScanEntryCard: React.FC<ScanEntryCardProps> = ({
  entry,
  editable,
  saving,
  thumbUrl,
  imageCache,
  conditions,
  finishes,
  selected,
  onToggleSelect,
  onChange,
  onRememberImage,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const e = entry;
  const send = (patch: ScanEntryPatch) => onChange(e.id, patch);

  const title = entryTitle(e);
  const subtitle = entrySubtitle(e);
  const filter = filterOf(e);
  const pillText = e.status === 'COMMITTING' ? SCAN_COPY.entrySaving : filterLabel(filter);
  const needsList = needChips(e);
  const needed = (need: ScanNeed) => e.needs.indexOf(need) >= 0;

  const printingId = e.chosen.printingId || e.resolution.printingId;
  const cand = printingId ? e.resolution.candidates.filter((c) => c.printingId === printingId)[0] : undefined;
  const catalogUrl = (cand && cand.imageSmallUrl) || (printingId ? imageCache[printingId] || null : null);

  const pf = printingFinishes(e, finishes);
  let finishCodes = pf.codes;
  if (pf.known) {
    const normal = candidateFinishes({ finishes: pf.codes });
    if (normal.length > 0) finishCodes = normal;
  }
  const finishOptions = finishCodes.map((code) => ({ code, label: optionLabel(finishes, code) }));

  const chip = suggestedChip(e, conditions);
  const notices = entryNotices(e);
  const note = e.resolution.note;
  const catalogCovers = note !== 'GAME_NOT_SERVED' && note !== 'CATALOG_OFF';
  const showPicker = editable && (needed('PRINTING') || e.resolution.status === 'AMBIGUOUS' || pickerOpen);
  const showTyped = e.resolution.status === 'UNMATCHED' || needed('NAME') || e.chosen.acceptAsTyped;
  const graded = !!e.chosen.grader;
  const repeatHeld = !!e.suspectDuplicateOf && editable;
  const read = readLine(e);

  return (
    <article aria-label={title} className="min-w-0 rounded-lg border border-warm-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <header className="flex items-start gap-2">
        {editable ? (
          <label className="flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center">
            <input type="checkbox" className="h-5 w-5 accent-amber-600" checked={selected} onChange={() => onToggleSelect(e.id)} aria-label={SCAN_COPY.selectCard(title)} />
          </label>
        ) : null}
        <div className="min-w-0 flex-1">
          <h4 className="break-words text-base font-semibold text-warm-900 dark:text-warm-100">{title}</h4>
          {subtitle ? <p className={`break-words ${mutedCls}`}>{subtitle}</p> : null}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <span className={`${pillBase} ${PILL_CLS[filter]}`}>{pillText}</span>
          {saving ? (
            <span role="status" className="text-xs text-warm-600 dark:text-warm-300">
              {SCAN_COPY.entrySaving}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mt-3 flex flex-wrap gap-3">
        {thumbUrl || e.source === 'PHOTO' || e.source === 'UPLOAD' ? <Picture url={thumbUrl} alt={SCAN_COPY.thumbnailAlt} emptyText={SCAN_COPY.noPicture} /> : null}
        <Picture url={catalogUrl} alt={SCAN_COPY.catalogImageAlt} emptyText={SCAN_COPY.noCatalogImage} credit={SCAN_COPY.scryfallCredit} />
        {read ? (
          <div className="min-w-0 flex-1 basis-40">
            <p className="text-xs font-semibold uppercase tracking-wide text-warm-600 dark:text-warm-300">{SCAN_COPY.readFromPicture}</p>
            <p className="break-words text-sm text-warm-800 dark:text-warm-100">{read}</p>
          </div>
        ) : null}
      </div>

      {notices.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {notices.map((n) => (
            <li
              key={n.kind}
              className={`rounded-lg border px-3 py-2 text-sm ${
                n.kind === 'ERROR'
                  ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200'
                  : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100'
              }`}
            >
              {n.text}
            </li>
          ))}
        </ul>
      ) : null}

      {repeatHeld ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => send(patchCountAsAnother())} className={secondaryBtn}>
            {SCAN_COPY.countAsAnother}
          </button>
          <button type="button" onClick={() => send(patchIgnoreHeld())} className={secondaryBtn}>
            {SCAN_COPY.sameCardIgnore}
          </button>
        </div>
      ) : null}

      {e.status === 'COMMITTING' ? <p className={`mt-3 ${mutedCls}`}>{SCAN_COPY.entryCommitting}</p> : null}
      {e.status === 'COMMITTED' ? <p className={`mt-3 ${mutedCls}`}>{SCAN_COPY.entryCommitted}</p> : null}

      {needsList.length > 0 && (e.status === 'NEEDS_REVIEW' || e.status === 'ERROR') ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-warm-600 dark:text-warm-300">{SCAN_COPY.entryNeedsHeading}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {needsList.map((n) => (
              <li key={n.need} className={`${pillBase} bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100`}>
                {n.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editable ? (
        <div className="mt-4 space-y-4">
          {showPicker ? (
            <CandidatePicker
              entry={e}
              finishes={finishes}
              allowFilter={catalogCovers}
              onPick={(id, url) => {
                onRememberImage(id, url);
                send(patchPickPrinting(id));
              }}
            />
          ) : catalogCovers ? (
            <button type="button" onClick={() => setPickerOpen(true)} className={smallBtn}>
              {SCAN_COPY.pickPrinting}
            </button>
          ) : null}

          {showTyped ? <TypedFields entry={e} onPatch={send} /> : null}

          <ChipGroup
            label={SCAN_COPY.finishLabel}
            options={finishOptions}
            value={e.chosen.finish}
            needed={needed('FINISH')}
            onChange={(code) => send(patchSetFinish(code))}
          />

          {graded ? (
            <p className={mutedCls}>{SCAN_COPY.gradeLine(e.chosen.grader || '', e.chosen.grade || '')}</p>
          ) : (
            <ChipGroup
              label={SCAN_COPY.conditionLabel}
              options={conditions}
              value={e.chosen.conditionCode}
              needed={needed('CONDITION')}
              onChange={(code) => send(patchSetCondition(code))}
              suggested={
                chip
                  ? {
                      text: chip.text,
                      onUse: () => {
                        const p = patchUseSuggestedCondition(e);
                        if (p) send(p);
                      },
                    }
                  : null
              }
            />
          )}

          <div className="flex flex-wrap items-start gap-4">
            <QuantityStepper
              value={e.chosen.quantity}
              onStep={(delta) => {
                const p = patchStepQuantity(e, delta);
                if (p) send(p);
              }}
            />
            <PriceField value={e.chosen.price} onCommit={(price) => send(patchSetPrice(price))} />
          </div>

          {printingId ? (
            <SuggestedPriceLookup
              printingId={printingId}
              finish={e.chosen.finish}
              conditionCode={graded ? null : e.chosen.conditionCode}
              onUse={(price) => send(patchSetPrice(price))}
            />
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            {e.status === 'SKIPPED' ? (
              <button type="button" onClick={() => send(patchSkip(false))} className={secondaryBtn}>
                {SCAN_COPY.unskipEntry}
              </button>
            ) : (
              <button type="button" onClick={() => send(patchSkip(true))} className={secondaryBtn}>
                {SCAN_COPY.skipEntry}
              </button>
            )}
          </div>
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-warm-800 dark:text-warm-100">
          {e.chosen.finish ? (
            <>
              <dt className={mutedCls}>{SCAN_COPY.finishLabel}</dt>
              <dd>{optionLabel(finishes, e.chosen.finish)}</dd>
            </>
          ) : null}
          {e.chosen.conditionCode ? (
            <>
              <dt className={mutedCls}>{SCAN_COPY.conditionLabel}</dt>
              <dd>{optionLabel(conditions, e.chosen.conditionCode)}</dd>
            </>
          ) : null}
          <dt className={mutedCls}>{SCAN_COPY.quantityLabel}</dt>
          <dd>{e.chosen.quantity}</dd>
          {e.chosen.price !== null ? (
            <>
              <dt className={mutedCls}>{SCAN_COPY.priceLabel}</dt>
              <dd>{e.chosen.price.toFixed(2)}</dd>
            </>
          ) : null}
        </dl>
      )}
    </article>
  );
};

export default React.memo(ScanEntryCard);
