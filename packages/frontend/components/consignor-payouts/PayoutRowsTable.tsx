import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  ItemLine,
  PayoutRow,
  fmtDate,
  fmtMoney,
  methodLabel,
} from '../../lib/types/consignorSettlement';
import { PayoutStatusBadge } from './ui';

/**
 * What the run allows right now:
 *  none    no run yet (rows are just what is owed)
 *  draft   run exists, statements not approved yet
 *  live    statements approved (Statements ready, Partly paid, All paid): payments can be recorded
 *  closed  cancelled or legacy: read only
 */
export type RunPhase = 'none' | 'draft' | 'live' | 'closed';

export interface RowHandlers {
  onMarkPaid: (row: PayoutRow) => void;
  onSendStatement: (row: PayoutRow) => void;
  onHold: (row: PayoutRow) => void;
  onRelease: (row: PayoutRow) => void;
  onUndo: (row: PayoutRow) => void;
  onPrint: (row: PayoutRow) => void;
}

interface Props extends RowHandlers {
  rows: PayoutRow[];
  phase: RunPhase;
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  busy: boolean;
}

const actionBtn =
  'inline-flex items-center justify-center min-h-[44px] px-3 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const actionPrimary = actionBtn + ' bg-amber-600 hover:bg-amber-700 text-white';
const actionQuiet =
  actionBtn +
  ' bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100';

const rateLabel = (r: PayoutRow): string => {
  if (r.tiered) return 'Tiered';
  if (r.rate === null) return 'n/a';
  return `${Number(r.rate).toFixed(1)}%`;
};

const RowActions: React.FC<{ row: PayoutRow; phase: RunPhase; busy: boolean } & RowHandlers> = ({
  row,
  phase,
  busy,
  onMarkPaid,
  onSendStatement,
  onHold,
  onRelease,
  onUndo,
  onPrint,
}) => {
  if (phase !== 'live' || !row.payoutId || row.legacy) return null;
  const st = row.status;
  return (
    <div className="flex flex-wrap gap-2">
      {st === 'PENDING' && (
        <>
          <button type="button" disabled={busy} onClick={() => onMarkPaid(row)} className={actionPrimary}>
            Mark as paid
          </button>
          <button type="button" disabled={busy} onClick={() => onSendStatement(row)} className={actionQuiet}>
            Send statement
          </button>
          <button type="button" disabled={busy} onClick={() => onHold(row)} className={actionQuiet}>
            Put on hold
          </button>
          <button type="button" disabled={busy} onClick={() => onPrint(row)} className={actionQuiet}>
            Print statement
          </button>
        </>
      )}
      {st === 'ON_HOLD' && (
        <>
          <button type="button" disabled={busy} onClick={() => onRelease(row)} className={actionPrimary}>
            Release hold
          </button>
          <button type="button" disabled={busy} onClick={() => onSendStatement(row)} className={actionQuiet}>
            Send statement
          </button>
          <button type="button" disabled={busy} onClick={() => onPrint(row)} className={actionQuiet}>
            Print statement
          </button>
        </>
      )}
      {st === 'PAID' && (
        <>
          <button type="button" disabled={busy} onClick={() => onUndo(row)} className={actionQuiet}>
            Undo payment record
          </button>
          <button type="button" disabled={busy} onClick={() => onSendStatement(row)} className={actionQuiet}>
            Send statement
          </button>
          <button type="button" disabled={busy} onClick={() => onPrint(row)} className={actionQuiet}>
            Print statement
          </button>
        </>
      )}
    </div>
  );
};

const PaidDetail: React.FC<{ row: PayoutRow }> = ({ row }) => {
  if (row.status !== 'PAID') return null;
  const bits: string[] = [];
  if (row.method) bits.push(methodLabel(row.method));
  if (row.paidAt && fmtDate(row.paidAt)) bits.push(fmtDate(row.paidAt));
  if (row.reference) bits.push('ref ' + row.reference);
  if (bits.length === 0) return null;
  return <div className="text-xs text-warm-500 dark:text-warm-400 mt-1">{bits.join(', ')}</div>;
};

const ItemList: React.FC<{ items: ItemLine[] }> = ({ items }) => {
  if (items.length === 0) {
    return <p className="text-sm text-warm-500 dark:text-warm-400">No item lines to show.</p>;
  }
  return (
    <ul className="divide-y divide-warm-200 dark:divide-gray-700">
      {items.map((i) => (
        <li key={i.id} className="py-2 flex items-start justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="block text-warm-900 dark:text-white break-words">{i.title}</span>
            <span className="block text-xs text-warm-500 dark:text-warm-400">
              {[i.saleTitle, fmtDate(i.soldAt)].filter(Boolean).join(', ')}
            </span>
          </span>
          <span className="text-right flex-shrink-0">
            <span className="block text-warm-900 dark:text-white">{fmtMoney(i.salePrice)}</span>
            {i.net !== null && (
              <span className="block text-xs text-warm-500 dark:text-warm-400">Share {fmtMoney(i.net)}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
};

const ViewItemsToggle: React.FC<{ open: boolean; onClick: () => void; controls: string }> = ({
  open,
  onClick,
  controls,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={open}
    aria-controls={controls}
    className="inline-flex items-center gap-1 min-h-[44px] text-sm font-bold text-amber-700 dark:text-amber-400 hover:underline"
  >
    {open ? 'Hide items' : 'View items'}
    {open ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
  </button>
);

const PayoutRowsTable: React.FC<Props> = (props) => {
  const { rows, phase, expanded, onToggle, busy } = props;
  const handlers: RowHandlers = {
    onMarkPaid: props.onMarkPaid,
    onSendStatement: props.onSendStatement,
    onHold: props.onHold,
    onRelease: props.onRelease,
    onUndo: props.onUndo,
    onPrint: props.onPrint,
  };

  return (
    <>
      {/* md and up: table */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl border border-warm-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-warm-50 dark:bg-gray-700/50 text-left">
            <tr className="text-warm-600 dark:text-warm-400">
              <th className="px-4 py-3 font-bold">Consignor</th>
              <th className="px-4 py-3 font-bold text-right">Items</th>
              <th className="px-4 py-3 font-bold text-right">Sales</th>
              <th className="px-4 py-3 font-bold text-right">Rate</th>
              <th className="px-4 py-3 font-bold text-right">Owed</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
            {rows.map((r) => {
              const open = !!expanded[r.key];
              return (
                <React.Fragment key={r.key}>
                  <tr className="text-warm-900 dark:text-white align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                      <ViewItemsToggle open={open} onClick={() => onToggle(r.key)} controls={`items-${r.key}`} />
                    </td>
                    <td className="px-4 py-3 text-right">{r.itemCount}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(r.gross)}</td>
                    <td className="px-4 py-3 text-right">{rateLabel(r)}</td>
                    <td className="px-4 py-3 text-right font-bold">{fmtMoney(r.net)}</td>
                    <td className="px-4 py-3">
                      <PayoutStatusBadge status={r.status} simulated={r.simulated} />
                      <PaidDetail row={r} />
                    </td>
                    <td className="px-4 py-3">
                      <RowActions row={r} phase={phase} busy={busy} {...handlers} />
                    </td>
                  </tr>
                  {open && (
                    <tr id={`items-${r.key}`} className="bg-warm-50 dark:bg-gray-900/40">
                      <td colSpan={7} className="px-4 py-3">
                        <ItemList items={r.items} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* below md: stacked cards */}
      <div className="md:hidden space-y-3">
        {rows.map((r) => {
          const open = !!expanded[r.key];
          return (
            <div
              key={r.key}
              className="bg-white dark:bg-gray-800 rounded-xl border border-warm-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-bold text-warm-900 dark:text-white break-words min-w-0">{r.name}</h3>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-warm-500 dark:text-warm-400">Owed</div>
                  <div className="font-bold text-warm-900 dark:text-white">{fmtMoney(r.net)}</div>
                </div>
              </div>
              <div className="mb-3">
                <PayoutStatusBadge status={r.status} simulated={r.simulated} />
                <PaidDetail row={r} />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm mb-2">
                <div>
                  <dt className="text-xs text-warm-500 dark:text-warm-400">Items</dt>
                  <dd className="text-warm-900 dark:text-white">{r.itemCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-warm-500 dark:text-warm-400">Sales</dt>
                  <dd className="text-warm-900 dark:text-white">{fmtMoney(r.gross)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-warm-500 dark:text-warm-400">Rate</dt>
                  <dd className="text-warm-900 dark:text-white">{rateLabel(r)}</dd>
                </div>
              </dl>
              <ViewItemsToggle open={open} onClick={() => onToggle(r.key)} controls={`items-m-${r.key}`} />
              {open && (
                <div id={`items-m-${r.key}`} className="mb-3">
                  <ItemList items={r.items} />
                </div>
              )}
              <RowActions row={r} phase={phase} busy={busy} {...handlers} />
            </div>
          );
        })}
      </div>
    </>
  );
};

export default PayoutRowsTable;
