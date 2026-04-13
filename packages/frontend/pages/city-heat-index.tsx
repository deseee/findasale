/**
 * Feature #49: City Heat Index
 *
 * Page: /city-heat-index
 * - Redirects to /cities
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

const CityHeatIndexPage = () => {
  const router = useRouter();

  useEffect(() => {
    router.push('/cities');
  }, [router]);

  return null;
};

export default CityHeatIndexPage;
