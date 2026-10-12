/**
 * CardScanLink (ADR-138 batch B7): a link from the add items page to the Scan cards page for the sale.
 * Renders nothing unless the server says scanning is on (GET /api/card-scan/status), so a shop without it sees no change.
 */
import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { readStatus } from '../../lib/cardScan';
import { SCAN_COPY } from '../../lib/cardScanCopy';

const CardScanLink: React.FC<{ saleId: string; className?: string }> = ({ saleId, className }) => {
  const { data } = useQuery({
    queryKey: ['card-scan-enabled'],
    queryFn: async () => {
      const status = readStatus((await api.get('/card-scan/status')).data);
      return status ? status.scanEnabled : false;
    },
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (data !== true) return null;
  return (
    <Link href={`/organizer/card-scan/${encodeURIComponent(saleId)}`} className={className}>
      {SCAN_COPY.pageTitle}
    </Link>
  );
};

export default CardScanLink;
