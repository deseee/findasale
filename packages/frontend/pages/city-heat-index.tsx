/**
 * Feature #49: City Heat Index
 *
 * Page: /city-heat-index
 * - Server-side 301 redirect to /cities (the canonical URL).
 * - Previous implementation used useEffect + router.push, which returns null
 *   to crawlers and cannot be followed by Google — causing the page to sit
 *   permanently in the "Discovered - currently not indexed" bucket.
 */

import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/cities',
      permanent: true, // HTTP 301 — passes PageRank to /cities
    },
  };
};

// Component never renders — redirect fires server-side before hydration.
const CityHeatIndexPage = () => null;
export default CityHeatIndexPage;
