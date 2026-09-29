import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';

/**
 * Smart redirect: /organizer/add-items (no saleId) -> the right place to add items.
 * The working route is /organizer/add-items/[saleId]; this page handles links that have no
 * sale in hand (insights, print-inventory, DemandSignalsCard and stale bookmarks).
 *
 *  - exactly one DRAFT or PUBLISHED sale -> /organizer/add-items/[thatSaleId]
 *  - anything else (none, or several, or the sales list failed to load) -> /organizer/sales
 *    so the organizer picks which sale to add items to
 *  - not logged in -> /login (comes back here afterwards)
 *  - logged in without the organizer role -> /organizer/dashboard (which owns that bounce)
 *
 * Same API and query key as the dashboard (GET /sales/mine, ['organizer-sales', user.id]),
 * so the sales list is usually already cached. Nothing redirects until auth and the sales
 * list have both settled, so the wrong page never flashes.
 */
interface SaleSummary {
  id: string;
  status: string;
}

const AddItemsRedirect = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const hasRedirected = useRef(false);

  const isOrganizer =
    !!user && (!!user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER' || user.role === 'ADMIN');

  const {
    data: salesData,
    isLoading: salesLoading,
    isError: salesError,
  } = useQuery<SaleSummary[]>({
    queryKey: ['organizer-sales', user?.id],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return response.data.sales || [];
    },
    enabled: !!user?.id && isOrganizer,
  });

  useEffect(() => {
    if (hasRedirected.current || authLoading) return;

    let target: string | null = null;
    if (!user) {
      target = '/login?redirect=/organizer/add-items';
    } else if (!isOrganizer) {
      target = '/organizer/dashboard';
    } else if (salesError) {
      target = '/organizer/sales';
    } else if (!salesLoading && salesData) {
      const openSales = salesData.filter((s) => s.status === 'DRAFT' || s.status === 'PUBLISHED');
      target = openSales.length === 1 ? `/organizer/add-items/${openSales[0].id}` : '/organizer/sales';
    }

    if (target) {
      hasRedirected.current = true;
      router.replace(target);
    }
  }, [authLoading, user, isOrganizer, salesLoading, salesError, salesData, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
      <p role="status" className="text-warm-600 dark:text-gray-400">Taking you to your sale...</p>
    </div>
  );
};

export default AddItemsRedirect;
