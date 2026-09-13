/**
 * /organizer/hubs/[hubId]/cart -- redirects to the venue register.
 *
 * This page used to be the multi-booth vendor register/cart (2026-07-07,
 * ADR-015/016/017; sequential per-booth checkout added 2026-07-08, ADR-020).
 * Its checkout flow was Stripe Terminal-only, and that flow is now
 * permanently broken: POST .../cart/:id/terminal/connection-token
 * unconditionally returns 503 TERMINAL_UNAVAILABLE
 * (vendorBoothCartController.ts).
 *
 * Since 2026-09-08 this page has been superseded by pos.tsx's venue mode
 * (/organizer/pos?venue=<hubId>), which hits the same backend cart endpoints
 * and already has working cash and Square-QR payment rails plus a proper
 * Terminal feature-gate. Every live "Register" link in the app
 * (HubManagementNav.tsx, MyTeamsCard.tsx, MyVendorBoothsCard.tsx,
 * vendor-booths.tsx) already points to the new page -- this route is kept
 * (not deleted) purely so an old bookmark or link lands on a working
 * register instead of the broken Terminal-only checkout. (2026-09-13)
 */

import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { hubId } = context.params || {};

  if (!hubId || typeof hubId !== 'string') {
    return { redirect: { destination: '/organizer/hubs', permanent: false } };
  }

  return {
    redirect: {
      destination: `/organizer/pos?venue=${encodeURIComponent(hubId)}`,
      permanent: false,
    },
  };
};

export default function BoothCartRedirect() {
  return null;
}
