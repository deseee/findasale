// Permanent redirect — canonical pricing/subscription page is /organizer/subscription (S491)
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/organizer/subscription',
      permanent: true,
    },
  };
};

export default function OrganizerPricingRedirect() {
  return null;
}
