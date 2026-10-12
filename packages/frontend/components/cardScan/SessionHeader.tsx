/**
 * SessionHeader (ADR-138 batch B7): the name of this scan, a few plain status lines, and the ways out of it.
 *
 *  - Status lines: how many Smart tags are left this month, whether the card list is ready, and (for a scan fed by Delver) how long
 *    ago Delver last sent something.
 *  - "Back to my scans" leaves the scan open; pictures not yet sent are kept in this browser and come back when it is opened.
 *  - "Discard this scan" asks first, and says that the stock is not changed. A scan that is being saved or is closed can not be
 *    discarded.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import type { ScanFailure, ScanResult, ScanSession } from '../../lib/cardScan';
import { SCAN_COPY, delverStatusLine } from '../../lib/cardScanCopy';
import { secondsSince } from '../../lib/cardScanQueue';
import ScanNotice from './ScanNotice';
import { headingCls, mutedCls, secondaryBtn, smallBtn } from './ui';

export interface SessionHeaderProps {
  session: ScanSession;
  /** Smart tags left this month, or null when the count is not known or Smart scan is off. */
  smartTagsRemaining: number | null;
  catalogReady: boolean;
  delverAt: string | null;
  onLeave: () => void;
  onDiscard: () => Promise<ScanResult<{ status: string }>>;
  onDiscarded: () => void;
}

const SessionHeader: React.FC<SessionHeaderProps> = ({ session, smartTagsRemaining, catalogReady, delverAt, onLeave, onDiscard, onDiscarded }) => {
  const base = useId();
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  const keepRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirming && keepRef.current) keepRef.current.focus();
  }, [confirming]);

  const name = session.label || SCAN_COPY.sessionUnnamed;
  const fromDelver = session.source === 'DELVER' || !!delverAt;
  const canDiscard = session.status === 'OPEN';

  const discard = async () => {
    if (discarding) return;
    setDiscarding(true);
    setFailure(null);
    try {
      const result = await onDiscard();
      if (result.ok) onDiscarded();
      else {
        setFailure(result.failure);
        setConfirming(false);
      }
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <section aria-labelledby={`${base}-name`} className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h2 id={`${base}-name`} className={`break-words ${headingCls}`}>
          {name}
        </h2>
        <button type="button" onClick={onLeave} className={secondaryBtn}>
          {SCAN_COPY.leaveScan}
        </button>
      </div>

      <div className="space-y-1">
        {smartTagsRemaining !== null ? <p className={mutedCls}>{SCAN_COPY.smartScanTagsLeft(smartTagsRemaining)}</p> : null}
        {fromDelver ? <p className={mutedCls}>{delverStatusLine(secondsSince(delverAt, Date.now()))}</p> : null}
        {!catalogReady ? <p className={mutedCls}>{SCAN_COPY.cardListNotReady}</p> : null}
      </div>

      {failure ? <ScanNotice tone="error" text={failure.message} help={failure.help} onDismiss={() => setFailure(null)} /> : null}

      {canDiscard ? (
        confirming ? (
          <div role="group" aria-label={SCAN_COPY.discardButton} className="min-w-0 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm text-red-900 dark:text-red-100">{SCAN_COPY.discardConfirm}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" ref={keepRef} disabled={discarding} onClick={() => setConfirming(false)} className={smallBtn}>
                {SCAN_COPY.discardConfirmNo}
              </button>
              <button type="button" disabled={discarding} onClick={() => void discard()} className={smallBtn}>
                {SCAN_COPY.discardConfirmYes}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={smallBtn}>
            {SCAN_COPY.discardButton}
          </button>
        )
      ) : null}
    </section>
  );
};

export default SessionHeader;
