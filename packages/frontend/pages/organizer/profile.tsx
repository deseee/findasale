import type { GetServerSideProps } from 'next';

/**
 * /organizer/profile — redirects to /organizer/settings
 * D-012: Profile management consolidated to Settings page.
 * This page is preserved (not deleted) so existing links continue to work.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/organizer/settings',
      permanent: false,
    },
  };
};

export default function OrganizerProfile() {
  return null;
}
