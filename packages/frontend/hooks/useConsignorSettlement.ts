import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Batch,
  SaleSummary,
  SettlementPreview,
  normalizeBatch,
  normalizePreview,
  normalizeSalesSummary,
  countOf,
} from '../lib/types/consignorSettlement';

/**
 * Consignor payouts ("organizer settles" ledger). TEAMS only.
 *
 * API base path. This is the path the backend router is mounted at in
 * packages/backend/src/index.ts (app.use('/api/consignor-settlements', ...)).
 * It is the only place the path lives, so if the mount ever changes, change this one line.
 */
export const CS_BASE = '/consignor-settlements';

const enc = (s: string) => encodeURIComponent(s);

export const csKeys = {
  all: ['consignor-settlement'] as const,
  preview: (saleId?: string, consignorId?: string, asOf?: string) =>
    ['consignor-settlement', 'preview', saleId || 'all', consignorId || 'any', asOf || 'now'] as const,
  batch: (id: string) => ['consignor-settlement', 'batch', id] as const,
  summary: ['consignor-settlement', 'sales-summary'] as const,
};

export interface PreviewParams {
  saleId?: string;
  consignorId?: string;
  asOf?: string;
}

export type CreateRunResult =
  | { existing: false; batchId: string }
  | { existing: true; batchId: string };

export interface RefreshDiff {
  added: number;
  removed: number;
  changed: number;
}

export interface MarkPaidBody {
  method: string;
  paidAt: string;
  reference?: string;
  note?: string;
  notifyConsignor?: boolean;
}

export interface SendStatementResult {
  sent: boolean;
  reason: string | null;
}

/** Plain async calls (used by the page, the dialogs and the Record a payment modal). */
export const csApi = {
  preview: async (p: PreviewParams): Promise<SettlementPreview> => {
    const url = p.saleId ? `${CS_BASE}/preview/${enc(p.saleId)}` : `${CS_BASE}/preview`;
    const params: Record<string, string> = {};
    if (p.consignorId) params.consignorId = p.consignorId;
    if (p.asOf) params.asOf = p.asOf;
    const res = await api.get(url, { params });
    return normalizePreview(res.data);
  },

  batch: async (id: string): Promise<Batch> => {
    const res = await api.get(`${CS_BASE}/${enc(id)}`);
    return normalizeBatch(res.data);
  },

  salesSummary: async (): Promise<Record<string, SaleSummary>> => {
    const res = await api.get(`${CS_BASE}/sales-summary`);
    return normalizeSalesSummary(res.data);
  },

  /** Creates a run. A 409 means these items are already in a run, so we hand back that run's id. */
  createRun: async (body: { saleId?: string; consignorIds?: string[]; asOf?: string }): Promise<CreateRunResult> => {
    try {
      const res = await api.post(CS_BASE, body);
      const b = normalizeBatch(res.data);
      return { existing: false, batchId: b.id };
    } catch (e: any) {
      if (e && e.response && e.response.status === 409) {
        const d = e.response.data || {};
        const id =
          d.batchId ||
          d.existingBatchId ||
          (d.batch && d.batch.id) ||
          (d.existingBatch && d.existingBatch.id);
        if (id) return { existing: true, batchId: String(id) };
      }
      throw e;
    }
  },

  refresh: async (batchId: string): Promise<RefreshDiff> => {
    const res = await api.post(`${CS_BASE}/${enc(batchId)}/refresh`, {});
    const d = (res.data && (res.data.diff || res.data)) || {};
    return { added: countOf(d.added), removed: countOf(d.removed), changed: countOf(d.changed) };
  },

  approve: async (batchId: string, body: { sendStatements?: boolean; acknowledgeVariance?: boolean }) => {
    const res = await api.post(`${CS_BASE}/${enc(batchId)}/approve`, body);
    return res.data;
  },

  cancel: async (batchId: string, reason: string) => {
    const res = await api.post(`${CS_BASE}/${enc(batchId)}/cancel`, { reason });
    return res.data;
  },

  markPaid: async (payoutId: string, body: MarkPaidBody) => {
    const res = await api.post(`${CS_BASE}/payouts/${enc(payoutId)}/mark-paid`, body);
    return res.data;
  },

  undoPaid: async (payoutId: string, reason: string) => {
    const res = await api.post(`${CS_BASE}/payouts/${enc(payoutId)}/undo-paid`, { reason });
    return res.data;
  },

  hold: async (payoutId: string) => {
    const res = await api.post(`${CS_BASE}/payouts/${enc(payoutId)}/hold`, {});
    return res.data;
  },

  release: async (payoutId: string) => {
    const res = await api.post(`${CS_BASE}/payouts/${enc(payoutId)}/release`, {});
    return res.data;
  },

  sendStatement: async (payoutId: string): Promise<SendStatementResult> => {
    const res = await api.post(`${CS_BASE}/payouts/${enc(payoutId)}/send-statement`, {});
    const d = res.data || {};
    return { sent: d.sent !== false, reason: typeof d.reason === 'string' ? d.reason : null };
  },

  statement: async (payoutId: string): Promise<any> => {
    const res = await api.get(`${CS_BASE}/payouts/${enc(payoutId)}/statement`);
    return res.data;
  },

  /** Downloads a file through the authenticated client (cookies + CSRF), then saves it. */
  download: async (path: string, filename: string): Promise<void> => {
    const res = await api.get(`${CS_BASE}${path}`, { responseType: 'blob' });
    const blob: Blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  },
};

/**
 * Preview of what is owed. Pass saleId for one sale, omit it for every sale.
 * `enabled` MUST include the TEAMS check so SIMPLE and PRO organizers make zero requests.
 */
export function useSettlementPreview(params: PreviewParams, enabled: boolean) {
  return useQuery({
    queryKey: csKeys.preview(params.saleId, params.consignorId, params.asOf),
    queryFn: () => csApi.preview(params),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useSettlementBatch(batchId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: csKeys.batch(batchId || 'none'),
    queryFn: () => csApi.batch(batchId as string),
    enabled: enabled && !!batchId,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Per-sale unsettled counts for the Sales list. Gate `enabled` on canAccess('TEAMS'). */
export function useSalesSummary(enabled: boolean) {
  return useQuery({
    queryKey: csKeys.summary,
    queryFn: () => csApi.salesSummary(),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
