/**
 * useScanSession (ADR-138 batch B7): the live state of one scan, behind the review queue.
 *
 *  - Loads every entry (pages of 200), then polls every 3 seconds while the tab is visible. Most polls ask only for entries
 *    after the highest seq; every 15 seconds it asks for the whole list so changes made on another device show up.
 *  - A change the seller makes shows at once and is sent with ifUpdatedAt. If it fails, the card goes back to what the server
 *    last sent and a plain note says so. If someone else changed the card first, the list is reloaded.
 *  - The view model (filters, groups, bulk plans, optimistic changes) is lib/cardScanQueue.ts. Nothing here decides what is
 *    ready: the server owns readiness, identity and grouping.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PAGE_LIMIT_MAX, alreadyAppliedSummary, fetchAllEntries, localFailure } from '../../lib/cardScan';
import type {
  BulkExtras,
  CommitResult,
  FrameResult,
  ScanBulkAction,
  ScanClient,
  ScanEntry,
  ScanEntryPatch,
  ScanFailure,
  ScanMode,
  ScanQueueState,
  ScanResult,
  ScanSession,
} from '../../lib/cardScan';
import {
  POLL_INTERVAL_MS,
  beginChange,
  createQueueView,
  failChange,
  mergeServerEntries,
  nextPollQuery,
  pendingChangeCount,
  planBulk,
  replaceServerEntries,
  resolveChange,
  sendChange,
  shouldPoll,
} from '../../lib/cardScanQueue';
import type { ChangeRequest, QueueView } from '../../lib/cardScanQueue';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import type { NoticeTone } from './ScanNotice';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface SessionNotice {
  tone: NoticeTone;
  text: string;
  help: string | null;
}

export interface CommitOutcome {
  result: CommitResult;
  alreadyApplied: boolean;
}

function sameSession(a: ScanSession | null, b: ScanSession): boolean {
  return (
    !!a &&
    a.id === b.id &&
    a.status === b.status &&
    a.label === b.label &&
    a.defaultConditionCode === b.defaultConditionCode &&
    a.defaultFinish === b.defaultFinish &&
    a.defaultGame === b.defaultGame &&
    a.commitMode === b.commitMode &&
    a.nextSeq === b.nextSeq &&
    a.source === b.source
  );
}

export interface UseScanSession {
  loadState: LoadState;
  loadFailure: ScanFailure | null;
  session: ScanSession | null;
  entries: ScanEntry[];
  /** Entry ids with a change still being saved. */
  savingIds: Record<string, true>;
  pendingChanges: number;
  catalogReady: boolean;
  delverAt: string | null;
  refreshFailed: boolean;
  notice: SessionNotice | null;
  busy: boolean;
  committing: boolean;
  commitOutcome: CommitOutcome | null;
  commitFailure: ScanFailure | null;
  reload: () => Promise<void>;
  dismissNotice: () => void;
  change: (entryId: string, patch: ScanEntryPatch) => void;
  bulk: (action: ScanBulkAction, selected: ScanEntry[], extras: BulkExtras) => Promise<boolean>;
  addEntry: (body: Record<string, unknown>) => Promise<ScanResult<ScanEntry>>;
  absorbFrame: (result: FrameResult) => void;
  commit: (mode: ScanMode) => Promise<void>;
  discard: () => Promise<ScanResult<{ status: string }>>;
}

export function useScanSession(client: ScanClient, sessionId: string | null): UseScanSession {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadFailure, setLoadFailure] = useState<ScanFailure | null>(null);
  const [session, setSession] = useState<ScanSession | null>(null);
  const [view, setViewState] = useState<QueueView>(() => createQueueView());
  const [catalogReady, setCatalogReady] = useState(true);
  const [delverAt, setDelverAt] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [notice, setNotice] = useState<SessionNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitOutcome, setCommitOutcome] = useState<CommitOutcome | null>(null);
  const [commitFailure, setCommitFailure] = useState<ScanFailure | null>(null);

  const viewRef = useRef<QueueView>(view);
  const sessionRef = useRef<ScanSession | null>(null);
  const lastFullRef = useRef<number | null>(null);
  const pollingRef = useRef(false);
  const committingRef = useRef(false);
  /** Bumped when the scan changes or the page closes, so an answer that arrives late is dropped. */
  const epochRef = useRef(0);

  const setView = useCallback((next: QueueView) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  const applyServer = useCallback(
    (data: ScanQueueState, mode: 'replace' | 'merge') => {
      sessionRef.current = data.session;
      setSession((prev) => (sameSession(prev, data.session) ? prev : data.session));
      setCatalogReady(data.catalogReady);
      setDelverAt(data.delver.lastActivityAt);
      if (mode === 'replace') setView(replaceServerEntries(viewRef.current, data.entries));
      else if (data.entries.length > 0) setView(mergeServerEntries(viewRef.current, data.entries));
    },
    [setView],
  );

  const loadAll = useCallback(
    async (initial: boolean): Promise<void> => {
      if (!sessionId) return;
      const epoch = epochRef.current;
      const res = await fetchAllEntries(client, sessionId);
      if (epoch !== epochRef.current) return;
      if (!res.ok) {
        if (initial) {
          setLoadFailure(res.failure);
          setLoadState('error');
        } else {
          setRefreshFailed(true);
        }
        return;
      }
      lastFullRef.current = Date.now();
      setRefreshFailed(false);
      applyServer(res.data, 'replace');
      if (initial) setLoadState('ready');
    },
    [client, sessionId, applyServer],
  );

  // Close of the page: late answers are dropped.
  useEffect(() => {
    return () => {
      epochRef.current += 1;
    };
  }, []);

  // A different scan (or none): start clean and load it.
  useEffect(() => {
    epochRef.current += 1;
    sessionRef.current = null;
    lastFullRef.current = null;
    setView(createQueueView());
    setSession(null);
    setNotice(null);
    setCommitOutcome(null);
    setCommitFailure(null);
    setDelverAt(null);
    setRefreshFailed(false);
    setLoadFailure(null);
    if (!sessionId) {
      setLoadState('idle');
      return undefined;
    }
    setLoadState('loading');
    void loadAll(true);
    return undefined;
  }, [sessionId, loadAll, setView]);

  // Polling: only while the tab is visible and the scan is open or being saved.
  useEffect(() => {
    if (!sessionId) return undefined;
    let stopped = false;
    const tick = async (): Promise<void> => {
      if (stopped || pollingRef.current) return;
      const current = sessionRef.current;
      if (!current || !shouldPoll(document.visibilityState, current.status)) return;
      pollingRef.current = true;
      const epoch = epochRef.current;
      try {
        const q = nextPollQuery(viewRef.current.entries, lastFullRef.current, Date.now());
        if (q.full) {
          await loadAll(false);
        } else {
          const res = await client.getSession(sessionId, { afterSeq: q.afterSeq, limit: PAGE_LIMIT_MAX });
          if (stopped || epoch !== epochRef.current) return;
          if (res.ok) {
            setRefreshFailed(false);
            applyServer(res.data, 'merge');
          } else {
            setRefreshFailed(true);
          }
        }
      } finally {
        pollingRef.current = false;
      }
    };
    const timer = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [client, sessionId, loadAll, applyServer]);

  const reload = useCallback(async () => {
    await loadAll(false);
  }, [loadAll]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const runChange = useCallback(
    async (first: ChangeRequest): Promise<void> => {
      if (!sessionId) return;
      let current: ChangeRequest | null = first;
      while (current) {
        const res: ScanResult<ScanEntry> = await sendChange(client, sessionId, current);
        if (res.ok) {
          const resolved = resolveChange(viewRef.current, current.entryId, res.data);
          setView(resolved.view);
          current = resolved.next;
        } else {
          const failed = failChange(viewRef.current, current.entryId, res.failure);
          setView(failed.view);
          if (res.failure.code === 'ENTRY_CHANGED') {
            setNotice({ tone: 'warn', text: SCAN_COPY.entryConflict, help: null });
          } else {
            setNotice({ tone: 'error', text: SCAN_COPY.entrySaveFailed, help: res.failure.message });
          }
          if (failed.reload) void loadAll(false);
          current = null;
        }
      }
    },
    [client, sessionId, setView, loadAll],
  );

  const change = useCallback(
    (entryId: string, patch: ScanEntryPatch) => {
      const begun = beginChange(viewRef.current, entryId, patch);
      if (!begun.ok) return;
      setView(begun.view);
      if (begun.request) void runChange(begun.request);
    },
    [runChange, setView],
  );

  const bulk = useCallback(
    async (action: ScanBulkAction, selected: ScanEntry[], extras: BulkExtras): Promise<boolean> => {
      if (!sessionId) return false;
      const plan = planBulk(action, selected, extras);
      if (!plan.bodies) {
        setNotice({ tone: 'warn', text: plan.blocker || SCAN_COPY.bulkNothingToDo, help: null });
        return false;
      }
      setBusy(true);
      let updated = 0;
      let ignored = plan.ignoredIds.length;
      let failure: ScanFailure | null = null;
      for (let i = 0; i < plan.bodies.length; i += 1) {
        const res = await client.bulk(sessionId, plan.bodies[i]);
        if (!res.ok) {
          failure = res.failure;
          break;
        }
        updated += res.data.updated;
        ignored += res.data.ignored;
      }
      await loadAll(false);
      setBusy(false);
      if (failure) {
        setNotice({ tone: 'error', text: failure.message, help: failure.help });
        return false;
      }
      setNotice({ tone: 'ok', text: SCAN_COPY.bulkResult(updated, ignored), help: null });
      return true;
    },
    [client, sessionId, loadAll],
  );

  const addEntry = useCallback(
    async (body: Record<string, unknown>): Promise<ScanResult<ScanEntry>> => {
      if (!sessionId) return { ok: false, failure: localFailure('SESSION_NOT_FOUND') };
      const res = await client.addEntry(sessionId, body);
      if (res.ok) setView(mergeServerEntries(viewRef.current, [res.data]));
      return res;
    },
    [client, sessionId, setView],
  );

  const absorbFrame = useCallback(
    (result: FrameResult) => {
      setView(mergeServerEntries(viewRef.current, [result.entry]));
    },
    [setView],
  );

  const commit = useCallback(
    async (mode: ScanMode): Promise<void> => {
      if (!sessionId || committingRef.current) return;
      committingRef.current = true;
      setCommitting(true);
      setCommitFailure(null);
      setCommitOutcome(null);
      const res = await client.commit(sessionId, mode);
      if (res.ok) {
        setCommitOutcome({ result: res.data, alreadyApplied: false });
      } else {
        const earlier = res.failure.code === 'ALREADY_APPLIED' ? alreadyAppliedSummary(res.failure) : null;
        if (earlier) {
          setCommitOutcome({ result: { batchId: null, status: 'ALREADY_APPLIED', summary: earlier, notCommitted: [], failed: [] }, alreadyApplied: true });
        } else {
          setCommitFailure(res.failure);
        }
      }
      await loadAll(false);
      committingRef.current = false;
      setCommitting(false);
    },
    [client, sessionId, loadAll],
  );

  const discard = useCallback(async (): Promise<ScanResult<{ status: string }>> => {
    if (!sessionId) return { ok: false, failure: localFailure('SESSION_NOT_FOUND') };
    return client.discard(sessionId);
  }, [client, sessionId]);

  const savingIds: Record<string, true> = {};
  Object.keys(view.pending).forEach((k) => {
    savingIds[k] = true;
  });

  return {
    loadState,
    loadFailure,
    session,
    entries: view.entries,
    savingIds,
    pendingChanges: pendingChangeCount(view),
    catalogReady,
    delverAt,
    refreshFailed,
    notice,
    busy,
    committing,
    commitOutcome,
    commitFailure,
    reload,
    dismissNotice,
    change,
    bulk,
    addEntry,
    absorbFrame,
    commit,
    discard,
  };
}
