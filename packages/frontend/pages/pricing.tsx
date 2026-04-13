import type { GetServerSideProps } from 'next';

/**
 * /pricing — redirects to /organizer/pricing
 * Q3 Premium/Subscription Page Consolidation:
 * All pricing discovery consolidated to /organizer/pricing.
 * This page is preserved (not deleted) so existing links continue to work.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/organizer/pricing',
      permanent: false,
    },
  };
};

export default function PricingPage() {
  return null;
}
