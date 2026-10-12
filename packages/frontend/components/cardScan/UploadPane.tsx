/**
 * UploadPane (ADR-138 batch B7): "Upload pictures". Pictures of cards from the phone's library or a computer, one picture for
 * each card, sent to the same queue as the camera. A JPEG, PNG or WebP that fits the size limit goes as it is; a larger one is
 * made smaller in the browser first. Any other file type is refused with a plain note. Several pictures can be chosen at once.
 */
import React, { useRef, useState } from 'react';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import { prepareUploadFile } from './frameUtils';
import ScanNotice from './ScanNotice';
import { mutedCls, primaryBtn } from './ui';

export interface UploadPaneProps {
  /** False when the scan is not open, so no picture may be added. */
  enabled: boolean;
  maxFrameBytes: number;
  onFrame: (blob: Blob, fileName: string) => void;
}

const UploadPane: React.FC<UploadPaneProps> = ({ enabled, maxFrameBytes, onFrame }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [wrongType, setWrongType] = useState(0);
  const [tooBig, setTooBig] = useState(0);

  const onChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files: File[] = [];
    if (input.files) {
      for (let i = 0; i < input.files.length; i += 1) files.push(input.files[i]);
    }
    // Let the same files be chosen again later.
    input.value = '';
    if (files.length === 0) return;
    setWrongType(0);
    setTooBig(0);
    setPreparing(true);
    let wrong = 0;
    let big = 0;
    try {
      for (let i = 0; i < files.length; i += 1) {
        const prepared = await prepareUploadFile(files[i], maxFrameBytes);
        if (prepared.ok) onFrame(prepared.blob, prepared.fileName);
        else if (prepared.reason === 'WRONG_TYPE') wrong += 1;
        else big += 1;
      }
    } finally {
      setPreparing(false);
      setWrongType(wrong);
      setTooBig(big);
    }
  };

  return (
    <div className="min-w-0 space-y-3">
      <p className={mutedCls}>{SCAN_COPY.chooseImagesHint}</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        disabled={!enabled || preparing}
        onChange={(e) => {
          void onChosen(e);
        }}
      />
      <button
        type="button"
        disabled={!enabled || preparing}
        onClick={() => {
          if (inputRef.current) inputRef.current.click();
        }}
        className={primaryBtn}
      >
        {SCAN_COPY.chooseImages}
      </button>
      <div aria-live="polite" className="space-y-2">
        {preparing ? <p className={mutedCls}>{SCAN_COPY.preparingPictures}</p> : null}
        {wrongType > 0 ? <ScanNotice tone="warn" text={SCAN_COPY.imageWrongType} onDismiss={() => setWrongType(0)} /> : null}
        {tooBig > 0 ? <ScanNotice tone="warn" text={SCAN_COPY.imageTooBig} onDismiss={() => setTooBig(0)} /> : null}
      </div>
    </div>
  );
};

export default UploadPane;
