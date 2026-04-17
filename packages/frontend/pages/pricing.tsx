// Canonical pricing/subscription page is /organizer/subscription (S491)
// Both /pricing and /organizer/pricing redirect there.
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/organizer/subscription',
      permanent: true,
    },
  };
};

export default function PricingRedirect() {
  return null;
}
