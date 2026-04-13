import type { GetServerSideProps } from 'next';

/**
 * /organizer/premium — redirects to /organizer/subscription
 * D-012: All subscription management consolidated to /organizer/subscription.
 * This page is preserved (not deleted) so existing links continue to work.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/organizer/subscription',
      permanent: false,
    },
  };
};

export default function OrganizerPremium() {
  return null;
}
