import React from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { csApi } from '../../hooks/useConsignorSettlement';
import {
  StatementView,
  fmtDate,
  fmtMoney,
  methodLabel,
  normalizeStatement,
  errMsg,
} from '../../lib/types/consignorSettlement';
import { ModalShell, btnOutline, btnPrimary } from './ui';

/**
 * Statement print view. This is the browser-print fallback for the PDF download: the dialog shows
 * the statement(s) on screen, and "Print" prints only a clean copy (see PRINT_CSS) so the organizer
 * can pick "Save as PDF" in the print window. No PDF library, no server round trip beyond the JSON.
 */
const PRINT_CSS = `
@media screen { #statement-print-root { display: none; } }
@media print {
  body > *:not(#statement-print-root) { display: none !important; }
  #statement-print-root { display: block !important; }
  #statement-print-root .statement-sheet { page-break-after: always; break-after: page; }
  #statement-print-root .statement-sheet:last-child { page-break-after: auto; break-after: auto; }
}
`;

const StatementSheet: React.FC<{ s: StatementView; forPrint?: boolean }> = ({ s, forPrint }) => {
  // Print copy is always black on white: dark: variants would print white text on white paper.
  const text = forPrint ? 'text-black' : 'text-warm-900 dark:text-white';
  const muted = forPrint ? 'text-gray-600' : 'text-warm-600 dark:text-warm-400';
  const line = forPrint ? 'border-gray-300' : 'border-warm-200 dark:border-gray-700';
  const wrap = forPrint
    ? 'statement-sheet bg-white p-8 text-black'
    : 'statement-sheet rounded-lg border border-warm-200 dark:border-gray-700 p-4 sm:p-5';
  return (
    <section className={wrap}>
      <header className="mb-4">
        <h3 className={`text-lg font-bold ${text}`}>Consignor statement</h3>
        {s.businessName && <p className={`text-sm ${muted}`}>{s.businessName}</p>}
      </header>

      <dl className={`grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-4 ${text}`}>
        <dt className={muted}>Consignor</dt>
        <dd className="font-medium">{s.consignorName}</dd>
        {s.saleTitle && (
          <>
            <dt className={muted}>Sale</dt>
            <dd>{s.saleTitle}</dd>
          </>
        )}
        {s.issuedOn && fmtDate(s.issuedOn) && (
          <>
            <dt className={muted}>Date</dt>
            <dd>{fmtDate(s.issuedOn)}</dd>
          </>
        )}
        {s.paidAt && (
          <>
            <dt className={muted}>Paid</dt>
            <dd>
              {fmtDate(s.paidAt)}
              {s.method ? `, ${methodLabel(s.method)}` : ''}
              {s.reference ? `, ref ${s.reference}` : ''}
            </dd>
          </>
        )}
      </dl>

      {s.items.length > 0 ? (
        <table className={`w-full text-sm mb-4 ${text}`}>
          <thead>
            <tr className={`border-b ${line} text-left ${muted}`}>
              <th className="py-1 pr-2 font-bold">Item</th>
              <th className="py-1 pr-2 font-bold">Sold</th>
              <th className="py-1 pr-2 font-bold text-right">Price</th>
              <th className="py-1 font-bold text-right">Your share</th>
            </tr>
          </thead>
          <tbody>
            {s.items.map((i) => (
              <tr key={i.id} className={`border-b ${line}`}>
                <td className="py-1 pr-2">{i.title}</td>
                <td className="py-1 pr-2">{fmtDate(i.soldAt)}</td>
                <td className="py-1 pr-2 text-right">{fmtMoney(i.salePrice)}</td>
                <td className="py-1 text-right">{i.net !== null ? fmtMoney(i.net) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={`text-sm mb-4 ${muted}`}>No item lines came with this statement.</p>
      )}

      <div className={`text-sm space-y-1 ${text}`}>
        <div className="flex justify-between">
          <span className={muted}>Total sales</span>
          <span>{fmtMoney(s.gross)}</span>
        </div>
        <div className="flex justify-between">
          <span className={muted}>Kept by the seller</span>
          <span>{fmtMoney(s.commission)}</span>
        </div>
        <div className={`flex justify-between font-bold text-base pt-2 border-t ${line}`}>
          <span>Owed to {s.consignorName}</span>
          <span>{fmtMoney(s.net)}</span>
        </div>
      </div>

      <p className={`text-xs mt-4 ${muted}`}>
        {s.businessName || 'The seller'} pays this amount directly. FindA.Sale keeps the numbers and does
        not send or hold any money.
      </p>
    </section>
  );
};

const StatementPrintDialog: React.FC<{
  payouts: Array<{ id: string; name: string }>;
  onClose: () => void;
}> = ({ payouts, onClose }) => {
  const ids = payouts.map((p) => p.id);
  const q = useQuery({
    queryKey: ['consignor-settlement', 'statements', ids.join(',')],
    queryFn: async (): Promise<StatementView[]> => {
      const raws = await Promise.all(ids.map((id) => csApi.statement(id)));
      return raws.map((r, idx) => normalizeStatement(r, ids[idx]));
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const statements = q.data || [];

  return (
    <>
      <ModalShell titleId="statement-title" onClose={onClose} wide>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="statement-title" className="text-xl font-bold text-warm-900 dark:text-white">
              {payouts.length === 1 ? 'Statement' : 'Statements'}
            </h2>
            <p className="text-sm text-warm-500 dark:text-warm-400">
              Choose Save as PDF in the print window to keep a copy.
            </p>
          </div>
        </div>

        {q.isLoading && (
          <p className="text-sm text-warm-600 dark:text-warm-400" aria-busy="true">
            Loading statements...
          </p>
        )}

        {q.isError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 mb-4"
          >
            <p className="text-sm text-red-700 dark:text-red-300 mb-2">
              {errMsg(q.error, 'We could not load the statement.')}
            </p>
            <button type="button" onClick={() => q.refetch()} className={btnOutline}>
              Retry
            </button>
          </div>
        )}

        {statements.length > 0 && (
          <div className="space-y-4 mb-4">
            {statements.map((s) => (
              <StatementSheet key={s.payoutId} s={s} />
            ))}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button type="button" onClick={onClose} className={btnOutline + ' flex-1'}>
            Close
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={statements.length === 0}
            className={btnPrimary + ' flex-1'}
          >
            Print
          </button>
        </div>
      </ModalShell>

      {typeof document !== 'undefined' &&
        statements.length > 0 &&
        createPortal(
          <div id="statement-print-root" aria-hidden="true">
            <style>{PRINT_CSS}</style>
            {statements.map((s) => (
              <StatementSheet key={s.payoutId} s={s} forPrint />
            ))}
          </div>,
          document.body
        )}
    </>
  );
};

export default StatementPrintDialog;
