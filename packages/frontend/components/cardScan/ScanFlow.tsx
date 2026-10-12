/**
 * ScanFlow (ADR-138 batch B7): the whole Scan cards screen for one sale.
 *
 *  1. Asks GET /api/card-scan/status what is turned on. If Smart scan is off or out of tags, the Camera and Upload pictures tabs
 *     are not offered and a plain note says so; Search and add, the queue and saving all still work.
 *  2. With no scan open, shows SessionStart (scans to pick up, or a new one). The open scan lives in the address (?session=), so
 *     a reload or a second device lands in the same place.
 *  3. With a scan open (ScanWorkspace): header, add cards (Camera / Upload pictures / Search and add), pictures on their way, the
 *     queue (Needs a decision / Ready / Skipped / Committed) and the save bar.
 *
 * Nothing is chosen for the seller. The way to count (add to stock or set stock) starts empty, a suggested condition is only used
 * when tapped, and the server decides what is ready.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import type { FrameResult, ScanClient, ScanFailure, ScanMode, ScanStatus } from '../../lib/cardScan';
import type { VocabOption } from '../../lib/cardIntake';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import { useIntakeVocab } from '../cardIntake/useIntakeData';
import CameraPane from './CameraPane';
import CommitBar from './CommitBar';
import ManualSearch from './ManualSearch';
import ScanNotice from './ScanNotice';
import ScanQueue from './ScanQueue';
import SendQueue from './SendQueue';
import SessionHeader from './SessionHeader';
import SessionStart from './SessionStart';
import TabBar, { panelId, tabId } from './TabBar';
import type { TabItem } from './TabBar';
import UploadPane from './UploadPane';
import { headingCls, mutedCls, secondaryBtn } from './ui';
import { useScanClient } from './scanClient';
import { useScanSession } from './useScanSession';
import type { CommitOutcome } from './useScanSession';
import { useScanUpload } from './useScanUpload';
import Skeleton from '../Skeleton';

type TabId = 'camera' | 'upload' | 'search';

const TAB_KEY = 'findasale.cardScan.tab';
const TAB_ID_BASE = 'cs-add';

/** The tab used last time, kept in this browser only. Falls back to the camera when storage is not available. */
function readTab(): TabId {
  try {
    const v = window.localStorage.getItem(TAB_KEY);
    if (v === 'camera' || v === 'upload' || v === 'search') return v;
  } catch {
    /* storage can be blocked */
  }
  return 'camera';
}

function writeTab(tab: TabId): void {
  try {
    window.localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* storage can be blocked */
  }
}

/** The note about Smart scan, or null when it is on and has tags left. */
function smartNoticeText(status: ScanStatus, tagsLeft: number | null): string | null {
  if (!status.scanEnabled || !status.providerReady) return SCAN_COPY.smartScanDisabled;
  if (tagsLeft === 0) return SCAN_COPY.smartScanQuota;
  return null;
}

// ---------------------------------------------------------------------------
// One open scan
// ---------------------------------------------------------------------------

interface WorkspaceProps {
  saleId: string;
  sessionId: string;
  client: ScanClient;
  status: ScanStatus;
  games: readonly VocabOption[];
  conditions: readonly VocabOption[];
  finishes: readonly VocabOption[];
  onLeave: () => void;
}

const ScanWorkspace: React.FC<WorkspaceProps> = ({ saleId, sessionId, client, status, games, conditions, finishes, onLeave }) => {
  const queryClient = useQueryClient();
  const scan = useScanSession(client, sessionId);
  const { absorbFrame } = scan;
  const [tagsLeft, setTagsLeft] = useState<number | null>(status.smartTagsRemaining);
  const [mode, setMode] = useState<ScanMode | null>(null);
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [chosenTab, setChosenTab] = useState<TabId>(() => readTab());
  const [seenOutcome, setSeenOutcome] = useState<CommitOutcome | null>(null);

  const onFrameResult = useCallback(
    (result: FrameResult) => {
      absorbFrame(result);
      if (result.charged) setTagsLeft((n) => (n === null ? null : Math.max(0, n - 1)));
    },
    [absorbFrame],
  );
  const upload = useScanUpload(client, sessionId, onFrameResult);

  const session = scan.session;
  const sessionOpen = !!session && session.status === 'OPEN';
  const captureOn = status.scanEnabled && status.providerReady && tagsLeft !== 0;
  const uploadsInFlight = upload.snapshot.pending + upload.snapshot.sending;

  const tabs: TabItem[] = captureOn
    ? [
        { id: 'camera', label: SCAN_COPY.tabCamera },
        { id: 'upload', label: SCAN_COPY.tabUpload },
        { id: 'search', label: SCAN_COPY.tabSearch },
      ]
    : [{ id: 'search', label: SCAN_COPY.tabSearch }];
  const tab: TabId = tabs.some((t) => t.id === chosenTab) ? chosenTab : (tabs[0].id as TabId);

  const changeTab = (id: string) => {
    if (id === 'camera' || id === 'upload' || id === 'search') {
      setChosenTab(id);
      writeTab(id);
    }
  };

  const rememberImage = useCallback((printingId: string, imageUrl: string | null) => {
    if (!imageUrl) return;
    setImageCache((prev) => (prev[printingId] === imageUrl ? prev : { ...prev, [printingId]: imageUrl }));
  }, []);

  // After a save, the sale's item list is out of date.
  const savedAt = scan.commitOutcome;
  useEffect(() => {
    if (!savedAt) return;
    void queryClient.invalidateQueries({ queryKey: ['items', saleId] });
    void queryClient.invalidateQueries({ queryKey: ['sale', saleId] });
  }, [savedAt, queryClient, saleId]);

  // Closing the page while pictures are sending, changes are saving or the cards are being saved loses work.
  const unsafeToLeave = uploadsInFlight > 0 || scan.pendingChanges > 0 || scan.committing;
  useEffect(() => {
    if (!unsafeToLeave) return undefined;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsafeToLeave]);

  const gameHint = session ? session.defaultGame : null;
  const smartText = smartNoticeText(status, tagsLeft);

  if (!session) {
    if (scan.loadState === 'error') {
      const failure: ScanFailure | null = scan.loadFailure;
      return (
        <ScanNotice tone="error" text={failure ? failure.message : SCAN_COPY.loadScanFailed} help={failure ? failure.help : null}>
          <button type="button" onClick={() => void scan.reload()} className={secondaryBtn}>
            {SCAN_COPY.sendRetry}
          </button>
          <button type="button" onClick={onLeave} className={secondaryBtn}>
            {SCAN_COPY.leaveScan}
          </button>
        </ScanNotice>
      );
    }
    return (
      <div role="status" aria-label={SCAN_COPY.loadingScan} className="space-y-3">
        <p className={mutedCls}>{SCAN_COPY.loadingScan}</p>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <SessionHeader
        session={session}
        smartTagsRemaining={captureOn ? tagsLeft : null}
        catalogReady={scan.catalogReady}
        delverAt={scan.delverAt}
        onLeave={onLeave}
        onDiscard={scan.discard}
        onDiscarded={onLeave}
      />

      {smartText ? <ScanNotice tone="info" text={smartText} /> : null}
      {scan.notice ? <ScanNotice tone={scan.notice.tone} text={scan.notice.text} help={scan.notice.help} onDismiss={scan.dismissNotice} /> : null}

      {sessionOpen ? (
        <section aria-labelledby="cs-add-heading" className="min-w-0 space-y-3">
          <h2 id="cs-add-heading" className={headingCls}>
            {SCAN_COPY.captureHeading}
          </h2>
          <TabBar tabs={tabs} active={tab} onChange={changeTab} ariaLabel={SCAN_COPY.captureHeading} idBase={TAB_ID_BASE} />
          <div id={panelId(TAB_ID_BASE)} role="tabpanel" aria-labelledby={tabId(TAB_ID_BASE, tab)} className="min-w-0">
            {tab === 'camera' ? (
              <CameraPane
                enabled={sessionOpen}
                maxFrameBytes={status.limits.maxFrameBytes}
                onCapture={(blob, placementId) => upload.enqueue({ frame: blob, fileName: 'card.jpg', placementId, gameHint })}
              />
            ) : null}
            {tab === 'upload' ? (
              <UploadPane
                enabled={sessionOpen}
                maxFrameBytes={status.limits.maxFrameBytes}
                onFrame={(blob, fileName) => upload.enqueue({ frame: blob, fileName, placementId: null, gameHint })}
              />
            ) : null}
            {tab === 'search' ? (
              <ManualSearch enabled={sessionOpen} games={games} defaultGame={gameHint} readyGames={status.readyGames} onAdd={scan.addEntry} />
            ) : null}
          </div>
        </section>
      ) : null}

      {captureOn || upload.snapshot.items.length > 0 || upload.snapshot.halted ? (
        <SendQueue snapshot={upload.snapshot} onRetry={upload.retry} onRetryAll={upload.retryAllFailed} onDismiss={upload.dismiss} onResume={upload.resume} />
      ) : null}

      <ScanQueue
        entries={scan.entries}
        session={session}
        loading={scan.loadState !== 'ready'}
        refreshFailed={scan.refreshFailed}
        busy={scan.busy}
        savingIds={scan.savingIds}
        thumbs={upload.thumbs}
        imageCache={imageCache}
        conditions={conditions}
        finishes={finishes}
        onChange={scan.change}
        onRememberImage={rememberImage}
        onBulk={scan.bulk}
      />

      <CommitBar
        saleId={saleId}
        session={session}
        entries={scan.entries}
        mode={mode}
        uploadsInFlight={uploadsInFlight}
        pendingChanges={scan.pendingChanges}
        conditions={conditions}
        finishes={finishes}
        committing={scan.committing}
        outcome={scan.commitOutcome && scan.commitOutcome !== seenOutcome ? scan.commitOutcome : null}
        failure={scan.commitFailure}
        onMode={setMode}
        onCommit={() => {
          if (mode) void scan.commit(mode);
        }}
        onNewScan={onLeave}
        onKeepGoing={() => setSeenOutcome(scan.commitOutcome)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export interface ScanFlowProps {
  saleId: string;
}

type StatusState = 'loading' | 'ready' | 'error';

const ScanFlow: React.FC<ScanFlowProps> = ({ saleId }) => {
  const router = useRouter();
  const client = useScanClient();
  const vocab = useIntakeVocab();
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [statusState, setStatusState] = useState<StatusState>('loading');
  const [statusFailure, setStatusFailure] = useState<ScanFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setStatusState('loading');
    void client.getStatus(ctl.signal).then((r) => {
      if (ctl.signal.aborted) return;
      if (r.ok) {
        setStatus(r.data);
        setStatusFailure(null);
        setStatusState('ready');
      } else {
        setStatusFailure(r.failure);
        setStatusState('error');
      }
    });
    return () => ctl.abort();
  }, [client, attempt]);

  const rawSession = router.query.session;
  const sessionId = typeof rawSession === 'string' && rawSession !== '' ? rawSession : null;

  const openSession = useCallback(
    (id: string | null) => {
      const query = { ...router.query };
      if (id) query.session = id;
      else delete query.session;
      void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router],
  );

  if (statusState === 'loading') {
    return (
      <div role="status" aria-label={SCAN_COPY.statusLoading} className="space-y-3">
        <p className={mutedCls}>{SCAN_COPY.statusLoading}</p>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (statusState === 'error' || !status) {
    return (
      <ScanNotice tone="error" text={statusFailure ? statusFailure.message : SCAN_COPY.statusFailed} help={statusFailure ? statusFailure.help : null}>
        <button type="button" onClick={() => setAttempt(attempt + 1)} className={secondaryBtn}>
          {SCAN_COPY.sendRetry}
        </button>
      </ScanNotice>
    );
  }

  if (!sessionId) {
    const text = smartNoticeText(status, status.smartTagsRemaining);
    return (
      <div className="min-w-0 space-y-4">
        {text ? <ScanNotice tone="info" text={text} /> : null}
        <SessionStart saleId={saleId} client={client} conditions={vocab.conditions} finishes={vocab.finishes} onOpen={openSession} />
      </div>
    );
  }

  return (
    <ScanWorkspace
      key={sessionId}
      saleId={saleId}
      sessionId={sessionId}
      client={client}
      status={status}
      games={vocab.games}
      conditions={vocab.conditions}
      finishes={vocab.finishes}
      onLeave={() => openSession(null)}
    />
  );
};

export default ScanFlow;
