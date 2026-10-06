/**
 * /pos/<saleId> -- redirects to the organizer register (2026-10-06).
 *
 * Price-label QR codes (label composer, print kits) encode https://finda.sale/pos/<saleId>?action=add-misc&price=...
 * (consignor price tags add &c=<consignorId>&n=<tagId>&s=<signature>). That path had no page and answered 404. This page
 * forwards to /organizer/pos?saleId=<id>&<action, price, c, n, s> so the register's own URL handling adds the line.
 *
 * Same convention as organizer/hubs/[hubId]/cart.tsx: a getServerSideProps redirect, no client logic. A signed-out
 * visitor lands on /organizer/pos, which sends them to /login?redirect=<that URL>, and login returns them here with the
 * tag query intact. Only the five known query keys are forwarded.
 */

import type { GetServerSideProps } from 'next';

const FORWARDED_KEYS = ['action', 'price', 'c', 'n', 's'] as const;
const SALE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { saleId } = context.params || {};

  if (!saleId || typeof saleId !== 'string' || !SALE_ID_RE.test(saleId)) {
    return { redirect: { destination: '/organizer/pos', permanent: false } };
  }

  const params = new URLSearchParams();
  params.set('saleId', saleId);
  for (const key of FORWARDED_KEYS) {
    const raw = context.query[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.length > 0 && value.length <= 128) params.set(key, value);
  }

  return {
    redirect: {
      destination: `/organizer/pos?${params.toString()}`,
      permanent: false,
    },
  };
};

export default function PosSaleRedirect() {
  return null;
}
