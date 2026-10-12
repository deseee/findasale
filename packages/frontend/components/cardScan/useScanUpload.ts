/**
 * useScanUpload (ADR-138 batch B7): runs the send queue from lib/cardScanQueue.ts for one scan and keeps the thumbnails.
 *
 *  - Pictures go out two at a time. A retry reuses the same clientEntryId, so the server never counts or charges twice.
 *  - Pictures not sent yet are kept in IndexedDB (memory when that fails) and come back after a reload.
 *  - The thumbnail of each picture stays in this browser only (an object URL made from the Blob). It is never uploaded anywhere
 *    except as the one frame the server reads, and it is gone when the page closes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FrameResult, ScanClient } from '../../lib/cardScan';
import { createUploadQueue, makeFrameSender } from '../../lib/cardScanQueue';
import type { UploadQueue, UploadSnapshot } from '../../lib/cardScanQueue';
import { createPendingStore } from './pendingStore';

export const EMPTY_UPLOADS: UploadSnapshot = {
  items: [],
  pending: 0,
  sending: 0,
  failed: 0,
  doneCount: 0,
  paused: false,
  halted: false,
  haltFailure: null,
  idle: true,
};

export interface FrameInput {
  frame: Blob;
  fileName?: string;
  placementId?: string | null;
  gameHint?: string | null;
}

export interface UseScanUpload {
  snapshot: UploadSnapshot;
  /** Entry id to the object URL of the picture the seller took for it. */
  thumbs: Record<string, string>;
  enqueue: (input: FrameInput) => void;
  retry: (clientEntryId: string) => void;
  retryAllFailed: () => void;
  dismiss: (clientEntryId: string) => void;
  /** Starts sending again after a stop caused by a quota or a cap. */
  resume: () => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function useScanUpload(client: ScanClient, sessionId: string | null, onFrameResult: (result: FrameResult) => void): UseScanUpload {
  const [snapshot, setSnapshot] = useState<UploadSnapshot>(EMPTY_UPLOADS);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});
  const onFrameResultRef = useRef(onFrameResult);

  useEffect(() => {
    onFrameResultRef.current = onFrameResult;
  });

  const queue = useMemo<UploadQueue<Blob> | null>(() => {
    if (!sessionId) return null;
    return createUploadQueue<Blob>({
      send: makeFrameSender<Blob>(client, sessionId),
      sleep,
      store: createPendingStore(sessionId),
      onResult: (item, result) => {
        let url = '';
        try {
          url = URL.createObjectURL(item.frame);
        } catch {
          url = '';
        }
        if (url !== '') {
          const old = thumbsRef.current[result.entry.id];
          if (old) URL.revokeObjectURL(old);
          thumbsRef.current = { ...thumbsRef.current, [result.entry.id]: url };
          setThumbs(thumbsRef.current);
        }
        onFrameResultRef.current(result);
      },
    });
  }, [client, sessionId]);

  useEffect(() => {
    if (!queue) {
      setSnapshot(EMPTY_UPLOADS);
      return undefined;
    }
    const sync = () => setSnapshot(queue.snapshot());
    const unsubscribe = queue.subscribe(sync);
    queue.resume();
    void queue.restore().then(sync);
    sync();
    return () => {
      unsubscribe();
      queue.pause();
    };
  }, [queue]);

  // Thumbnails are browser memory only: release them when the page closes.
  useEffect(() => {
    return () => {
      const urls = thumbsRef.current;
      Object.keys(urls).forEach((k) => URL.revokeObjectURL(urls[k]));
      thumbsRef.current = {};
    };
  }, []);

  const enqueue = useCallback(
    (input: FrameInput) => {
      if (!queue) return;
      queue.enqueue({ frame: input.frame, fileName: input.fileName, placementId: input.placementId, gameHint: input.gameHint });
    },
    [queue],
  );
  const retry = useCallback((id: string) => (queue ? queue.retry(id) : undefined), [queue]);
  const retryAllFailed = useCallback(() => (queue ? queue.retryAllFailed() : undefined), [queue]);
  const dismiss = useCallback((id: string) => (queue ? queue.dismiss(id) : undefined), [queue]);
  const resume = useCallback(() => (queue ? queue.resume() : undefined), [queue]);

  return { snapshot, thumbs, enqueue, retry, retryAllFailed, dismiss, resume };
}
