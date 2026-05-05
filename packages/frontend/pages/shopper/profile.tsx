import type { GetServerSideProps } from 'next';

/**
 * /shopper/profile — redirects to /shopper/explorer-profile
 * Explorer Profile is the canonical shopper profile page (consolidated S528)
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/shopper/explorer-profile',
      permanent: false,
    },
  };
};

export default function ShopperProfileRedirect() {
  return null;
}
