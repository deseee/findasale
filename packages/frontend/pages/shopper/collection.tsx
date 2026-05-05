import type { GetServerSideProps } from 'next';

/**
 * /shopper/collection — redirects to /shopper/explorer-profile
 * Collector passport / collection content lives on the Explorer Profile page
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/shopper/explorer-profile',
      permanent: false,
    },
  };
};

export default function ShopperCollectionRedirect() {
  return null;
}
