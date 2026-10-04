/**
 * CardIntakeFlow (ADR-134 #642, batch B8): the four-step card intake.
 *
 *   1 Upload             choose the file, set the few options, check it (preview), read what was found
 *   2 Condition mapping  every condition word in the file with a suggestion; unconfirmed words block Import
 *   3 Ambiguous rows     pick printings and finishes, skip rows; long lists are windowed
 *   4 Confirm            choose add or replace (no default), prices, then Import; live progress; errors.csv
 *
 * The preview goes through the shared axios client (upload percentage). The confirm goes through fetch with a stream
 * reader (useConfirmImport). Choices are kept on this device per sale and file so a closed tab can pick up again.
 * The add or replace choice is never kept and never defaulted.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../lib/api';
import type { ConditionChoices, DecisionMap, IntakeFailure, IntakeMode, IntakeOptions, PreviewData, PriceSource } from '../../lib/cardIntake';
import {
  DEFAULT_OPTIONS,
  buildConfirmFields,
  buildForm,
  buildPreviewFields,
  checkChosenFile,
  conditionMappingJson,
  confirmBlockers,
  decisionsJson,
  defaultPriceSource,
  earlierBatchFor,
  failureFromError,
  failureFromResponse,
  needsColumnChooser,
  parseHeaderLine,
  parseSavedChoices,
  readPreview,
  restoreChoices,
  savedChoicesKey,
  serializeSavedChoices,
} from '../../lib/cardIntake';
import type { IntakeStepId } from '../../lib/cardIntakeCopy';
import { INTAKE_COPY, INTAKE_STEPS } from '../../lib/cardIntakeCopy';
import ConditionStep from './ConditionStep';
import ConfirmStep from './ConfirmStep';
import ImportRunPanel from './ImportRunPanel';
import PreviewEmpty from './PreviewEmpty';
import PreviewSummary from './PreviewSummary';
import ReviewStep from './ReviewStep';
import StepIndicator from './StepIndicator';
import UploadStep from './UploadStep';
import type { CheckPhase } from './UploadStep';
import { noticeInfoCls, primaryBtn, secondaryBtn } from './ui';
import { useConfirmImport } from './useConfirmImport';
import { useIntakeFormats, useIntakeVocab } from './useIntakeData';

export interface CardIntakeFlowProps {
  saleId: string;
}

function stepIndex(step: IntakeStepId): number {
  return INTAKE_STEPS.findIndex((s) => s.id === step);
}

function readSaved(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSaved(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked storage: the flow works the same, it just cannot remember.
  }
}

const CardIntakeFlow: React.FC<CardIntakeFlowProps> = ({ saleId }) => {
  const formatsQuery = useIntakeFormats();
  const vocab = useIntakeVocab();
  const importer = useConfirmImport(saleId);
  const importStatus = importer.state.status;
  const importRunning = importStatus === 'running';

  const [step, setStep] = useState<IntakeStepId>('upload');
  const [reached, setReached] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [options, setOptions] = useState<IntakeOptions>(DEFAULT_OPTIONS);
  const [phase, setPhase] = useState<CheckPhase>('idle');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [failure, setFailure] = useState<IntakeFailure | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const [emptyFile, setEmptyFile] = useState(false);
  const [chooserHeaders, setChooserHeaders] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [restored, setRestored] = useState(false);
  const [priceSource, setPriceSource] = useState<PriceSource>('NONE');
  const [conditionChoices, setConditionChoices] = useState<ConditionChoices>({});
  const [decisions, setDecisions] = useState<DecisionMap>({});
  const [mode, setMode] = useState<IntakeMode | null>(null);

  const checkAbort = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const formats = formatsQuery.data;
  const busyChecking = phase !== 'idle';

  // Leaving the page ends a running check.
  useEffect(() => {
    return () => {
      if (checkAbort.current) checkAbort.current.abort();
    };
  }, []);

  // Keep the seller's choices on this device (never the add or replace choice).
  useEffect(() => {
    if (!preview) return;
    writeSaved(savedChoicesKey(saleId, preview.fileSha256), serializeSavedChoices({ priceSource, conditions: conditionChoices, decisions }));
  }, [saleId, preview, priceSource, conditionChoices, decisions]);

  // A finished import no longer needs its remembered choices.
  useEffect(() => {
    if (importStatus === 'done' && preview) writeSaved(savedChoicesKey(saleId, preview.fileSha256), null);
  }, [importStatus, saleId, preview]);

  // Move focus to the new step heading (or the result heading) so keyboard and screen reader users land in the right place.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const resultHeading = importStatus !== 'idle' && importStatus !== 'running' ? document.getElementById('ci-run-heading') : null;
    if (resultHeading) resultHeading.focus();
    else if (headingRef.current) headingRef.current.focus();
  }, [step, importStatus]);

  const clearChecked = useCallback(() => {
    setPreview(null);
    setRestored(false);
    setEmptyFile(false);
    setChooserHeaders(null);
    setConditionChoices({});
    setDecisions({});
    setMode(null);
    setReached(0);
    importer.reset();
    // importer.reset is stable; the whole object is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importer.reset]);

  const abortCheck = useCallback(() => {
    const controller = checkAbort.current;
    checkAbort.current = null;
    if (controller) controller.abort();
  }, []);

  const resetAll = useCallback(() => {
    abortCheck();
    setPhase('idle');
    setUploadPercent(0);
    setFailure(null);
    setWasCancelled(false);
    setFile(null);
    setFileProblem(null);
    setOptions(DEFAULT_OPTIONS);
    clearChecked();
    setStep('upload');
  }, [abortCheck, clearChecked]);

  const onFile = useCallback(
    (chosen: File | null) => {
      abortCheck();
      setPhase('idle');
      setFailure(null);
      setWasCancelled(false);
      clearChecked();
      setOptions((prev) => ({ ...prev, columnMapping: null }));
      setFile(chosen);
      if (!chosen) {
        setFileProblem(null);
        return;
      }
      setFileProblem(checkChosenFile(chosen, formats ? formats.limits.maxFileMb : Infinity));
    },
    [abortCheck, clearChecked, formats]
  );

  const runCheck = useCallback(
    async (chosen: File, opts: IntakeOptions, restore: boolean) => {
      abortCheck();
      const controller = new AbortController();
      checkAbort.current = controller;
      setFailure(null);
      setWasCancelled(false);
      clearChecked();
      setUploadPercent(0);
      setPhase('uploading');
      try {
        // The preview always asks for FILE prices so the counts show what the file holds; the seller picks on the last step.
        const form = buildForm(buildPreviewFields(opts, 'FILE'), chosen, chosen.name);
        const res = await api.post('/card-intake/' + encodeURIComponent(saleId) + '/preview', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          signal: controller.signal,
          onUploadProgress: (ev) => {
            if (checkAbort.current !== controller) return;
            const total = ev.total && ev.total > 0 ? ev.total : chosen.size;
            const pct = total > 0 ? Math.min(100, Math.floor((ev.loaded / total) * 100)) : 0;
            setUploadPercent(pct);
            if (pct >= 100) setPhase('parsing');
          },
        });
        if (checkAbort.current !== controller) return;
        checkAbort.current = null;
        const data = readPreview(res.data);
        if (!data) {
          setFailure(failureFromResponse(0, null));
          setPhase('idle');
          return;
        }
        setPhase('idle');
        if (data.rowsTotal <= 0) {
          setEmptyFile(true);
          return;
        }
        const saved = restore ? parseSavedChoices(readSaved(savedChoicesKey(saleId, data.fileSha256))) : null;
        const back = restoreChoices(saved, data);
        const usable = back.priceSource === 'FILE' && !data.columnsPresent.price ? null : back.priceSource;
        setPreview(data);
        setRestored(saved !== null);
        setPriceSource(usable || defaultPriceSource(data));
        setConditionChoices(back.conditions);
        setDecisions(back.decisions);
        setMode(null);
        setReached(0);
      } catch (err) {
        if (checkAbort.current !== controller) return;
        checkAbort.current = null;
        setPhase('idle');
        const f = failureFromError(err);
        if (f.kind === 'aborted') {
          setWasCancelled(true);
          return;
        }
        if (f.code === 'EMPTY_FILE') {
          setEmptyFile(true);
          return;
        }
        setFailure(f);
        if (needsColumnChooser(f.code)) {
          try {
            setChooserHeaders(parseHeaderLine(await chosen.slice(0, 65536).text()));
          } catch {
            setChooserHeaders([]);
          }
        }
      }
    },
    [abortCheck, clearChecked, saleId]
  );

  const onCheck = useCallback(() => {
    if (file && !fileProblem) void runCheck(file, options, true);
  }, [file, fileProblem, options, runCheck]);

  const onApplyMapping = useCallback(
    (mapping: Record<string, string>) => {
      if (!file) return;
      const next: IntakeOptions = { ...options, columnMapping: mapping };
      setOptions(next);
      // A new column choice changes the row numbers and matches, so the earlier choices are not carried over.
      void runCheck(file, next, false);
    },
    [file, options, runCheck]
  );

  const onCancelCheck = useCallback(() => {
    abortCheck();
    setPhase('idle');
    setUploadPercent(0);
    setWasCancelled(true);
  }, [abortCheck]);

  const goStep = useCallback(
    (next: IntakeStepId) => {
      if (busyChecking || importRunning) return;
      if (stepIndex(next) > reached) return;
      setStep(next);
    },
    [busyChecking, importRunning, reached]
  );

  const advance = useCallback((next: IntakeStepId) => {
    setReached((prev) => Math.max(prev, stepIndex(next)));
    setStep(next);
  }, []);

  const earlier = useMemo(() => (preview ? earlierBatchFor(preview, mode) : { kind: 'none' as const }), [preview, mode]);

  const startImport = useCallback(
    (force: boolean) => {
      if (!file || !preview || !mode) return;
      if (confirmBlockers({ preview, mode, conditionChoices, busy: importRunning }).length > 0) return;
      const fields = buildConfirmFields(options, {
        mode,
        fileSha256: preview.fileSha256,
        priceSource,
        conditionMapping: conditionMappingJson(preview.conditionMapping, conditionChoices),
        decisions: decisionsJson(preview.reviewRows, decisions),
        force,
      });
      void importer.start({ file, fields });
      // importer.start is stable; the whole object is not.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [file, preview, mode, conditionChoices, importRunning, options, priceSource, decisions, importer.start]
  );

  const stepNumber = stepIndex(step) + 1;
  const stepLabel = INTAKE_STEPS[stepIndex(step)].label;

  let body: React.ReactNode = null;
  if (step === 'upload') {
    if (emptyFile && !busyChecking) {
      body = <PreviewEmpty onChooseAnother={resetAll} />;
    } else if (preview && !busyChecking) {
      body = (
        <div className="space-y-4">
          {restored ? <p className={noticeInfoCls}>{INTAKE_COPY.restoredNote}</p> : null}
          <PreviewSummary preview={preview} fields={formats ? formats.fields : []} conditions={vocab.conditions} finishes={vocab.finishes} busy={busyChecking} onApplyMapping={onApplyMapping} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button type="button" onClick={resetAll} className={secondaryBtn}>
              {INTAKE_COPY.changeFile}
            </button>
            <button type="button" onClick={() => advance('conditions')} className={primaryBtn}>
              {INTAKE_COPY.nextToConditions}
            </button>
          </div>
        </div>
      );
    } else {
      body = (
        <UploadStep
          formats={formats}
          formatsLoading={formatsQuery.isLoading}
          formatsFailed={formatsQuery.isError}
          onRetryFormats={() => {
            void formatsQuery.refetch();
          }}
          games={vocab.games}
          conditions={vocab.conditions}
          file={file}
          fileProblem={fileProblem}
          onFile={onFile}
          options={options}
          onOptions={setOptions}
          phase={phase}
          uploadPercent={uploadPercent}
          failure={failure}
          onDismissFailure={() => setFailure(null)}
          chooserHeaders={chooserHeaders}
          chooserFields={chooserHeaders && chooserHeaders.length > 0 && formats ? formats.fields : []}
          onApplyMapping={onApplyMapping}
          onCheck={onCheck}
          onCancelCheck={onCancelCheck}
          wasCancelled={wasCancelled}
        />
      );
    }
  } else if (preview && step === 'conditions') {
    body = (
      <ConditionStep
        preview={preview}
        conditions={vocab.conditions}
        choices={conditionChoices}
        defaultCondition={options.defaultCondition}
        onChoices={setConditionChoices}
        onBack={() => setStep('upload')}
        onNext={() => advance('rows')}
      />
    );
  } else if (preview && step === 'rows') {
    body = <ReviewStep preview={preview} decisions={decisions} finishes={vocab.finishes} onDecisions={setDecisions} onBack={() => setStep('conditions')} onNext={() => advance('confirm')} />;
  } else if (preview && step === 'confirm') {
    body =
      importStatus === 'idle' ? (
        <ConfirmStep
          preview={preview}
          mode={mode}
          onMode={setMode}
          priceSource={priceSource}
          onPrice={setPriceSource}
          conditionChoices={conditionChoices}
          decisions={decisions}
          earlier={earlier}
          busy={importRunning}
          onImport={() => startImport(false)}
          onBack={() => setStep('rows')}
          onGoStep={goStep}
        />
      ) : (
        <ImportRunPanel
          state={importer.state}
          saleId={saleId}
          stalled={importer.stalled}
          stopping={importer.stopping}
          onStop={importer.stop}
          onResume={() => startImport(false)}
          onForce={() => startImport(true)}
          onDismiss={importer.reset}
          onStartOver={resetAll}
        />
      );
  }

  return (
    <div className="space-y-4">
      <StepIndicator current={step} reached={reached} onGo={goStep} disabled={busyChecking || importRunning} />
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        {stepNumber + '. ' + stepLabel}
      </h2>
      {body}
    </div>
  );
};

export default CardIntakeFlow;
