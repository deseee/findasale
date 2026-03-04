import { useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';

/**
 * Affiliate link handler page.
 * Tracks the click via backend, stores the affiliateLinkId in sessionStorage
 * for checkout attribution, then redirects to the sale page.
 */
const AffiliatePage = () => {
  const router = useRouter();
  const { id } = router.query;

  useEffect(() => {
    if (!id || typeof id !== 'string') return;

    api.get(`/affiliate/click/${id}`)
      .then(res => {
        const { saleId } = res.data;
        // Store for checkout attribution — passed to createPaymentIntent
        sessionStorage.setItem('affiliateRef', id);
        router.replace(`/sales/${saleId}`);
      })
      .catch(() => {
        router.replace('/');
      });
  }, [id]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500 text-sm">Redirecting…</p>
    </div>
  );
};

export default AffiliatePage;
