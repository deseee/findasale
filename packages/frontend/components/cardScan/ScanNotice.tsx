/**
 * ScanNotice (ADR-138 batch B7): one short message in plain wording. Errors are announced as alerts, the rest as status.
 * The text always comes from lib/cardScanCopy.ts (or the server's own plain wording for a failure).
 */
import React from 'react';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import { noticeErrorCls, noticeInfoCls, noticeOkCls, noticeWarnCls, secondaryBtn } from './ui';

export type NoticeTone = 'info' | 'warn' | 'error' | 'ok';

export interface ScanNoticeProps {
  tone: NoticeTone;
  text: string;
  help?: string | null;
  onDismiss?: () => void;
  /** Extra controls under the text (for example Try again). */
  children?: React.ReactNode;
}

const TONE_CLS: Record<NoticeTone, string> = {
  info: noticeInfoCls,
  warn: noticeWarnCls,
  error: noticeErrorCls,
  ok: noticeOkCls,
};

const ScanNotice: React.FC<ScanNoticeProps> = ({ tone, text, help, onDismiss, children }) => (
  <div role={tone === 'error' ? 'alert' : 'status'} className={`min-w-0 ${TONE_CLS[tone]}`}>
    <p className="break-words font-medium">{text}</p>
    {help && help !== text ? <p className="mt-1 break-words">{help}</p> : null}
    {children || onDismiss ? (
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {children}
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className={secondaryBtn}>
            {SCAN_COPY.sendDismiss}
          </button>
        ) : null}
      </div>
    ) : null}
  </div>
);

export default ScanNotice;
