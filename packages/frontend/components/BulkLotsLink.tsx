/**
 * BulkLotsLink (ADR-136, roadmap #659): a link from the add items page to the bulk lots page for the sale.
 * Renders nothing unless the server says bulk lots are on (GET /api/bulk-lots/status), so a shop without bulk lots sees no change.
 */
import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { BULK_COPY, readBulkStatus } from '../lib/bulkLot';

const BulkLotsLink: React.FC<{ saleId: string; className?: string }> = ({ saleId, className }) => {
  const { data } = useQuery({
    queryKey: ['bulk-lots-status'],
    queryFn: async () => readBulkStatus((await api.get('/bulk-lots/status')).data),
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!data?.enabled) return null;
  return (
    <Link href={`/organizer/bulk-lots/${encodeURIComponent(saleId)}`} className={className}>
      {BULK_COPY.managePageTitle}
    </Link>
  );
};

export default BulkLotsLink;
