import React from 'react';
import { PayoutRow } from '../../lib/types/consignorSettlement';
import { MarkPaidBody } from '../../hooks/useConsignorSettlement';
import MarkPaidFields from './MarkPaidFields';
import { ModalShell } from './ui';

const MarkPaidDialog: React.FC<{
  row: PayoutRow;
  onClose: () => void;
  onConfirm: (body: MarkPaidBody) => Promise<void>;
}> = ({ row, onClose, onConfirm }) => (
  <ModalShell titleId="mark-paid-title" onClose={onClose}>
    <h2 id="mark-paid-title" className="text-xl font-bold text-warm-900 dark:text-white mb-1">
      Mark as paid
    </h2>
    <p className="text-sm text-warm-500 dark:text-warm-400 mb-4">{row.name}</p>
    <MarkPaidFields
      idPrefix="mark-paid"
      consignorName={row.name}
      amount={row.net}
      preferredPayoutMethod={row.preferredPayoutMethod}
      hasEmail={!!row.email}
      emailKnown={row.emailKnown}
      onCancel={onClose}
      onSubmit={onConfirm}
    />
  </ModalShell>
);

export default MarkPaidDialog;
