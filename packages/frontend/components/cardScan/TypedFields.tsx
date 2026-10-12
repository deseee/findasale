/**
 * TypedFields (ADR-138 batch B7): the card name, set and number the seller can type when the card list has no match for the
 * picture (or does not cover the game). What the seller types always wins. Each box is saved when the seller leaves it.
 * "Use as typed" saves the card with exactly these details and no link to the card list.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import type { ScanEntry, ScanEntryPatch } from '../../lib/cardScan';
import { patchUseAsTyped } from '../../lib/cardScanQueue';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import { inputCls, labelCls, mutedCls, secondaryBtn } from './ui';

export interface TypedFieldsProps {
  entry: ScanEntry;
  disabled?: boolean;
  onPatch: (patch: ScanEntryPatch) => void;
}

function initial(entry: ScanEntry) {
  const read = entry.read;
  return {
    name: entry.chosen.cardName || (read && read.name) || '',
    set: entry.chosen.setCode || (read && read.setCode) || '',
    number: entry.chosen.collectorNumber || (read && read.collectorNumber) || '',
  };
}

const TypedFields: React.FC<TypedFieldsProps> = ({ entry, disabled, onPatch }) => {
  const base = useId();
  const { name: initName, set: initSet, number: initNumber } = initial(entry);
  const [name, setName] = useState(initName);
  const [setCode, setSetCode] = useState(initSet);
  const [number, setNumber] = useState(initNumber);
  const dirty = useRef(false);

  // The boxes follow the server only when the saved details really changed (for example from another device), so a refresh of
  // the list never wipes what the seller is typing.
  useEffect(() => {
    setName(initName);
    setSetCode(initSet);
    setNumber(initNumber);
    dirty.current = false;
  }, [initName, initSet, initNumber]);

  const touched = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    dirty.current = true;
    setter(e.target.value);
  };

  const saveOnLeave = () => {
    if (!dirty.current) return;
    dirty.current = false;
    onPatch({ cardName: name.trim() === '' ? null : name.trim(), setCode: setCode.trim() === '' ? null : setCode.trim(), collectorNumber: number.trim() === '' ? null : number.trim() });
  };

  const useAsTyped = () => {
    dirty.current = false;
    const patch: ScanEntryPatch = { ...patchUseAsTyped() };
    if (name.trim() !== '') patch.cardName = name.trim();
    if (setCode.trim() !== '') patch.setCode = setCode.trim();
    const setName = entry.chosen.setName || (entry.read && entry.read.setName) || null;
    if (setName) patch.setName = setName;
    if (number.trim() !== '') patch.collectorNumber = number.trim();
    const game = entry.chosen.game || (entry.read && entry.read.game) || null;
    if (game) patch.game = game;
    onPatch(patch);
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label htmlFor={`${base}-name`} className={labelCls}>
            {SCAN_COPY.nameLabel}
          </label>
          <input id={`${base}-name`} type="text" maxLength={200} autoComplete="off" value={name} disabled={disabled} onChange={touched(setName)} onBlur={saveOnLeave} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`${base}-set`} className={labelCls}>
            {SCAN_COPY.setLabel}
          </label>
          <input id={`${base}-set`} type="text" maxLength={20} autoComplete="off" value={setCode} disabled={disabled} onChange={touched(setSetCode)} onBlur={saveOnLeave} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`${base}-number`} className={labelCls}>
            {SCAN_COPY.numberLabel}
          </label>
          <input id={`${base}-number`} type="text" maxLength={20} autoComplete="off" value={number} disabled={disabled} onChange={touched(setNumber)} onBlur={saveOnLeave} className={inputCls} />
        </div>
      </div>
      {!entry.chosen.acceptAsTyped ? (
        <div className="space-y-1">
          <button type="button" disabled={disabled || name.trim() === ''} onClick={useAsTyped} className={secondaryBtn}>
            {SCAN_COPY.useAsTyped}
          </button>
          <p className={mutedCls}>{SCAN_COPY.useAsTypedHint}</p>
        </div>
      ) : null}
    </div>
  );
};

export default TypedFields;
