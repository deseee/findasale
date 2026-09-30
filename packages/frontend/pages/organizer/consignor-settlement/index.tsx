/**
 * Consignor payouts across every sale ("organizer settles" ledger).
 *
 * Shows everything still owed to consignors, no matter which sale it came from. The organizer pays
 * consignors themselves and records each payment here; FindA.Sale never sends or holds money.
 * TEAMS only: below TEAMS this renders a static locked placeholder and makes no requests.
 */

import React from 'react';
import Head from 'next/head';
import ConsignorPayoutsView from '../../../components/consignor-payouts/ConsignorPayoutsView';

const ConsignorPayoutsIndexPage: React.FC = () => (
  <>
    <Head>
      <title>Consignor payouts | FindA.Sale</title>
    </Head>
    <ConsignorPayoutsView />
  </>
);

export default ConsignorPayoutsIndexPage;
