/**
 * PreviewEmpty (ADR-134 #642, batch B8): the file was read but holds no card rows.
 * Also used when the server answers EMPTY_FILE ("This file has no card rows.").
 */
import React from 'react';
import { INTAKE_COPY } from '../../lib/cardIntakeCopy';
import { cardCls, headingCls, mutedCls, secondaryBtn } from './ui';

export interface PreviewEmptyProps {
  onChooseAnother: () => void;
}

const PreviewEmpty: React.FC<PreviewEmptyProps> = ({ onChooseAnother }) => (
  <section role="status" className={`${cardCls} text-center`}>
    <h3 className={headingCls}>{INTAKE_COPY.previewEmptyHeading}</h3>
    <p className={`mx-auto mt-2 max-w-md ${mutedCls}`}>{INTAKE_COPY.previewEmptyBody}</p>
    <div className="mt-4 flex justify-center">
      <button type="button" onClick={onChooseAnother} className={secondaryBtn}>
        {INTAKE_COPY.previewEmptyAction}
      </button>
    </div>
  </section>
);

export default PreviewEmpty;
