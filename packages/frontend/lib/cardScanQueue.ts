/**
 * cardScanQueue (ADR-138 batch B6): the two queues behind the Scan cards screen.
 *
 *  Part 1, the SEND queue: pictures waiting to go to POST /sessions/:id/frames. Two at a time, in the order they were
 *          taken. A retry always reuses the same clientEntryId, so the server returns the same entry and never charges
 *          or counts twice (ADR-138 layer L1). Pictures that are not sent yet can be restored after a reload from a store
 *          the page provides (IndexedDB can hold the picture itself; this file does not touch storage).
 *
 *  Part 2, the REVIEW queue view model: the filters (Needs a decision / Ready / Skipped / Committed), groups, "still
 *          needed" chips, bulk selection and bulk plans, optimistic changes that send ifUpdatedAt, polling rules and the
 *          state of the save button.
 *
 * ADR-138 section 10.4 lists the send queue here and the view model with cardScan.ts; batch B6 puts the view model in this
 * file so cardScan.ts stays the API client and its readers. Both parts are pure: no React, no timers, no network at import
 * time; sleep, storage and send are injected. Tests: lib/__tests__/cardScanQueue.test.ts (send queue, AT-32) and
 * lib/__tests__/cardScanViewModel.test.ts (review queue, AT-33). Run: npm test   (node:test through tsx)
 *
 * Rules kept here (ADR-138 sections 3.6 and 9):
 *  - A suggestion is never applied for the seller. Only the patch builders below, called from a tap, copy a suggested condition.
 *  - The frontend never computes readiness, dedup keys or prices. Optimistic changes only touch the fields the seller edited.
 *  - The save button needs a chosen mode (no default), at least one ready card, no pictures still sending and no change still saving.
 */
import { buildBulkBodies, buildPatchBody, clampQuantity, failureFromError } from './cardScan';
import type {
  BulkExtras,
  CommitResult,
  FrameResult,
  ScanBulkAction,
  ScanClient,
  ScanCounts,
  ScanEntry,
  ScanEntryPatch,
  ScanFailure,
  ScanMode,
  ScanNeed,
  ScanResult,
  ScanSession,
  ScanSessionStatus,
} from './cardScan';
import { CONDITION_FALLBACK, FINISH_FALLBACK } from './cardIntake';
import type { VocabOption } from './cardIntake';
import { SCAN_COPY, SCAN_FILTER_LABELS, SCAN_NEED_LABELS } from './cardScanCopy';

// ===========================================================================
// Part 1: the send queue
// ===========================================================================

export const UPLOAD_CONCURRENCY = 2;
/** Tries per picture before it is marked failed (the first try plus four retries). */
export const UPLOAD_MAX_ATTEMPTS = 5;

export type UploadStatus = 'PENDING' | 'SENDING' | 'DONE' | 'FAILED';

/** B is the picture type: a Blob in the browser, anything in tests. */
export interface UploadItem<B> {
  clientEntryId: string;
  placementId: string | null;
  gameHint: string | null;
  fileName: string;
  frame: B;
  status: UploadStatus;
  attempts: number;
  failure: ScanFailure | null;
  /** Order the pictures were taken in. */
  seq: number;
}

export interface PersistedUpload<B> {
  clientEntryId: string;
  placementId: string | null;
  gameHint: string | null;
  fileName: string;
  frame: B;
  seq: number;
}

/** The page's storage for pictures that are not sent yet. Errors are swallowed: a store that fails never stops sending. */
export interface PendingStore<B> {
  load(): Promise<PersistedUpload<B>[]>;
  save(items: PersistedUpload<B>[]): Promise<void>;
}

export interface UploadQueueDeps<B> {
  /** Sends one picture. Use makeFrameSender() for the real client. */
  send: (item: UploadItem<B>, signal: AbortSignal | undefined) => Promise<ScanResult<FrameResult>>;
  sleep: (ms: number) => Promise<void>;
  store?: PendingStore<B>;
  /** Called once for each picture the server accepted, with the entry it made (or the entry it already had). */
  onResult?: (item: UploadItem<B>, result: FrameResult) => void;
  concurrency?: number;
  maxAttempts?: number;
  backoffMs?: (attempt: number, failure: ScanFailure) => number;
  newId?: () => string;
}

export interface UploadInput<B> {
  frame: B;
  fileName?: string;
  placementId?: string | null;
  gameHint?: string | null;
  /** Leave out for a new picture. Pass the old id to put the same picture back. */
  clientEntryId?: string;
}

export interface UploadItemView {
  clientEntryId: string;
  placementId: string | null;
  fileName: string;
  status: UploadStatus;
  attempts: number;
  failure: ScanFailure | null;
}

export interface UploadSnapshot {
  items: UploadItemView[];
  pending: number;
  sending: number;
  failed: number;
  doneCount: number;
  paused: boolean;
  halted: boolean;
  haltFailure: ScanFailure | null;
  /** Nothing is sending and nothing will start on its own. */
  idle: boolean;
}

export interface UploadQueue<B> {
  enqueue(input: UploadInput<B>): string;
  restore(): Promise<number>;
  pause(): void;
  /** Starts sending again, and clears a stop caused by a quota, a cap or a closed scan. */
  resume(): void;
  retry(clientEntryId: string): void;
  retryAllFailed(): void;
  dismiss(clientEntryId: string): void;
  clear(): void;
  snapshot(): UploadSnapshot;
  subscribe(listener: () => void): () => void;
  whenIdle(): Promise<void>;
}

/** 1 s, 2 s, 4 s, 8 s, 16 s, at most 30 s. A rate limit waits at least 5 s. */
export function defaultBackoffMs(attempt: number, failure: ScanFailure): number {
  const exp = Math.min(30000, 1000 * Math.pow(2, Math.max(0, attempt - 1)));
  return failure.status === 429 ? Math.max(exp, 5000) : exp;
}

function cryptoRandom01(): number {
  try {
    const c = (typeof globalThis !== 'undefined' ? (globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto : undefined);
    if (c && typeof c.getRandomValues === 'function') {
      const a = new Uint32Array(1);
      c.getRandomValues(a);
      return a[0] / 4294967296;
    }
  } catch {
    /* fall through to Math.random */
  }
  return Math.random();
}

/** A version 4 style id for one picture. The random source is injectable for tests. */
export function newClientEntryId(random01: () => number = cryptoRandom01): string {
  const hex = '0123456789abcdef';
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(random01() * 16) % 16;
    const v = c === 'x' ? r : (r % 4) + 8;
    return hex.charAt(v);
  });
}

/** Wires the queue to the real client: the picture, its ids and the game hint go out as one multipart request. */
export function makeFrameSender<B extends Blob>(client: ScanClient, sessionId: string): UploadQueueDeps<B>['send'] {
  return (item, signal) =>
    client.postFrame(
      sessionId,
      { frame: item.frame, fileName: item.fileName, clientEntryId: item.clientEntryId, placementId: item.placementId, gameHint: item.gameHint },
      signal,
    );
}

interface InternalItem<B> extends UploadItem<B> {
  cancelled: boolean;
}

export function createUploadQueue<B>(deps: UploadQueueDeps<B>): UploadQueue<B> {
  const concurrency = Math.max(1, Math.floor(deps.concurrency || UPLOAD_CONCURRENCY));
  const maxAttempts = Math.max(1, Math.floor(deps.maxAttempts || UPLOAD_MAX_ATTEMPTS));
  const backoff = deps.backoffMs || defaultBackoffMs;
  const newId = deps.newId || (() => newClientEntryId());

  let items: InternalItem<B>[] = [];
  let nextSeq = 1;
  let active = 0;
  let paused = false;
  let haltFailure: ScanFailure | null = null;
  let doneCount = 0;
  let listeners: Array<() => void> = [];
  let idleWaiters: Array<() => void> = [];
  let saveChain: Promise<void> = Promise.resolve();
  const controllers: Record<string, AbortController> = {};

  function notify(): void {
    listeners.slice().forEach((fn) => {
      try {
        fn();
      } catch {
        /* a listener that throws must not stop the queue */
      }
    });
  }

  function keepForReload(i: InternalItem<B>): boolean {
    if (i.cancelled) return false;
    if (i.status === 'PENDING' || i.status === 'SENDING') return true;
    return i.status === 'FAILED' && i.failure !== null && i.failure.retriable;
  }

  function persist(): void {
    const store = deps.store;
    if (!store) return;
    const list: PersistedUpload<B>[] = items.filter(keepForReload).map((i) => ({
      clientEntryId: i.clientEntryId,
      placementId: i.placementId,
      gameHint: i.gameHint,
      fileName: i.fileName,
      frame: i.frame,
      seq: i.seq,
    }));
    saveChain = saveChain.then(() => store.save(list)).catch(() => undefined);
  }

  function isIdle(): boolean {
    if (active > 0) return false;
    if (paused || haltFailure !== null) return true;
    return !items.some((i) => i.status === 'PENDING');
  }

  function checkIdle(): void {
    if (!isIdle() || idleWaiters.length === 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    saveChain.then(() => {
      waiters.forEach((w) => w());
    });
  }

  function pump(): void {
    if (!paused && haltFailure === null) {
      while (active < concurrency) {
        const next = items.filter((i) => i.status === 'PENDING' && !i.cancelled)[0];
        if (!next) break;
        next.status = 'SENDING';
        active += 1;
        void run(next);
      }
    }
    checkIdle();
  }

  async function run(item: InternalItem<B>): Promise<void> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) controllers[item.clientEntryId] = controller;
    notify();
    try {
      for (;;) {
        item.attempts += 1;
        let res: ScanResult<FrameResult>;
        try {
          res = await deps.send(item, controller ? controller.signal : undefined);
        } catch (err) {
          res = { ok: false, failure: failureFromError(err) };
        }
        if (item.cancelled) return;
        if (res.ok) {
          item.status = 'DONE';
          item.failure = null;
          doneCount += 1;
          if (deps.onResult) {
            try {
              deps.onResult(item, res.data);
            } catch {
              /* the page's handler must not stop the queue */
            }
          }
          return;
        }
        const f = res.failure;
        if (f.kind === 'aborted') {
          item.status = 'PENDING';
          return;
        }
        if (f.halts) {
          // Every later picture would fail the same way. Keep this one and stop starting new ones.
          item.status = 'PENDING';
          item.failure = f;
          if (haltFailure === null) haltFailure = f;
          return;
        }
        if (!f.retriable || item.attempts >= maxAttempts) {
          item.status = 'FAILED';
          item.failure = f;
          return;
        }
        item.failure = f;
        notify();
        await deps.sleep(backoff(item.attempts, f));
        if (item.cancelled) return;
      }
    } finally {
      delete controllers[item.clientEntryId];
      active -= 1;
      if (item.status === 'DONE' || item.cancelled) items = items.filter((i) => i !== item);
      persist();
      notify();
      pump();
    }
  }

  function makeItem(input: UploadInput<B>, id: string, seq: number): InternalItem<B> {
    return {
      clientEntryId: id,
      placementId: input.placementId || null,
      gameHint: input.gameHint || null,
      fileName: input.fileName || 'card.jpg',
      frame: input.frame,
      status: 'PENDING',
      attempts: 0,
      failure: null,
      seq,
      cancelled: false,
    };
  }

  function find(id: string): InternalItem<B> | null {
    const hit = items.filter((i) => i.clientEntryId === id && !i.cancelled)[0];
    return hit || null;
  }

  return {
    enqueue(input) {
      const id = input.clientEntryId || newId();
      if (find(id)) return id;
      items.push(makeItem(input, id, nextSeq));
      nextSeq += 1;
      persist();
      notify();
      pump();
      return id;
    },

    async restore() {
      if (!deps.store) return 0;
      let saved: PersistedUpload<B>[] = [];
      try {
        saved = await deps.store.load();
      } catch {
        saved = [];
      }
      let added = 0;
      saved
        .filter((p) => !!p && typeof p.clientEntryId === 'string' && p.clientEntryId !== '')
        .sort((a, b) => a.seq - b.seq)
        .forEach((p) => {
          if (find(p.clientEntryId)) return;
          items.push(makeItem({ frame: p.frame, fileName: p.fileName, placementId: p.placementId, gameHint: p.gameHint }, p.clientEntryId, nextSeq));
          nextSeq += 1;
          added += 1;
        });
      persist();
      notify();
      pump();
      return added;
    },

    pause() {
      paused = true;
      notify();
      checkIdle();
    },

    resume() {
      paused = false;
      haltFailure = null;
      items.forEach((i) => {
        if (i.status === 'PENDING') {
          i.attempts = 0;
          i.failure = null;
        }
      });
      notify();
      pump();
    },

    retry(clientEntryId) {
      const i = find(clientEntryId);
      if (!i || i.status !== 'FAILED') return;
      i.status = 'PENDING';
      i.attempts = 0;
      i.failure = null;
      persist();
      notify();
      pump();
    },

    retryAllFailed() {
      items.forEach((i) => {
        if (i.status === 'FAILED' && !i.cancelled) {
          i.status = 'PENDING';
          i.attempts = 0;
          i.failure = null;
        }
      });
      persist();
      notify();
      pump();
    },

    dismiss(clientEntryId) {
      const i = find(clientEntryId);
      if (!i) return;
      i.cancelled = true;
      const c = controllers[i.clientEntryId];
      if (c) c.abort();
      if (i.status !== 'SENDING') items = items.filter((x) => x !== i);
      persist();
      notify();
      pump();
    },

    clear() {
      items.forEach((i) => {
        i.cancelled = true;
        const c = controllers[i.clientEntryId];
        if (c) c.abort();
      });
      items = items.filter((i) => i.status === 'SENDING');
      haltFailure = null;
      persist();
      notify();
      checkIdle();
    },

    snapshot() {
      const visible = items.filter((i) => !i.cancelled);
      const count = (s: UploadStatus): number => visible.filter((i) => i.status === s).length;
      return {
        items: visible.map((i) => ({
          clientEntryId: i.clientEntryId,
          placementId: i.placementId,
          fileName: i.fileName,
          status: i.status,
          attempts: i.attempts,
          failure: i.failure,
        })),
        pending: count('PENDING'),
        sending: count('SENDING'),
        failed: count('FAILED'),
        doneCount,
        paused,
        halted: haltFailure !== null,
        haltFailure,
        idle: isIdle(),
      };
    },

    subscribe(listener) {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },

    whenIdle() {
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
        checkIdle();
      });
    },
  };
}

// ===========================================================================
// Part 2: the review queue view model
// ===========================================================================

export type ScanFilter = 'NEEDS_DECISION' | 'READY' | 'SKIPPED' | 'COMMITTED';

/** The four filters, in the order the tabs are shown. */
export const SCAN_FILTERS: readonly ScanFilter[] = ['NEEDS_DECISION', 'READY', 'SKIPPED', 'COMMITTED'];

/** The queue is polled this often while the page is visible (ADR-138 section 2.1). */
export const POLL_INTERVAL_MS = 3000;
/** Every this often the poll asks for the whole list, so changes made on another device show up. */
export const FULL_REFRESH_MS = 15000;

/**
 * Which tab an entry belongs to. Rows with a problem (ERROR) sit under "Needs a decision". Rows being saved (COMMITTING)
 * stay under "Ready" until they are saved or come back with a problem.
 */
export function filterOf(entry: ScanEntry): ScanFilter {
  switch (entry.status) {
    case 'READY':
    case 'COMMITTING':
      return 'READY';
    case 'SKIPPED':
      return 'SKIPPED';
    case 'COMMITTED':
      return 'COMMITTED';
    default:
      return 'NEEDS_DECISION';
  }
}

export function filterEntries(entries: ScanEntry[], filter: ScanFilter): ScanEntry[] {
  return entries.filter((e) => filterOf(e) === filter);
}

export function filterCounts(entries: ScanEntry[]): Record<ScanFilter, number> {
  const out: Record<ScanFilter, number> = { NEEDS_DECISION: 0, READY: 0, SKIPPED: 0, COMMITTED: 0 };
  entries.forEach((e) => {
    out[filterOf(e)] += 1;
  });
  return out;
}

export function filterLabel(filter: ScanFilter): string {
  return SCAN_FILTER_LABELS[filter];
}

export function emptyMessage(filter: ScanFilter): string {
  switch (filter) {
    case 'NEEDS_DECISION':
      return SCAN_COPY.emptyNeedsDecision;
    case 'READY':
      return SCAN_COPY.emptyReady;
    case 'SKIPPED':
      return SCAN_COPY.emptySkipped;
    default:
      return SCAN_COPY.emptyCommitted;
  }
}

export interface FilterTab {
  filter: ScanFilter;
  label: string;
  count: number;
  active: boolean;
  /** "Ready (12)" */
  text: string;
}

export function filterTabs(entries: ScanEntry[], active: ScanFilter): FilterTab[] {
  const counts = filterCounts(entries);
  return SCAN_FILTERS.map((f) => ({
    filter: f,
    label: filterLabel(f),
    count: counts[f],
    active: f === active,
    text: SCAN_COPY.filterCount(filterLabel(f), counts[f]),
  }));
}

/** The first tab worth showing: "Needs a decision" while there is anything to decide, else "Ready", else "Needs a decision". */
export function defaultFilter(entries: ScanEntry[]): ScanFilter {
  const c = filterCounts(entries);
  if (c.NEEDS_DECISION > 0) return 'NEEDS_DECISION';
  if (c.READY > 0) return 'READY';
  return 'NEEDS_DECISION';
}

/** Local recount, used between polls. The server's counts win when they arrive. */
export function countEntries(entries: ScanEntry[]): ScanCounts {
  const c: ScanCounts = { needsReview: 0, ready: 0, skipped: 0, committed: 0, error: 0 };
  entries.forEach((e) => {
    if (e.status === 'NEEDS_REVIEW') c.needsReview += 1;
    else if (e.status === 'READY' || e.status === 'COMMITTING') c.ready += 1;
    else if (e.status === 'SKIPPED') c.skipped += 1;
    else if (e.status === 'COMMITTED') c.committed += 1;
    else c.error += 1;
  });
  return c;
}

// ---------------------------------------------------------------------------
// Reading one entry
// ---------------------------------------------------------------------------

/** Name to show: what the seller typed or picked, else what was read from the picture. */
export function entryTitle(entry: ScanEntry): string {
  return entry.chosen.cardName || (entry.read && entry.read.name) || SCAN_COPY.unknownCard;
}

/** "Set name, #123" from the chosen details, falling back to what was read. */
export function entrySubtitle(entry: ScanEntry): string {
  const set = entry.chosen.setName || entry.chosen.setCode || (entry.read && (entry.read.setName || entry.read.setCode)) || '';
  const num = entry.chosen.collectorNumber || (entry.read && entry.read.collectorNumber) || '';
  const parts: string[] = [];
  if (set) parts.push(set);
  if (num) parts.push('#' + num);
  return parts.join(', ');
}

/** Why the card is not ready, as chips: Pick the printing, Choose the finish, Choose the condition, Add the card name. */
export function needChips(entry: ScanEntry): Array<{ need: ScanNeed; label: string }> {
  return entry.needs.map((n) => ({ need: n, label: SCAN_NEED_LABELS[n] }));
}

/** True when the picture suggested a finish other than non-foil. Such a card always needs the seller's own choice. */
export function looksFoil(entry: ScanEntry): boolean {
  const f = entry.read ? entry.read.finish : null;
  return f !== null && f !== 'NONFOIL';
}

export type NoticeKind = 'SUSPECT_REPEAT' | 'NAME_MISMATCH' | 'NAME_ONLY' | 'GAME_NOT_SERVED' | 'CATALOG_OFF' | 'LOOKS_FOIL' | 'ERROR';

export interface EntryNotice {
  kind: NoticeKind;
  text: string;
}

/** Short notes to show on a card, most important first (ADR-138 section 12 wording). */
export function entryNotices(entry: ScanEntry): EntryNotice[] {
  const out: EntryNotice[] = [];
  if (entry.status === 'ERROR') out.push({ kind: 'ERROR', text: SCAN_COPY.entryErrorNote });
  if (entry.suspectDuplicateOf) out.push({ kind: 'SUSPECT_REPEAT', text: SCAN_COPY.duplicateHeld });
  const note = entry.resolution.note;
  if (note === 'NAME_MISMATCH') out.push({ kind: 'NAME_MISMATCH', text: SCAN_COPY.nameMismatch });
  else if (note === 'NAME_ONLY') out.push({ kind: 'NAME_ONLY', text: SCAN_COPY.nameOnly });
  else if (note === 'GAME_NOT_SERVED') out.push({ kind: 'GAME_NOT_SERVED', text: SCAN_COPY.gameNotServed });
  else if (note === 'CATALOG_OFF') out.push({ kind: 'CATALOG_OFF', text: SCAN_COPY.catalogOff });
  if (looksFoil(entry) && !entry.chosen.finish) out.push({ kind: 'LOOKS_FOIL', text: SCAN_COPY.readFoilNote });
  return out;
}

export function labelForCode(code: string | null, options: readonly VocabOption[]): string | null {
  if (!code) return null;
  const hit = options.filter((o) => o.code === code)[0];
  return hit ? hit.label : code;
}

/**
 * The "Suggested: Near Mint. Tap to use." chip, or null when there is no suggested condition or the seller already has that
 * condition. Tapping it must send patchUseSuggestedCondition(); nothing here applies it.
 */
export function suggestedChip(entry: ScanEntry, conditionOptions: readonly VocabOption[] = CONDITION_FALLBACK): { text: string; conditionCode: string } | null {
  const code = entry.suggested ? entry.suggested.conditionCode : null;
  if (!code || entry.chosen.conditionCode === code) return null;
  const label = labelForCode(code, conditionOptions) || code;
  return { text: SCAN_COPY.suggestedCondition(label), conditionCode: code };
}

/**
 * Finish codes the chosen printing comes in, when the picker's candidates include it. `known` is false when they do not,
 * and the full finish list is returned (the server still checks the choice).
 */
export function printingFinishes(entry: ScanEntry, fallback: readonly VocabOption[] = FINISH_FALLBACK): { codes: string[]; known: boolean } {
  const id = entry.chosen.printingId || entry.resolution.printingId;
  if (id) {
    const cand = entry.resolution.candidates.filter((c) => c.printingId === id)[0];
    if (cand && cand.finishes.length > 0) return { codes: cand.finishes.slice(), known: true };
  }
  return { codes: fallback.map((o) => o.code), known: false };
}

export function isLocked(entry: ScanEntry): boolean {
  return entry.status === 'COMMITTING' || entry.status === 'COMMITTED';
}

/** The seller can change an entry while the scan is open and the entry is not being saved or saved already. */
export function canEditEntry(entry: ScanEntry, session: ScanSession | null): boolean {
  return !!session && session.status === 'OPEN' && !isLocked(entry);
}

// ---------------------------------------------------------------------------
// Groups (identical cards counted together)
// ---------------------------------------------------------------------------

/**
 * Copies this entry adds to the stock: nothing when skipped, nothing while a suspected repeat is on hold
 * (it counts only after the seller taps "Count as another copy"), else its quantity.
 */
export function countedQuantity(entry: ScanEntry): number {
  if (entry.status === 'SKIPPED') return 0;
  if (entry.suspectDuplicateOf) return 0;
  return entry.chosen.quantity > 0 ? entry.chosen.quantity : 0;
}

export interface EntryGroup {
  key: string;
  entries: ScanEntry[];
  /** Total copies that count (see countedQuantity). */
  copies: number;
  /** Entries on hold as suspected repeats. */
  held: number;
  first: ScanEntry;
}

/** Groups entries by the server's groupKey, in the order of each group's first entry. An entry with no key is its own group. */
export function groupEntries(entries: ScanEntry[]): EntryGroup[] {
  const order: string[] = [];
  const byKey: Record<string, EntryGroup> = {};
  entries.forEach((e) => {
    const key = e.groupKey ? 'g:' + e.groupKey : 'e:' + e.id;
    let g = byKey[key];
    if (!g) {
      g = { key, entries: [], copies: 0, held: 0, first: e };
      byKey[key] = g;
      order.push(key);
    }
    g.entries.push(e);
    g.copies += countedQuantity(e);
    if (e.suspectDuplicateOf) g.held += 1;
  });
  return order.map((k) => byKey[k]);
}

export function totalCopies(entries: ScanEntry[]): number {
  return entries.reduce((sum, e) => sum + countedQuantity(e), 0);
}

// ---------------------------------------------------------------------------
// Selection and bulk actions
// ---------------------------------------------------------------------------

export type Selection = Record<string, true>;

export function emptySelection(): Selection {
  return {};
}

/** Entries that can be picked: not being saved and not saved already. */
export function isSelectable(entry: ScanEntry): boolean {
  return !isLocked(entry);
}

export function isSelected(sel: Selection, id: string): boolean {
  return sel[id] === true;
}

export function selectedCount(sel: Selection): number {
  return Object.keys(sel).length;
}

export function toggleSelected(sel: Selection, id: string): Selection {
  const next: Selection = {};
  Object.keys(sel).forEach((k) => {
    if (k !== id) next[k] = true;
  });
  if (sel[id] !== true) next[id] = true;
  return next;
}

export function setSelected(sel: Selection, ids: string[], on: boolean): Selection {
  const next: Selection = {};
  Object.keys(sel).forEach((k) => {
    next[k] = true;
  });
  ids.forEach((id) => {
    if (on) next[id] = true;
    else delete next[id];
  });
  return next;
}

/** Selects every selectable entry on the current tab. */
export function selectFiltered(entries: ScanEntry[], filter: ScanFilter): Selection {
  const sel: Selection = {};
  filterEntries(entries, filter).forEach((e) => {
    if (isSelectable(e)) sel[e.id] = true;
  });
  return sel;
}

/** Drops ids that are gone or can no longer be changed (after a poll or a save). */
export function pruneSelection(sel: Selection, entries: ScanEntry[]): Selection {
  const live: Record<string, boolean> = {};
  entries.forEach((e) => {
    if (isSelectable(e)) live[e.id] = true;
  });
  const next: Selection = {};
  Object.keys(sel).forEach((k) => {
    if (live[k]) next[k] = true;
  });
  return next;
}

/** The selected entries, in queue order. */
export function selectedEntries(sel: Selection, entries: ScanEntry[]): ScanEntry[] {
  return entries.filter((e) => sel[e.id] === true);
}

function finishAllowed(entry: ScanEntry, finish: string): boolean {
  const f = printingFinishes(entry);
  return !f.known || f.codes.indexOf(finish) >= 0;
}

/** Whether a bulk action can change this entry. The server still has the last word and reports `ignored`. */
export function bulkEligible(entry: ScanEntry, action: ScanBulkAction, extras: BulkExtras): boolean {
  if (isLocked(entry)) return false;
  switch (action) {
    case 'SET_CONDITION':
      return entry.status !== 'SKIPPED';
    case 'SET_FINISH':
      return entry.status !== 'SKIPPED' && !!extras.finish && finishAllowed(entry, extras.finish);
    case 'USE_SUGGESTED_CONDITION':
      return entry.status !== 'SKIPPED' && !!entry.suggested && !!entry.suggested.conditionCode;
    case 'SKIP':
      return entry.status !== 'SKIPPED';
    case 'UNSKIP':
      return entry.status === 'SKIPPED';
    default:
      return true;
  }
}

export interface BulkPlan {
  action: ScanBulkAction;
  /** Entries the action will be sent for. */
  targetIds: string[];
  /** Selected entries that cannot take it (left as they are). */
  ignoredIds: string[];
  /** One body per 200 entries, or null when nothing can be sent. */
  bodies: Array<Record<string, unknown>> | null;
  /** Plain words for why nothing can be sent, or null. */
  blocker: string | null;
}

/** Works out what a bulk action would do to the selected entries. Sends nothing. */
export function planBulk(action: ScanBulkAction, selected: ScanEntry[], extras: BulkExtras = {}): BulkPlan {
  const targetIds: string[] = [];
  const ignoredIds: string[] = [];
  selected.forEach((e) => {
    if (bulkEligible(e, action, extras)) targetIds.push(e.id);
    else ignoredIds.push(e.id);
  });
  let blocker: string | null = null;
  let bodies: Array<Record<string, unknown>> | null = null;
  if (action === 'SET_CONDITION' && !extras.conditionCode) {
    blocker = SCAN_COPY.bulkNeedsCondition;
  } else if (action === 'SET_FINISH' && !extras.finish) {
    blocker = SCAN_COPY.bulkNeedsFinish;
  } else if (targetIds.length === 0) {
    blocker = SCAN_COPY.bulkNothingToDo;
  } else {
    const built = buildBulkBodies(action, targetIds, extras);
    if (built.ok) bodies = built.body;
    else blocker = SCAN_COPY.bulkNothingToDo;
  }
  return { action, targetIds, ignoredIds, bodies, blocker };
}

// ---------------------------------------------------------------------------
// Patches the screen sends (each one is a tap by the seller)
// ---------------------------------------------------------------------------

export function patchPickPrinting(printingId: string): ScanEntryPatch {
  return { printingId, acceptAsTyped: false };
}
export function patchUseAsTyped(): ScanEntryPatch {
  return { acceptAsTyped: true, printingId: null };
}
/** Copies the suggested condition because the seller tapped it. Returns null when the entry has no suggestion. */
export function patchUseSuggestedCondition(entry: ScanEntry): ScanEntryPatch | null {
  const code = entry.suggested ? entry.suggested.conditionCode : null;
  return code ? { conditionCode: code } : null;
}
export function patchSetCondition(conditionCode: string | null): ScanEntryPatch {
  return { conditionCode };
}
export function patchSetFinish(finish: string | null): ScanEntryPatch {
  return { finish };
}
export function patchSetPrice(price: number | null): ScanEntryPatch {
  return { price };
}
export function patchSkip(on: boolean): ScanEntryPatch {
  return { skip: on };
}
/** "Count as another copy" on a suspected repeat. */
export function patchCountAsAnother(): ScanEntryPatch {
  return { countAsAnother: true };
}
/** "Same card, ignore" on a suspected repeat: the held entry is skipped, so it never counts. */
export function patchIgnoreHeld(): ScanEntryPatch {
  return { skip: true };
}
/** The patch for one tap on the quantity stepper, or null when the quantity would not change. */
export function patchStepQuantity(entry: ScanEntry, delta: number): ScanEntryPatch | null {
  const next = clampQuantity(entry.chosen.quantity + delta);
  return next === entry.chosen.quantity ? null : { quantity: next };
}

// ---------------------------------------------------------------------------
// Optimistic changes (ADR-138 section 9: PATCH sends ifUpdatedAt)
// ---------------------------------------------------------------------------

export interface PendingChange {
  /** The entry as the server last sent it. Put back if the change fails. */
  base: ScanEntry;
  /** The patch in flight. */
  patch: ScanEntryPatch;
  /** A later patch for the same entry, merged while the first was in flight. Sent after the first one succeeds. */
  queued: ScanEntryPatch | null;
}

export interface QueueView {
  entries: ScanEntry[];
  pending: Record<string, PendingChange>;
}

export interface ChangeRequest {
  entryId: string;
  patch: ScanEntryPatch;
  /** Send as ifUpdatedAt. A change made somewhere else comes back as 409 ENTRY_CHANGED. */
  ifUpdatedAt: string;
}

export function createQueueView(entries: ScanEntry[] = []): QueueView {
  return { entries: sortBySeq(entries), pending: {} };
}

function sortBySeq(entries: ScanEntry[]): ScanEntry[] {
  return entries.slice().sort((a, b) => a.seq - b.seq);
}

function mergePatch(a: ScanEntryPatch, b: ScanEntryPatch): ScanEntryPatch {
  const out: Record<string, unknown> = {};
  const sa = a as unknown as Record<string, unknown>;
  const sb = b as unknown as Record<string, unknown>;
  Object.keys(sa).forEach((k) => {
    out[k] = sa[k];
  });
  Object.keys(sb).forEach((k) => {
    out[k] = sb[k];
  });
  return out as ScanEntryPatch;
}

/**
 * Shows a patch on an entry right away. Only the fields the seller edited change (plus skip). Readiness, needs and groupKey
 * stay as they were until the server answers, because the server owns them.
 */
export function applyPatchLocally(entry: ScanEntry, patch: ScanEntryPatch): ScanEntry {
  const chosen = { ...entry.chosen };
  const p = patch as unknown as Record<string, unknown>;
  const keys = ['printingId', 'acceptAsTyped', 'game', 'cardName', 'setCode', 'setName', 'collectorNumber', 'language', 'finish', 'conditionCode', 'grader', 'grade', 'certNumber', 'price'];
  const target = chosen as unknown as Record<string, unknown>;
  keys.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(p, k) && p[k] !== undefined) target[k] = p[k];
  });
  if (typeof patch.quantity === 'number') chosen.quantity = clampQuantity(patch.quantity);
  let status = entry.status;
  if (patch.skip === true) status = 'SKIPPED';
  else if (patch.skip === false && entry.status === 'SKIPPED') status = 'NEEDS_REVIEW';
  let suspect = entry.suspectDuplicateOf;
  if (patch.countAsAnother === true) suspect = null;
  return { ...entry, chosen, status, suspectDuplicateOf: suspect };
}

export type BeginResult = { ok: true; view: QueueView; request: ChangeRequest | null } | { ok: false; reason: 'UNKNOWN_ENTRY' | 'LOCKED' };

/**
 * Starts a change. The view shows it at once. `request` is what to send now; it is null when an earlier change for the same
 * entry is still in flight, in which case this one is merged and sent right after the first succeeds (see resolveChange).
 */
export function beginChange(view: QueueView, entryId: string, patch: ScanEntryPatch): BeginResult {
  const entry = view.entries.filter((e) => e.id === entryId)[0];
  if (!entry) return { ok: false, reason: 'UNKNOWN_ENTRY' };
  if (isLocked(entry)) return { ok: false, reason: 'LOCKED' };
  const existing = view.pending[entryId];
  const pending: Record<string, PendingChange> = { ...view.pending };
  let request: ChangeRequest | null;
  if (existing) {
    pending[entryId] = { base: existing.base, patch: existing.patch, queued: existing.queued ? mergePatch(existing.queued, patch) : patch };
    request = null;
  } else {
    pending[entryId] = { base: entry, patch, queued: null };
    request = { entryId, patch, ifUpdatedAt: entry.updatedAt };
  }
  const entries = view.entries.map((e) => (e.id === entryId ? applyPatchLocally(e, patch) : e));
  return { ok: true, view: { entries, pending }, request };
}

/**
 * The server accepted a change and sent the entry back. The server's entry replaces ours. When a later change was queued,
 * it is shown on top of the server's entry and returned as `next` to send (with the new ifUpdatedAt).
 */
export function resolveChange(view: QueueView, entryId: string, serverEntry: ScanEntry): { view: QueueView; next: ChangeRequest | null } {
  const existing = view.pending[entryId];
  const pending: Record<string, PendingChange> = { ...view.pending };
  let next: ChangeRequest | null = null;
  let shown = serverEntry;
  if (existing && existing.queued) {
    shown = applyPatchLocally(serverEntry, existing.queued);
    pending[entryId] = { base: serverEntry, patch: existing.queued, queued: null };
    next = { entryId, patch: existing.queued, ifUpdatedAt: serverEntry.updatedAt };
  } else {
    delete pending[entryId];
  }
  const entries = view.entries.map((e) => (e.id === entryId ? shown : e));
  return { view: { entries, pending }, next };
}

/**
 * A change failed. The entry goes back to what the server last sent, and any queued change is dropped.
 * `reload` is true when someone else changed the entry first (ENTRY_CHANGED) or it is gone, so the page should refresh the list.
 */
export function failChange(view: QueueView, entryId: string, failure: ScanFailure): { view: QueueView; reload: boolean } {
  const existing = view.pending[entryId];
  const pending: Record<string, PendingChange> = { ...view.pending };
  delete pending[entryId];
  const entries = existing ? view.entries.map((e) => (e.id === entryId ? existing.base : e)) : view.entries;
  const reload = failure.code === 'ENTRY_CHANGED' || failure.code === 'ENTRY_NOT_FOUND' || failure.code === 'SESSION_COMMITTING';
  return { view: { entries, pending }, reload };
}

/** Sends one change request (from beginChange or resolveChange) with ifUpdatedAt. */
export function sendChange(client: ScanClient, sessionId: string, req: ChangeRequest, signal?: AbortSignal): Promise<ScanResult<ScanEntry>> {
  const built = buildPatchBody(req.patch, req.ifUpdatedAt);
  return client.patchEntry(sessionId, req.entryId, built.body, signal);
}

export function pendingChangeCount(view: QueueView): number {
  return Object.keys(view.pending).length;
}

/**
 * Adds or updates entries from a poll. An entry with a change in flight keeps what the seller sees; its saved copy is
 * refreshed so a failed change falls back to the newest server version. An older copy never overwrites a newer one.
 */
export function mergeServerEntries(view: QueueView, incoming: ScanEntry[]): QueueView {
  const byId: Record<string, ScanEntry> = {};
  view.entries.forEach((e) => {
    byId[e.id] = e;
  });
  const pending: Record<string, PendingChange> = { ...view.pending };
  incoming.forEach((inc) => {
    const p = pending[inc.id];
    if (p) {
      if (inc.updatedAt >= p.base.updatedAt) pending[inc.id] = { base: inc, patch: p.patch, queued: p.queued };
      return;
    }
    const cur = byId[inc.id];
    if (!cur || inc.updatedAt >= cur.updatedAt) byId[inc.id] = inc;
  });
  return { entries: sortBySeq(Object.keys(byId).map((k) => byId[k])), pending };
}

/** Takes a full list from the server as the truth: entries missing from it are removed, except ones with a change in flight. */
export function replaceServerEntries(view: QueueView, all: ScanEntry[]): QueueView {
  const keep: ScanEntry[] = view.entries.filter((e) => !!view.pending[e.id] && !all.some((a) => a.id === e.id));
  const merged = mergeServerEntries({ entries: keep, pending: view.pending }, all);
  return merged;
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

/** Poll only while the tab is visible and the scan is still moving (open or being saved). */
export function shouldPoll(visibilityState: string, sessionStatus: ScanSessionStatus | null): boolean {
  if (visibilityState !== 'visible') return false;
  return sessionStatus === 'OPEN' || sessionStatus === 'COMMITTING';
}

/**
 * What the next poll should ask for. Most polls ask only for entries after the highest seq we have. Every FULL_REFRESH_MS
 * (and the first time) it asks for the whole list, because edits made on another device do not add new entries.
 * UNVERIFIED: whether the server also returns changed older entries when afterSeq is given (ADR-138 section 9 is silent).
 */
export function nextPollQuery(entries: ScanEntry[], lastFullAtMs: number | null, nowMs: number, fullEveryMs: number = FULL_REFRESH_MS): { afterSeq: number | null; full: boolean } {
  if (lastFullAtMs === null || nowMs - lastFullAtMs >= fullEveryMs || entries.length === 0) return { afterSeq: null, full: true };
  let max = 0;
  entries.forEach((e) => {
    if (e.seq > max) max = e.seq;
  });
  return { afterSeq: max, full: false };
}

// ---------------------------------------------------------------------------
// The save button
// ---------------------------------------------------------------------------

export interface ModeOption {
  mode: ScanMode;
  label: string;
  hint: string;
}

/** The two ways to count. Neither is chosen for the seller. */
export const MODE_OPTIONS: readonly ModeOption[] = [
  { mode: 'ADD', label: SCAN_COPY.addToStock, hint: SCAN_COPY.modeHintAdd },
  { mode: 'REPLACE', label: SCAN_COPY.replaceStock, hint: SCAN_COPY.modeHintReplace },
];

export type CommitBlocker = 'MODE' | 'NOTHING_READY' | 'UPLOADING' | 'SAVING' | 'NOT_OPEN';

export interface CommitInput {
  session: ScanSession | null;
  entries: ScanEntry[];
  /** null until the seller chooses. There is no default. */
  mode: ScanMode | null;
  /** Pictures waiting or sending (upload snapshot pending + sending). */
  uploadsInFlight: number;
  /** Changes still saving (pendingChangeCount). */
  pendingChanges: number;
  conditionOptions?: readonly VocabOption[];
  finishOptions?: readonly VocabOption[];
}

export interface CommitState {
  canCommit: boolean;
  blockers: CommitBlocker[];
  blockerTexts: string[];
  /** Entries that are ready. */
  readyEntries: number;
  /** Copies those entries add to the stock. */
  readyCopies: number;
  /** Entries that still need a decision and will not be saved. */
  notReadyEntries: number;
  buttonLabel: string;
  /** "12 cards will be saved as Near Mint (your default for this session)." */
  disclosures: string[];
  notReadyNote: string | null;
  modeHint: string | null;
}

function blockerText(b: CommitBlocker): string {
  switch (b) {
    case 'MODE':
      return SCAN_COPY.commitBlockerMode;
    case 'NOTHING_READY':
      return SCAN_COPY.commitBlockerNothingReady;
    case 'UPLOADING':
      return SCAN_COPY.commitBlockerUploading;
    case 'SAVING':
      return SCAN_COPY.commitBlockerSaving;
    default:
      return SCAN_COPY.commitBlockerNotOpen;
  }
}

/**
 * Whether the save button is on, and what to tell the seller beside it.
 * The count is chosen by the seller (no default). Cards that are not ready are named, never saved quietly.
 * The session-default notes count ready cards that have no condition (or finish) of their own, or that match the default:
 * UNVERIFIED whether the server writes the default into `chosen`, so both are counted and the note may over-count a card
 * the seller set to the same value by hand.
 */
export function commitState(input: CommitInput): CommitState {
  const ready = input.entries.filter((e) => e.status === 'READY');
  const readyCopies = totalCopies(ready);
  const notReady = input.entries.filter((e) => e.status === 'NEEDS_REVIEW' || e.status === 'ERROR').length;

  const blockers: CommitBlocker[] = [];
  if (!input.session || input.session.status !== 'OPEN') blockers.push('NOT_OPEN');
  if (input.mode !== 'ADD' && input.mode !== 'REPLACE') blockers.push('MODE');
  if (ready.length === 0) blockers.push('NOTHING_READY');
  if (input.uploadsInFlight > 0) blockers.push('UPLOADING');
  if (input.pendingChanges > 0) blockers.push('SAVING');

  const disclosures: string[] = [];
  const session = input.session;
  if (session && ready.length > 0) {
    const condOptions = input.conditionOptions || CONDITION_FALLBACK;
    const finOptions = input.finishOptions || FINISH_FALLBACK;
    const dc = session.defaultConditionCode;
    if (dc) {
      const n = totalCopies(ready.filter((e) => !e.chosen.grader && (!e.chosen.conditionCode || e.chosen.conditionCode === dc)));
      if (n > 0) disclosures.push(SCAN_COPY.commitDisclosureCondition(n, labelForCode(dc, condOptions) || dc));
    }
    const df = session.defaultFinish;
    if (df) {
      const n = totalCopies(ready.filter((e) => !looksFoil(e) && (!e.chosen.finish || e.chosen.finish === df)));
      if (n > 0) disclosures.push(SCAN_COPY.commitDisclosureFinish(n, labelForCode(df, finOptions) || df));
    }
  }

  const canCommit = blockers.length === 0;
  const modeOption = MODE_OPTIONS.filter((m) => m.mode === input.mode)[0];
  return {
    canCommit,
    blockers,
    blockerTexts: blockers.map(blockerText),
    readyEntries: ready.length,
    readyCopies,
    notReadyEntries: notReady,
    buttonLabel: canCommit ? SCAN_COPY.commitButton(readyCopies) : SCAN_COPY.commitButtonIdle,
    disclosures,
    notReadyNote: notReady > 0 ? SCAN_COPY.commitNotReady(notReady) : null,
    modeHint: modeOption ? modeOption.hint : null,
  };
}

export interface CommitDescription {
  headline: string;
  lines: string[];
}

/** Plain words for a finished commit: the counts, cards with no price, cards not saved and cards that failed. */
export function describeCommit(result: CommitResult, alreadyApplied = false): CommitDescription {
  const s = result.summary;
  const lines: string[] = [SCAN_COPY.commitSummary(s.created, s.merged, s.skipped, s.errors)];
  if (alreadyApplied) lines.unshift(SCAN_COPY.commitAlreadyApplied);
  if (s.needsPrice > 0) lines.push(SCAN_COPY.commitNeedsPrice(s.needsPrice));
  return { headline: SCAN_COPY.commitDoneHeading, lines };
}

/** The Delver status line needs the age in whole seconds of the last event. Null when nothing has arrived. */
export function secondsSince(isoTime: string | null, nowMs: number): number | null {
  if (!isoTime) return null;
  const t = Date.parse(isoTime);
  if (!isFinite(t)) return null;
  const s = Math.round((nowMs - t) / 1000);
  return s < 0 ? 0 : s;
}
