/**
 * ErrorNotice (ADR-134 #642, batch B8): shows one failure in plain wording.
 * The server's own `error` text comes first (the backend wording is already plain); the "what to do" line from
 * lib/cardIntakeCopy.ts follows. Announced to screen readers as an alert.
 */
import React from 'react';
import type { IntakeFailure } from '../../lib/cardIntake';
import { INTAKE_COPY } from '../../lib/cardIntakeCopy';
import { noticeErrorCls, secondaryBtn } from './ui';

export interface ErrorNoticeProps {
  failure: IntakeFailure;
  onDismiss?: () => void;
  /** Extra controls under the text (for example Try again). */
  children?: React.ReactNode;
}

const ErrorNotice: React.FC<ErrorNoticeProps> = ({ failure, onDismiss, children }) => (
  <div role="alert" className={noticeErrorCls}>
    <p className="break-words font-semibold">{failure.message}</p>
    {failure.help && failure.help !== failure.message ? <p className="mt-1 break-words">{failure.help}</p> : null}
    {children || onDismiss ? (
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {children}
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className={secondaryBtn}>
            {INTAKE_COPY.dismiss}
          </button>
        ) : null}
      </div>
    ) : null}
  </div>
);

export default ErrorNotice;
