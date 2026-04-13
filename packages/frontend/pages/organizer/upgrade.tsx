import type { GetServerSideProps } from 'next';

/**
 * /organizer/upgrade — redirects to /pricing
 * D-012: All plan upgrade flows consolidated to /pricing.
 * This page is preserved (not deleted) so existing links continue to work.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/pricing',
      permanent: false,
    },
  };
};

export default function OrganizerUpgrade() {
  return null;
}
