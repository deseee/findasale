/**
 * Review page draft autosave (Wave 3 round 2, F3).
 *
 * Inline card edits on the Review page (title, description, category, condition, grade, tags and the other fields
 * the card shows) are saved as a draft a moment after the organizer stops typing, so nothing is lost. This module is
 * the pure part: the per-item debounce and serialization state machine, the payload builder, and the status text.
 * No React, no network, no real timers (the clock is injected), so it is unit tested with fake timers.
 *
 * Rules the page relies on:
 *  - Debounce: a save starts DEBOUNCE_MS (800 ms) after the LAST change to that item.
 *  - Serialization: at most one save per item is in flight. Changes made while a save is in flight are saved after
 *    it finishes (a fresh debounce), never in parallel with it.
 *  - Approve cannot race it: `flush(id)` stops the timers, waits for any in-flight save, saves whatever is still
 *    pending, and resolves. `hold(id)` then freezes the item (further edits are ignored, nothing is scheduled) until
 *    `release(id)`, so an autosave can never fire after a publish started.
 *  - Failure: the failed keys go back to pending, status becomes 'retrying' and ONE retry runs after RETRY_MS (5 s).
 *    If that fails too the status becomes 'failed' and nothing more happens until the organizer edits again.
 *  - Unmount: `cancelAll()` drops every timer and pending edit.
 *
 * What an autosave may send (buildAutosavePayload): only fields the card edits. It NEVER sends price (price is
 * tap-to-apply and is saved only by Approve or the apply flow), draftStatus (an autosave never publishes or
 * unpublishes), status, or skipMarketplaceSync.
 */

export const DEBOUNCE_MS = 800;
export const RETRY_MS = 5000;
export const SAVED_LABEL_MS = 10000;

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'savedEarlier' | 'retrying' | 'failed';

/** Muted status line under the card actions. Empty string means show nothing. */
export function autosaveStatusText(status: AutosaveStatus): string {
  switch (status) {
    case 'saving':
      return 'Saving...';
    case 'saved':
      return 'Saved just now';
    case 'savedEarlier':
      return 'Saved';
    case 'retrying':
      return 'Could not save, will retry';
    case 'failed':
      return 'Could not save. Edit again to retry.';
    default:
      return '';
  }
}

export interface TimerApi {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: TimerApi = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface AutosaveOptions {
  /** Send the pending keys for one item. Reject (throw) on failure. */
  save: (itemId: string, keys: string[]) => Promise<void>;
  onStatus?: (itemId: string, status: AutosaveStatus) => void;
  timers?: TimerApi;
  debounceMs?: number;
  retryMs?: number;
  savedLabelMs?: number;
}

interface Slot {
  dirty: Set<string>;
  inflightKeys: Set<string>;
  inFlight: Promise<void> | null;
  debounce: unknown | null;
  retry: unknown | null;
  savedTimer: unknown | null;
  retryUsed: boolean;
  held: boolean;
  flushing: number;
  lastFailed: boolean;
  epoch: number;
  status: AutosaveStatus;
}

export interface AutosaveController {
  /** Mark one field dirty and (re)start the debounce. Returns false when the item is held. */
  touch(itemId: string, key: string): boolean;
  /** Stop timers, wait for an in-flight save, save what is pending. Resolves true when nothing is left unsaved. */
  flush(itemId: string): Promise<boolean>;
  /** Freeze the item: timers cleared, pending dropped, further touches ignored until release. */
  hold(itemId: string): void;
  release(itemId: string): void;
  /** Drop timers and pending edits for one item. */
  cancel(itemId: string): void;
  /** Drop everything (unmount). Emits no status. */
  cancelAll(): void;
  status(itemId: string): AutosaveStatus;
  /** True while edits are waiting, saving, or failed to save. */
  hasUnsaved(itemId: string): boolean;
  /** Fields with edits that are not yet confirmed saved (pending plus in flight). */
  dirtyKeys(itemId: string): string[];
}

export function createAutosaveController(opts: AutosaveOptions): AutosaveController {
  const timers = opts.timers ?? realTimers;
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  const retryMs = opts.retryMs ?? RETRY_MS;
  const savedLabelMs = opts.savedLabelMs ?? SAVED_LABEL_MS;
  const slots = new Map<string, Slot>();
  let silent = false;

  const slotFor = (id: string): Slot => {
    let s = slots.get(id);
    if (!s) {
      s = {
        dirty: new Set(),
        inflightKeys: new Set(),
        inFlight: null,
        debounce: null,
        retry: null,
        savedTimer: null,
        retryUsed: false,
        held: false,
        flushing: 0,
        lastFailed: false,
        epoch: 0,
        status: 'idle',
      };
      slots.set(id, s);
    }
    return s;
  };

  const setStatus = (id: string, s: Slot, status: AutosaveStatus) => {
    if (s.status === status) return;
    s.status = status;
    if (!silent) opts.onStatus?.(id, status);
  };

  const clearTimer = (s: Slot, which: 'debounce' | 'retry' | 'savedTimer') => {
    if (s[which] !== null) {
      timers.clearTimeout(s[which]);
      s[which] = null;
    }
  };

  const clearAllTimers = (s: Slot) => {
    clearTimer(s, 'debounce');
    clearTimer(s, 'retry');
    clearTimer(s, 'savedTimer');
  };

  const scheduleDebounce = (id: string, s: Slot) => {
    clearTimer(s, 'debounce');
    s.debounce = timers.setTimeout(() => {
      s.debounce = null;
      void run(id);
    }, debounceMs);
  };

  /** Start one save for the pending keys unless one is already in flight. */
  const run = (id: string): Promise<void> => {
    const s = slotFor(id);
    if (s.held) return Promise.resolve();
    if (s.inFlight) return s.inFlight; // serialized: the completion handler schedules what is left
    if (s.dirty.size === 0) return Promise.resolve();

    const keys = Array.from(s.dirty);
    s.dirty.clear();
    s.inflightKeys = new Set(keys);
    const epoch = s.epoch;
    setStatus(id, s, 'saving');

    const p = (async () => {
      let failed = false;
      try {
        await opts.save(id, keys);
      } catch {
        failed = true;
      }
      if (s.epoch !== epoch) {
        // Cancelled or held while this save was in flight: its outcome no longer matters to the card.
        s.inflightKeys = new Set();
        s.inFlight = null;
        return;
      }
      s.inflightKeys = new Set();
      s.inFlight = null;
      s.lastFailed = failed;
      if (failed) {
        keys.forEach((k) => s.dirty.add(k));
        if (s.debounce !== null) {
          // Newer edits are already waiting on their own debounce; that save will carry these keys too.
          setStatus(id, s, 'saving');
        } else if (!s.retryUsed) {
          s.retryUsed = true;
          setStatus(id, s, 'retrying');
          clearTimer(s, 'retry');
          s.retry = timers.setTimeout(() => {
            s.retry = null;
            void run(id);
          }, retryMs);
        } else {
          setStatus(id, s, 'failed');
        }
        return;
      }
      s.retryUsed = false;
      if (s.dirty.size > 0) {
        setStatus(id, s, 'saving');
        if (s.debounce === null && s.flushing === 0) scheduleDebounce(id, s);
        return;
      }
      setStatus(id, s, 'saved');
      clearTimer(s, 'savedTimer');
      s.savedTimer = timers.setTimeout(() => {
        s.savedTimer = null;
        if (s.status === 'saved') setStatus(id, s, 'savedEarlier');
      }, savedLabelMs);
    })();
    s.inFlight = p;
    return p;
  };

  return {
    touch(id, key) {
      const s = slotFor(id);
      if (s.held) return false;
      s.dirty.add(key);
      s.retryUsed = false; // a new edit earns a fresh retry
      clearTimer(s, 'retry');
      clearTimer(s, 'savedTimer');
      setStatus(id, s, 'saving');
      scheduleDebounce(id, s);
      return true;
    },

    async flush(id) {
      const s = slotFor(id);
      clearTimer(s, 'debounce');
      clearTimer(s, 'retry');
      s.flushing += 1;
      try {
        // Bounded, and a failed save ends the flush (it never loops on a failing save).
        for (let i = 0; i < 4; i++) {
          if (s.inFlight) {
            await s.inFlight;
            continue;
          }
          if (s.dirty.size === 0) break;
          s.retryUsed = true; // an explicit flush is its own attempt; no extra timer-driven retry on top
          await run(id);
          if (s.lastFailed) break; // never hammer a failing save from a flush
        }
      } finally {
        s.flushing -= 1;
      }
      clearTimer(s, 'debounce');
      return !s.inFlight && s.dirty.size === 0 && s.status !== 'failed' && s.status !== 'retrying';
    },

    hold(id) {
      const s = slotFor(id);
      s.held = true;
      s.epoch += 1;
      clearAllTimers(s);
      s.dirty.clear();
      setStatus(id, s, 'idle');
    },

    release(id) {
      slotFor(id).held = false;
    },

    cancel(id) {
      const s = slots.get(id);
      if (!s) return;
      s.epoch += 1;
      clearAllTimers(s);
      s.dirty.clear();
      s.inflightKeys = new Set();
      s.inFlight = null;
      s.retryUsed = false;
      setStatus(id, s, 'idle');
    },

    cancelAll() {
      silent = true;
      Array.from(slots.keys()).forEach((id) => {
        const s = slots.get(id)!;
        s.epoch += 1;
        clearAllTimers(s);
        s.dirty.clear();
        s.inflightKeys = new Set();
        s.inFlight = null;
        s.status = 'idle';
      });
      silent = false;
    },

    status(id) {
      return slots.get(id)?.status ?? 'idle';
    },

    hasUnsaved(id) {
      const s = slots.get(id);
      if (!s) return false;
      return (
        s.dirty.size > 0 ||
        s.inflightKeys.size > 0 ||
        s.debounce !== null ||
        s.status === 'failed' ||
        s.status === 'retrying'
      );
    },

    dirtyKeys(id) {
      const s = slots.get(id);
      if (!s) return [];
      return Array.from(new Set([...Array.from(s.dirty), ...Array.from(s.inflightKeys)]));
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Payload

/** Fields on the card that autosave. Price is deliberately absent. */
export const AUTOSAVE_FIELDS: readonly string[] = [
  'title',
  'description',
  'category',
  'ebayCategoryId',
  'ebayCategoryName',
  'condition',
  'conditionGrade',
  'tags',
  'listingType',
  'reverseDailyDrop',
  'reverseFloorPrice',
  'brand',
  'mpn',
  'fccId',
  'upc',
  'ebayShippingOverride',
  'packageWeightOz',
  'packageLengthIn',
  'packageWidthIn',
  'packageHeightIn',
];

export function isAutosaveField(field: string): boolean {
  return AUTOSAVE_FIELDS.includes(field);
}

/** Keys an autosave payload must never contain. Covered by tests. */
export const AUTOSAVE_FORBIDDEN_KEYS: readonly string[] = ['price', 'draftStatus', 'status', 'skipMarketplaceSync'];

/** The slice of the card's edit state that autosave reads. */
export interface AutosaveEditState {
  title?: string;
  description?: string;
  category?: string;
  ebayCategoryId?: string;
  ebayCategoryName?: string;
  condition?: string;
  conditionGrade?: string;
  tags?: string[];
  listingType?: string;
  reverseDailyDrop?: number;
  reverseFloorPrice?: number;
  brand?: string;
  mpn?: string;
  fccId?: string;
  upc?: string;
  ebayShippingOverride?: string | null;
  packageWeightOz?: number;
  packageLengthIn?: number;
  packageWidthIn?: number;
  packageHeightIn?: number;
}

const trimOrNull = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

/**
 * PUT /items/:id body for an autosave of the given dirty keys, built from the card's CURRENT edit state.
 *  - A blank title or blank condition is never sent (it would clear the field on the server).
 *  - brand, mpn, fccId, upc: trimmed, blank becomes null (same as the old save handler).
 *  - Package weight and dimensions go together and only when the organizer edited the weight field
 *    (weightTouched), exactly like Approve; then the weight counts as organizer-confirmed.
 *  - price, draftStatus, status and skipMarketplaceSync are never included, whatever keys are passed.
 */
export function buildAutosavePayload(
  state: AutosaveEditState,
  keys: readonly string[],
  weightTouched: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let packageDirty = false;
  for (const key of keys) {
    switch (key) {
      case 'title':
        if (state.title && state.title.trim()) out.title = state.title;
        break;
      case 'description':
        out.description = state.description ?? '';
        break;
      case 'category':
        out.category = state.category ?? '';
        break;
      case 'ebayCategoryId':
        out.ebayCategoryId = state.ebayCategoryId ?? '';
        break;
      case 'ebayCategoryName':
        out.ebayCategoryName = state.ebayCategoryName ?? '';
        break;
      case 'condition':
        if (state.condition && state.condition.trim()) out.condition = state.condition;
        break;
      case 'conditionGrade':
        if (state.conditionGrade && state.conditionGrade.trim()) out.conditionGrade = state.conditionGrade;
        break;
      case 'tags':
        out.tags = Array.isArray(state.tags) ? state.tags : [];
        break;
      case 'listingType':
        if (state.listingType) out.listingType = state.listingType;
        break;
      case 'reverseDailyDrop':
        out.reverseDailyDrop = state.reverseDailyDrop ?? null;
        break;
      case 'reverseFloorPrice':
        out.reverseFloorPrice = state.reverseFloorPrice ?? null;
        break;
      case 'brand':
        out.brand = trimOrNull(state.brand);
        break;
      case 'mpn':
        out.mpn = trimOrNull(state.mpn);
        break;
      case 'fccId':
        out.fccId = trimOrNull(state.fccId);
        break;
      case 'upc':
        out.upc = trimOrNull(state.upc);
        break;
      case 'ebayShippingOverride':
        out.ebayShippingOverride = state.ebayShippingOverride ?? null;
        break;
      case 'packageWeightOz':
      case 'packageLengthIn':
      case 'packageWidthIn':
      case 'packageHeightIn':
        packageDirty = true;
        break;
      default:
        break; // price and anything unknown are ignored
    }
  }
  if (packageDirty && weightTouched) {
    out.packageWeightOz = state.packageWeightOz ?? null;
    out.packageLengthIn = state.packageLengthIn ?? null;
    out.packageWidthIn = state.packageWidthIn ?? null;
    out.packageHeightIn = state.packageHeightIn ?? null;
    if (state.packageWeightOz != null) {
      out.packageConfirmedByOrganizer = true;
      out.packageEstimateSource = 'ORGANIZER';
    }
  }
  return out;
}
