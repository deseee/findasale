/**
 * TcgplayerRegisterNotice (ADR-137 #660): the counter warning for cards that are also listed on TCGplayer.
 *
 * Mounted twice on the register (pages/organizer/pos.tsx):
 *  - while the cart is open: "This card is also listed on TCGplayer", with a link to the sync page;
 *  - after a sale is paid (sold): the same warning with a one step "Download TCGplayer update file" button.
 * It asks GET /api/card-tcgplayer/:saleId/register-check once per set of items. When the feature is off, nothing is
 * a card, the request fails or no item is listed, it renders nothing, so the register looks exactly as before.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  DEFAULT_EXPORT_CHOICES,
  TCG_COPY,
  counterMessage,
  isKnownDisabled,
  listedCount,
  readExport,
  readRegisterCheck,
  registerIds,
  registerKey,
  rememberDisabled,
  saveTextFile,
  syncPagePath,
  tcgErrorSentence,
} from '../lib/cardTcgplayer';
import { noticeErrorCls, noticeOkCls, noticeWarnCls, secondaryBtn } from './cardIntake/ui';

/** The backend answers for at most this many items per request. */
const MAX_ITEMS = 100;

interface Props {
  saleId: string;
  /** Item ids in the cart (or in the sale that was just paid). Ids that are not cards are ignored by the server. */
  itemIds: ReadonlyArray<string | undefined | null>;
  /** True after payment: offers the one step download instead of a link. */
  sold?: boolean;
}

type DownloadState = { kind: 'idle' } | { kind: 'working' } | { kind: 'done' } | { kind: 'nothing' } | { kind: 'failed'; message: string };

const TcgplayerRegisterNotice: React.FC<Props> = ({ saleId, itemIds, sold = false }) => {
  const ids = registerIds(itemIds).slice(0, MAX_ITEMS);
  const key = registerKey(ids);
  const [download, setDownload] = useState<DownloadState>({ kind: 'idle' });

  const check = useQuery({
    queryKey: ['card-tcgplayer-register-check', saleId, key],
    enabled: saleId !== '' && ids.length > 0 && !isKnownDisabled(saleId),
    queryFn: async () => {
      const res = await api.get('/card-tcgplayer/' + encodeURIComponent(saleId) + '/register-check', { params: { itemIds: ids.join(',') } });
      const parsed = readRegisterCheck(res.data);
      if (!parsed) throw new Error('Unreadable register check');
      if (!parsed.enabled) rememberDisabled(saleId);
      return parsed;
    },
    staleTime: 15 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const listed = check.data && check.data.enabled ? listedCount(check.data.items) : 0;
  const message = counterMessage(listed, sold);
  if (!message) return null;

  const runDownload = async () => {
    setDownload({ kind: 'working' });
    try {
      const res = await api.post('/card-tcgplayer/' + encodeURIComponent(saleId) + '/export', DEFAULT_EXPORT_CHOICES);
      const out = readExport(res.data);
      if (!out) {
        setDownload({ kind: 'failed', message: TCG_COPY.counterFailed });
        return;
      }
      if (out.csv === null || out.rowCount === 0) {
        setDownload({ kind: 'nothing' });
        return;
      }
      if (!saveTextFile(out.fileName, out.csv)) {
        setDownload({ kind: 'failed', message: TCG_COPY.counterFailed });
        return;
      }
      setDownload({ kind: 'done' });
    } catch (err) {
      setDownload({ kind: 'failed', message: tcgErrorSentence(err) });
    }
  };

  return (
    <div className="mt-3 min-w-0 space-y-2" data-testid="tcgplayer-register-notice">
      <div role="status" className={noticeWarnCls}>
        <p className="break-words">{message}</p>
        <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          {sold ? (
            <button type="button" onClick={runDownload} disabled={download.kind === 'working'} className={secondaryBtn}>
              {download.kind === 'working' ? TCG_COPY.exportWorking : TCG_COPY.counterDownload}
            </button>
          ) : null}
          <Link
            href={syncPagePath(saleId)}
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-800 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-200"
          >
            {TCG_COPY.counterOpenPage}
          </Link>
        </div>
      </div>
      {download.kind === 'done' ? (
        <p role="status" className={noticeOkCls}>
          {TCG_COPY.counterDownloaded}
        </p>
      ) : null}
      {download.kind === 'nothing' ? (
        <p role="status" className={noticeOkCls}>
          {TCG_COPY.counterNothingToSend}
        </p>
      ) : null}
      {download.kind === 'failed' ? (
        <p role="alert" className={noticeErrorCls}>
          {download.message}
        </p>
      ) : null}
    </div>
  );
};

export default TcgplayerRegisterNotice;
