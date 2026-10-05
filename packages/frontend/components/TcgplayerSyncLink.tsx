/**
 * TcgplayerSyncLink (ADR-137, roadmap #660): a link to the TCGplayer sync page for a sale.
 * Renders nothing unless the server says the sync is on. It asks the register check with no items, which does no
 * database work beyond the sale check, so a shop without the sync sees no change and pays nothing for the question.
 */
import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { TCG_COPY, isKnownDisabled, readRegisterCheck, rememberDisabled, syncPagePath } from '../lib/cardTcgplayer';

const TcgplayerSyncLink: React.FC<{ saleId: string; className?: string }> = ({ saleId, className }) => {
  const { data } = useQuery({
    queryKey: ['card-tcgplayer-enabled', saleId],
    enabled: saleId !== '' && !isKnownDisabled(saleId),
    queryFn: async () => {
      const res = await api.get('/card-tcgplayer/' + encodeURIComponent(saleId) + '/register-check');
      const parsed = readRegisterCheck(res.data);
      if (!parsed) throw new Error('Unreadable answer');
      if (!parsed.enabled) rememberDisabled(saleId);
      return parsed.enabled;
    },
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (data !== true) return null;
  return (
    <Link href={syncPagePath(saleId)} className={className}>
      {TCG_COPY.pageTitle}
    </Link>
  );
};

export default TcgplayerSyncLink;
