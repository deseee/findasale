// /organizer/pricing redirects to canonical /pricing (S492 — corrected S491 mistake)
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/pricing',
      permanent: true,
    },
  };
};

export default function OrganizerPricingRedirect() {
  return null;
}
