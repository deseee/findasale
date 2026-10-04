/**
 * useConfirmImport (ADR-134 #642, batch B8): runs the confirm request and keeps the import state.
 *
 *  - The request is a fetch with a stream reader (axios cannot stream); lib/cardIntakeStream.ts does the reading and
 *    the reducer. This hook only wires it to React.
 *  - Stop aborts the request. The server keeps its place in a ledger, so sending the same file again resumes.
 *  - While an import runs, the browser asks before the page is closed or reloaded.
 *  - A once-a-second clock feeds the calm "still working" note after a quiet spell. Nothing is ever cut off by it.
 *  - When an import ends with cards added, the cached item lists are refreshed.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import type { ConfirmDeps } from '../../lib/cardIntakeStream';
import { INITIAL_IMPORT_STATE, defaultApiBase, isStalled, readCsrfToken, reduceImport, runConfirm } from '../../lib/cardIntakeStream';

export interface StartArgs {
  file: File;
  fields: Array<[string, string]>;
}

/** One cheap authenticated request; the shared axios client refreshes the login on a 401 and tells us if it worked. */
async function refreshSession(): Promise<boolean> {
  try {
    await api.get('/card-intake/formats');
    return true;
  } catch {
    return false;
  }
}

export function useConfirmImport(saleId: string) {
  const [state, dispatch] = useReducer(reduceImport, INITIAL_IMPORT_STATE);
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const queryClient = useQueryClient();

  const running = state.status === 'running';

  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Some browsers still need a return value to show their own "leave this page?" question.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [running]);

  // Leaving the page ends the request; the server keeps what it already saved.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if ((state.status === 'done' || state.status === 'stopped') && (state.created > 0 || state.merged > 0)) {
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
    }
  }, [state.status, state.created, state.merged, saleId, queryClient]);

  const start = useCallback(
    async (args: StartArgs) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setStopping(false);
      const controller = new AbortController();
      abortRef.current = controller;
      dispatch({ type: 'start', now: Date.now() });
      const deps: ConfirmDeps = {
        fetchImpl: (url, init) => window.fetch(url, init as RequestInit),
        getCsrfToken: () => readCsrfToken(document.cookie),
        apiBase: defaultApiBase(),
        refreshSession,
      };
      const outcome = await runConfirm(deps, {
        saleId,
        file: args.file,
        fileName: args.file.name,
        fields: args.fields,
        signal: controller.signal,
        onEvent: (event) => dispatch({ type: 'event', event, now: Date.now() }),
      });
      runningRef.current = false;
      abortRef.current = null;
      setStopping(false);
      if (outcome.kind === 'failure') dispatch({ type: 'failure', failure: outcome.failure });
      else if (!outcome.sawTerminal) dispatch({ type: 'streamEnded' });
    },
    [saleId]
  );

  const stop = useCallback(() => {
    if (!abortRef.current) return;
    setStopping(true);
    abortRef.current.abort();
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  return { state, stalled: running && isStalled(state.lastEventAt, now), stopping, start, stop, reset };
}
