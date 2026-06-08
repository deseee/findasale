import type { GetServerSideProps } from 'next';

/**
 * /shopper/collections — redirects to /shopper/wishlist
 * Collections (wishlists) are accessible via the My Wishlist page
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/shopper/wishlist',
      permanent: false,
    },
  };
};

export default function ShopperCollectionsRedirect() {
  return null;
}
