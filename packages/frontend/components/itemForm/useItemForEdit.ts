import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';

/**
 * The item as the editor needs it: GET /items/:id/edit, the organizer-only, ownership-enforced read (S-IDOR-edit-item).
 * The Edit page shell and ItemFormBody both call this with the same key, so they share one request and one cache entry.
 */
export function useItemForEdit(itemId: string | string[] | undefined) {
  return useQuery({
    queryKey: ['item', itemId],
    queryFn: async () => {
      const response = await api.get(`/items/${itemId}/edit`);
      return response.data;
    },
    enabled: !!itemId,
  });
}
