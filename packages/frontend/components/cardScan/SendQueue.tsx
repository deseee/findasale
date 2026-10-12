/**
 * SendQueue (ADR-138 batch B7): where the pictures are on their way to the server.
 *
 * Shows how many are waiting, sending or failed, and what to do about each failure: try again, or dismiss it. After a quota,
 * a daily cap or a switched-off feature, sending stops on its own and the rest are kept; the seller resumes when it is fixed.
 * Nothing here is a count of cards: a picture becomes a card only when the server has read it.
 */
import React from 'react';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import type { UploadSnapshot } from '../../lib/cardScanQueue';
import ScanNotice from './ScanNotice';
import { headingCls, mutedCls, secondaryBtn, smallBtn } from './ui';

export interface SendQueueProps {
  snapshot: UploadSnapshot;
  onRetry: (clientEntryId: string) => void;
  onRetryAll: () => void;
  onDismiss: (clientEntryId: string) => void;
  onResume: () => void;
}

const SendQueue: React.FC<SendQueueProps> = ({ snapshot, onRetry, onRetryAll, onDismiss, onResume }) => {
  const failedItems = snapshot.items.filter((i) => i.status === 'FAILED');
  const busy = snapshot.pending + snapshot.sending > 0;
  const allDone = !busy && snapshot.failed === 0 && !snapshot.halted && snapshot.doneCount > 0;
  const nothing = !busy && snapshot.failed === 0 && !snapshot.halted && snapshot.doneCount === 0;

  return (
    <section aria-labelledby="cs-send-heading" className="min-w-0 space-y-3">
      <h3 id="cs-send-heading" className={headingCls}>
        {SCAN_COPY.sendQueueHeading}
      </h3>

      <div aria-live="polite" className="space-y-1 text-sm text-warm-800 dark:text-warm-100">
        {snapshot.sending > 0 ? <p>{SCAN_COPY.sendSending(snapshot.sending)}</p> : null}
        {snapshot.pending > 0 ? <p>{SCAN_COPY.sendWaiting(snapshot.pending)}</p> : null}
        {snapshot.failed > 0 ? <p>{SCAN_COPY.sendFailed(snapshot.failed)}</p> : null}
        {allDone ? <p>{SCAN_COPY.sendAllDone}</p> : null}
        {nothing ? <p className={mutedCls}>{SCAN_COPY.sendNothingWaiting}</p> : null}
      </div>

      {snapshot.halted ? (
        <ScanNotice tone="warn" text={snapshot.haltFailure ? snapshot.haltFailure.message : SCAN_COPY.sendHalted} help={snapshot.haltFailure ? snapshot.haltFailure.help : null}>
          <p className="text-sm">{SCAN_COPY.sendHalted}</p>
          <button type="button" onClick={onResume} className={secondaryBtn}>
            {SCAN_COPY.sendResume}
          </button>
        </ScanNotice>
      ) : snapshot.paused && busy ? (
        <ScanNotice tone="info" text={SCAN_COPY.sendPaused}>
          <button type="button" onClick={onResume} className={secondaryBtn}>
            {SCAN_COPY.sendResume}
          </button>
        </ScanNotice>
      ) : null}

      {failedItems.length > 0 ? (
        <div className="space-y-2">
          {failedItems.length > 1 ? (
            <button type="button" onClick={onRetryAll} className={secondaryBtn}>
              {SCAN_COPY.sendRetryAll}
            </button>
          ) : null}
          <ul className="space-y-2">
            {failedItems.map((item) => (
              <li key={item.clientEntryId} className="min-w-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-900/20">
                <p className="break-words font-medium text-red-900 dark:text-red-100">{item.fileName}</p>
                {item.failure ? (
                  <p className="mt-1 break-words text-red-800 dark:text-red-200">
                    {item.failure.message} {item.failure.help}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={() => onRetry(item.clientEntryId)} className={smallBtn}>
                    {SCAN_COPY.sendRetry}
                  </button>
                  <button type="button" onClick={() => onDismiss(item.clientEntryId)} className={smallBtn}>
                    {SCAN_COPY.sendDismiss}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export default SendQueue;
