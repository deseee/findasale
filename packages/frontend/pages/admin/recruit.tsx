import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

// ADR-139 §7: admin page for the organizer recruit channel. Response shapes mirror
// packages/backend/src/routes/adminRecruit.ts.

interface Stats {
  today: { used: number; cap: number };
  window: {
    days: number;
    sent: number;
    confirmSent: number;
    hardBounces: number;
    bouncePct: number;
    complaints: number;
    unsubscribes: number;
    byKind: Record<string, number>;
  };
  killSwitch: { env: boolean; flag: boolean; transport: string; open: boolean };
  transportReady: { ok: boolean; reason?: string };
  health: { wouldPause: boolean; reason: string | null };
  lastPauseEvent: { type: string; reason: string | null; actorId: string | null; createdAt: string } | null;
  queue: { byStatus: Record<string, number>; bySource: Record<string, number> };
  converted: number;
  config: {
    planTier: string;
    sendingDomain: string;
    fromEmail: string | null;
    replyToSet: boolean;
    mailingAddressSet: boolean;
    thresholds: { bouncePausePct: number; bounceMinSample: number; bouncePauseAbsolute: number };
  };
}

interface Lead {
  id: string;
  email: string;
  businessName: string;
  state: string | null;
  source: string;
  sourceDetail: string | null;
  status: string;
  sequenceStep: number;
  nextSendAt: string | null;
  consentAt: string | null;
  consentSource: string | null;
  skipReason: string | null;
  lastError: string | null;
  sentAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  sendableUnderCurrentTransport: boolean;
  notSendableReason: string | null;
}

interface Preview {
  subject: string;
  html: string;
  text: string;
  step: number;
}

const STATUSES = ['PENDING_CONFIRM', 'QUEUED', 'APPROVED', 'SENDING', 'SENT', 'SKIPPED', 'FAILED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED'];
const SOURCES = ['OPT_IN_FORM', 'MANUAL', 'DIRECTORY'];

function errMsg(err: any, fallback: string): string {
  return err?.response?.data?.error || fallback;
}

function Pill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        on ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
      }`}
    >
      {label}: {on ? 'on' : 'off'}
    </span>
  );
}

export default function AdminRecruitPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ lead: Lead; data: Preview | null; error: string } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ email: '', businessName: '', state: '', consentNote: '' });

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/access-denied');
  }, [authLoading, isAdmin, router]);

  const showToast = (kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 5000);
  };

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/recruit/stats');
      setStats(res.data);
      setStatsError('');
    } catch (err) {
      setStatsError(errMsg(err, 'Could not load channel stats.'));
    }
  }, []);

  const loadLeads = useCallback(
    async (cursor?: string) => {
      setLeadsLoading(true);
      try {
        const params: Record<string, string> = { limit: '50' };
        if (statusFilter) params.status = statusFilter;
        if (sourceFilter) params.source = sourceFilter;
        if (cursor) params.cursor = cursor;
        const res = await api.get('/admin/recruit/leads', { params });
        setLeads((prev) => (cursor ? [...prev, ...res.data.leads] : res.data.leads));
        setNextCursor(res.data.nextCursor);
        setLeadsError('');
        if (!cursor) setSelected(new Set());
      } catch (err) {
        setLeadsError(errMsg(err, 'Could not load leads.'));
      } finally {
        setLeadsLoading(false);
      }
    },
    [statusFilter, sourceFilter]
  );

  useEffect(() => {
    if (isAdmin) loadStats();
  }, [isAdmin, loadStats]);

  useEffect(() => {
    if (isAdmin) loadLeads();
  }, [isAdmin, loadLeads]);

  const refreshAll = () => {
    loadStats();
    loadLeads();
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const approveSelected = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await api.post('/admin/recruit/batches', { leadIds: Array.from(selected).slice(0, 100) });
      const approved = res.data.approved?.length ?? 0;
      const rejected = res.data.rejected?.length ?? 0;
      showToast(approved > 0 ? 'ok' : 'err', `Approved ${approved}. Not approved ${rejected}${rejected ? ` (${res.data.rejected[0].reason})` : ''}.`);
      refreshAll();
    } catch (err) {
      showToast('err', errMsg(err, 'Approval failed.'));
    } finally {
      setBusy(false);
    }
  };

  const skip = async (lead: Lead) => {
    const reason = window.prompt(`Skip ${lead.email}? Reason:`, 'not a fit');
    if (!reason) return;
    setBusy(true);
    try {
      await api.post(`/admin/recruit/leads/${encodeURIComponent(lead.id)}/skip`, { reason: reason.slice(0, 200) });
      showToast('ok', 'Lead skipped.');
      refreshAll();
    } catch (err) {
      showToast('err', errMsg(err, 'Skip failed.'));
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async (lead: Lead) => {
    setPreview({ lead, data: null, error: '' });
    try {
      const res = await api.get(`/admin/recruit/leads/${encodeURIComponent(lead.id)}/preview`);
      setPreview({ lead, data: res.data, error: '' });
    } catch (err) {
      setPreview({ lead, data: null, error: errMsg(err, 'Could not load the preview.') });
    }
  };

  const testSend = async (lead: Lead) => {
    setBusy(true);
    try {
      const res = await api.post('/admin/recruit/test-send', { leadId: lead.id });
      showToast('ok', `Test sent to ${res.data.sentTo}.`);
      loadStats();
    } catch (err) {
      showToast('err', errMsg(err, 'Test send failed.'));
    } finally {
      setBusy(false);
    }
  };

  const pause = async () => {
    const reason = window.prompt('Pause sending. Reason:', 'manual pause');
    if (!reason) return;
    setBusy(true);
    try {
      await api.post('/admin/recruit/pause', { reason: reason.slice(0, 300) });
      showToast('ok', 'Sending paused.');
      loadStats();
    } catch (err) {
      showToast('err', errMsg(err, 'Pause failed.'));
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!window.confirm('Turn the recruit send switch on? Approved leads will start sending on the next run.')) return;
    setBusy(true);
    try {
      await api.post('/admin/recruit/resume', { confirm: 'RESUME' });
      showToast('ok', 'Send switch is on.');
      loadStats();
    } catch (err) {
      showToast('err', errMsg(err, 'Resume failed.'));
    } finally {
      setBusy(false);
    }
  };

  const buildFromDirectory = async () => {
    setBusy(true);
    try {
      const res = await api.post('/admin/recruit/leads/build-from-directory', { limit: 50 });
      showToast('ok', `Added ${res.data.created} directory leads.`);
      refreshAll();
    } catch (err) {
      showToast('err', errMsg(err, 'Directory build failed.'));
    } finally {
      setBusy(false);
    }
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/admin/recruit/leads/manual', {
        email: manual.email.trim(),
        businessName: manual.businessName.trim(),
        ...(manual.state.trim() ? { state: manual.state.trim() } : {}),
        consentNote: manual.consentNote.trim(),
      });
      showToast('ok', 'Manual lead added.');
      setManual({ email: '', businessName: '', state: '', consentNote: '' });
      setShowManual(false);
      refreshAll();
    } catch (err) {
      showToast('err', errMsg(err, 'Could not add the lead.'));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || !isAdmin) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  const card = 'bg-white dark:bg-gray-800 rounded-lg shadow p-4';
  const btn = 'px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const input =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm';

  return (
    <>
      <Head>
        <title>Recruit Channel - Admin - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 px-4 py-6 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <Link href="/admin" className="text-sm text-amber-700 dark:text-amber-400 hover:underline">
                &larr; Admin
              </Link>
              <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100">Organizer Recruit Channel</h1>
            </div>
            <button onClick={refreshAll} disabled={busy} className={`${btn} bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100`}>
              Refresh
            </button>
          </div>

          {toast && (
            <div
              role="status"
              className={`mb-4 rounded-lg px-4 py-3 text-sm ${
                toast.kind === 'ok' ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
              }`}
            >
              {toast.text}
            </div>
          )}

          {/* Stats header */}
          {statsError && <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">{statsError}</div>}
          {!stats && !statsError && <div className={`${card} mb-4 text-sm text-gray-500 dark:text-gray-400`}>Loading channel stats...</div>}
          {stats && (
            <div className="space-y-4 mb-6">
              <div className={card}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-bold ${
                      stats.killSwitch.open ? 'bg-green-600 text-white' : 'bg-gray-700 text-white dark:bg-gray-600'
                    }`}
                  >
                    {stats.killSwitch.open ? 'SENDING ON' : 'SENDING OFF'}
                  </span>
                  <Pill on={stats.killSwitch.env} label="Env switch" />
                  <Pill on={stats.killSwitch.flag} label="Flag" />
                  <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    Transport: {stats.killSwitch.transport}
                  </span>
                  {!stats.transportReady.ok && (
                    <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
                      Not ready: {stats.transportReady.reason}
                    </span>
                  )}
                </div>
                {stats.lastPauseEvent && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Last change: <strong>{stats.lastPauseEvent.type}</strong>
                    {stats.lastPauseEvent.reason ? ` (${stats.lastPauseEvent.reason})` : ''} on{' '}
                    {new Date(stats.lastPauseEvent.createdAt).toLocaleString()}
                  </p>
                )}
                {stats.health.wouldPause && (
                  <p className="text-sm text-red-700 dark:text-red-300 mb-2">Health check would pause sending: {stats.health.reason}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Auto-pause: any complaint, {stats.config.thresholds.bouncePauseAbsolute} hard bounces, or more than{' '}
                  {stats.config.thresholds.bouncePausePct}% hard bounces once {stats.config.thresholds.bounceMinSample} emails have gone out, all in the last{' '}
                  {stats.window.days} days. One complaint blocks Resume for up to {stats.window.days} days. That is expected, not a fault.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={pause} disabled={busy || !stats.killSwitch.flag} className={`${btn} bg-gray-800 text-white dark:bg-gray-600`}>
                    Pause
                  </button>
                  <button onClick={resume} disabled={busy || stats.killSwitch.flag} className={`${btn} bg-green-600 hover:bg-green-700 text-white`}>
                    Resume
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  ['Sent today', `${stats.today.used} / ${stats.today.cap}`],
                  [`Sent ${stats.window.days}d`, String(stats.window.sent)],
                  ['Confirm emails', String(stats.window.confirmSent)],
                  ['Hard bounces', `${stats.window.hardBounces} (${stats.window.bouncePct}%)`],
                  ['Complaints', String(stats.window.complaints)],
                  ['Unsubscribes', String(stats.window.unsubscribes)],
                ].map(([label, value]) => (
                  <div key={label} className={card}>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="text-lg font-bold text-warm-900 dark:text-warm-100">{value}</p>
                  </div>
                ))}
              </div>

              <div className={`${card} text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-6 gap-y-1`}>
                <span>Plan: {stats.config.planTier}</span>
                <span>Domain: {stats.config.sendingDomain}</span>
                <span>From: {stats.config.fromEmail || 'not set'}</span>
                <span>Reply-To: {stats.config.replyToSet ? 'set' : 'not set'}</span>
                <span>Mailing address: {stats.config.mailingAddressSet ? 'set' : 'not set'}</span>
                <span>Converted: {stats.converted}</span>
                <span>
                  Queue:{' '}
                  {Object.entries(stats.queue.byStatus)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(', ') || 'empty'}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${input} w-auto`} aria-label="Status filter">
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={`${input} w-auto`} aria-label="Source filter">
              <option value="">All sources</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={approveSelected}
              disabled={busy || selected.size === 0}
              className={`${btn} bg-amber-600 hover:bg-amber-700 text-white`}
            >
              Approve selected ({selected.size})
            </button>
            <button onClick={() => setShowManual((v) => !v)} className={`${btn} bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100`}>
              {showManual ? 'Close manual entry' : 'Add manual lead'}
            </button>
            {stats?.killSwitch.transport === 'gmail_dedicated' && (
              <button onClick={buildFromDirectory} disabled={busy} className={`${btn} bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100`}>
                Build 50 from directory
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Confirmed interest-form leads are approved automatically. Manual leads need approval here.
          </p>

          {showManual && (
            <form onSubmit={submitManual} className={`${card} mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3`}>
              <input className={input} type="email" placeholder="Email" required maxLength={254} value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
              <input className={input} placeholder="Business name" required maxLength={120} value={manual.businessName} onChange={(e) => setManual({ ...manual, businessName: e.target.value })} />
              <input className={input} placeholder="State (2 letters, optional)" maxLength={2} value={manual.state} onChange={(e) => setManual({ ...manual, state: e.target.value })} />
              <input
                className={input}
                placeholder="Consent note (required): how did they ask to hear from us?"
                required
                maxLength={300}
                value={manual.consentNote}
                onChange={(e) => setManual({ ...manual, consentNote: e.target.value })}
              />
              <div className="sm:col-span-2">
                <button type="submit" disabled={busy} className={`${btn} bg-amber-600 hover:bg-amber-700 text-white`}>
                  Add lead
                </button>
              </div>
            </form>
          )}

          {/* Queue */}
          {leadsError && <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">{leadsError}</div>}
          {leadsLoading && leads.length === 0 && <div className={`${card} text-sm text-gray-500 dark:text-gray-400`}>Loading leads...</div>}
          {!leadsLoading && !leadsError && leads.length === 0 && (
            <div className={`${card} text-sm text-gray-600 dark:text-gray-400`}>
              No leads yet. Leads arrive from the interest form at /recruit/interest or from manual entry.
            </div>
          )}

          {leads.length > 0 && (
            <div className="space-y-2">
              {leads.map((l) => (
                <div key={l.id} className={`${card} flex flex-col sm:flex-row sm:items-center gap-3`}>
                  <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={selected.has(l.id)}
                      onChange={() => toggle(l.id)}
                      disabled={l.status !== 'QUEUED'}
                      aria-label={`Select ${l.email}`}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-warm-900 dark:text-warm-100 break-all">{l.email}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {l.businessName}
                        {l.state ? `, ${l.state}` : ''}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {l.source}
                        {l.sourceDetail ? ` (${l.sourceDetail})` : ''} &middot; {l.status} &middot; step {l.sequenceStep}/3
                        {l.nextSendAt ? ` · next ${new Date(l.nextSendAt).toLocaleString()}` : ''}
                        {l.consentAt ? ' · consented' : ' · no consent'}
                        {l.skipReason ? ` · ${l.skipReason}` : ''}
                        {l.convertedAt ? ' · converted' : ''}
                      </p>
                      {!l.sendableUnderCurrentTransport && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">Not sendable under current transport: {l.notSendableReason}</p>
                      )}
                      {l.lastError && <p className="text-xs text-red-700 dark:text-red-300 mt-1 break-all">Last error: {l.lastError}</p>}
                    </div>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => openPreview(l)} className={`${btn} bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100`}>
                      Preview
                    </button>
                    <button onClick={() => testSend(l)} disabled={busy} className={`${btn} bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100`}>
                      Test to me
                    </button>
                    <button onClick={() => skip(l)} disabled={busy} className={`${btn} bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100`}>
                      Skip
                    </button>
                  </div>
                </div>
              ))}
              {nextCursor && (
                <button
                  onClick={() => loadLeads(nextCursor)}
                  disabled={leadsLoading}
                  className={`${btn} w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100`}
                >
                  {leadsLoading ? 'Loading...' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-gray-800 w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-xl sm:rounded-xl p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 break-all">Preview for {preview.lead.email}</p>
                {preview.data && (
                  <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100">
                    Step {preview.data.step}: {preview.data.subject}
                  </h2>
                )}
              </div>
              <button onClick={() => setPreview(null)} className={`${btn} bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100`}>
                Close
              </button>
            </div>
            {!preview.data && !preview.error && <p className="text-sm text-gray-500 dark:text-gray-400">Loading preview...</p>}
            {preview.error && <p className="text-sm text-red-700 dark:text-red-300">{preview.error}</p>}
            {preview.data && (
              <>
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview.data.html}
                  className="w-full h-96 rounded border border-gray-200 dark:border-gray-700 bg-white"
                />
                <details className="mt-3">
                  <summary className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer">Plain-text version</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300">{preview.data.text}</pre>
                </details>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
