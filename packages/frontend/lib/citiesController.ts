/**
 * citiesController.ts — ADR-074: Metro Sync data retrieval
 *
 * Frontend API calls to fetch top finds for city pages.
 */

interface MetroTopFind {
  id: string;
  citySlug: string;
  metro: string;
  itemTitle: string;
  itemCategory?: string;
  soldPrice: number;
  imageUrl?: string;
  ebayListingId: string;
  soldAt: string;
  updatedAt: string;
}

/**
 * Fetch the top 12 sold items for a specific city.
 * Called by city page getStaticProps or getServerSideProps.
 */
export async function getMetroTopFinds(citySlug: string): Promise<MetroTopFind[]> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/cities/${citySlug}/top-finds`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Cache for 1 hour in production
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) {
      console.error(
        `[citiesController] Failed to fetch top finds for ${citySlug}: ${response.status}`
      );
      return [];
    }

    const data = await response.json() as { finds?: MetroTopFind[] };
    return data.finds || [];
  } catch (error) {
    console.error(`[citiesController] Error fetching top finds for ${citySlug}:`, error);
    return [];
  }
}
