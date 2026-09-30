/**
 * Consignor payouts for one sale ("organizer settles" ledger).
 *
 * The organizer pays consignors themselves (cash, check, Square, bank transfer, other) and records
 * each payment here. FindA.Sale keeps the numbers and the paper trail and never sends or holds money.
 *
 * All behavior lives in components/consignor-payouts/ConsignorPayoutsView so the "all sales" page
 * (index.tsx) and this page cannot drift apart. TEAMS only: below TEAMS the view renders a static
 * locked placeholder and makes no requests.
 */

import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import ConsignorPayoutsView from '../../../components/consignor-payouts/ConsignorPayoutsView';

const ConsignorSettlementSalePage: React.FC = () => {
  const router = useRouter();
  const { saleId } = router.query;

  return (
    <>
      <Head>
        <title>Consignor payouts | FindA.Sale</title>
      </Head>
      {router.isReady && typeof saleId === 'string' ? (
        <ConsignorPayoutsView saleId={saleId} />
      ) : (
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
          <p className="text-warm-600 dark:text-warm-400">Loading...</p>
        </div>
      )}
    </>
  );
};

export default ConsignorSettlementSalePage;
