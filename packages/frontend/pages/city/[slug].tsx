import { GetStaticProps, GetStaticPaths } from 'next';
import Head from 'next/head';
import { getCityFromSlug, getAllCitySlugs, getNearestCities, getTopCategoriesForCity } from '@/lib/city-slugs';
import { generateCityTip } from '@/lib/city-tips-generator';
import { markdownToHtml } from '@/lib/markdown-to-html';
import { getMetroTopFinds } from '@/lib/citiesController';
import { CityHero } from '@/components/CityHero';
import { CityTopFinds } from '@/components/CityTopFinds';
import { CityRecentSales } from '@/components/CityRecentSales';
import { CityTipsBlock } from '@/components/CityTipsBlock';
import { CityNearbyLinks } from '@/components/CityNearbyLinks';

interface CityPageProps {
  slug: string;
  cityName: string;
  cityState: string;
  population: number;
  lat: number;
  lng: number;
  zipCodes: string[];
  topFinds: any[];
  recentSales: any[];
  tipContent: string;
  nearbyCities: any[];
  topCategories: string[];
  activeSalesCount: number;
  totalItemsCount: number;
  lastUpdated: string;
}

export default function CityPage(props: CityPageProps) {
  const {
    cityName,
    cityState,
    population,
    topFinds,
    recentSales,
    tipContent,
    nearbyCities,
    topCategories,
    activeSalesCount,
    totalItemsCount,
    lastUpdated,
    slug,
  } = props;

  const title = `Sales & Auctions in ${cityName}, ${cityState} | FindA.Sale`;
  const description = `Find upcoming estate sales, yard sales, auctions, and garage sales in ${cityName}—real prices, real discounts, real items. Browse furniture, vintage, collectibles & more.`;
  const url = `https://finda.sale/city/${slug}`;
  const imageUrl = `https://finda.sale/api/og?city=${cityName}&state=${cityState}`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={`estate sales ${cityName} ${cityState}, yard sales, garage sales, auctions, antiques, vintage furniture`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />
        <link rel="canonical" href={url} />
        <meta name="robots" content="index, follow" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {/* Schema.org structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: `Top Finds in ${cityName}, ${cityState}`,
              description: `This week's best-valued items from sales and auctions in ${cityName}.`,
              itemListElement: topFinds.slice(0, 5).map((item, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                item: {
                  '@type': 'Product',
                  name: item.title,
                  image: item.photoUrl,
                  offers: {
                    '@type': 'Offer',
                    price: item.actualPrice.toString(),
                    priceCurrency: 'USD',
                  },
                },
              })),
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Place',
              name: `${cityName}, ${cityState}`,
              geo: {
                '@type': 'GeoCoordinates',
                latitude: props.lat.toString(),
                longitude: props.lng.toString(),
              },
            }),
          }}
        />
      </Head>

      <main className="min-h-screen bg-white dark:bg-slate-900">
        <CityHero
          city={{
            name: cityName,
            state: cityState,
            slug,
            population,
            lat: props.lat,
            lng: props.lng,
            zipCodes: props.zipCodes,
          }}
          activeSalesCount={activeSalesCount}
          totalItemsCount={totalItemsCount}
          lastUpdated={new Date(lastUpdated)}
        />

        <CityTopFinds citySlug={slug} items={topFinds} />
        <CityRecentSales citySlug={slug} sales={recentSales} />
        <CityTipsBlock
          tipContent={tipContent}
          cityName={cityName}
          cityState={cityState}
        />
        <CityNearbyLinks
          currentCity={{
            name: cityName,
            state: cityState,
            slug,
            population: props.population,
            lat: props.lat,
            lng: props.lng,
            zipCodes: props.zipCodes,
          }}
          nearbyCities={nearbyCities}
          topCategories={topCategories}
        />
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const slugs = getAllCitySlugs();

  // Prerender top 20 cities; remaining cities use fallback: 'blocking'
  const topCitySlugs = slugs.slice(0, 20);

  return {
    paths: topCitySlugs.map((slug) => ({ params: { slug } })),
    fallback: 'blocking', // All other cities (3K - 20 = ~2,980) render on-demand
  };
};

export const getStaticProps: GetStaticProps<CityPageProps> = async ({
  params,
}) => {
  const slug = params?.slug as string;

  let city = getCityFromSlug(slug);
  if (!city) {
    // Slug may be for a scraped city not in us-cities-3000.json (e.g. 'nashville-tn').
    // Parse city name and state from the slug rather than 404ing.
    const parts = slug.split('-');
    const stateCode = parts[parts.length - 1].toUpperCase();
    const cityName = parts.slice(0, -1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    if (parts.length < 2 || stateCode.length !== 2) {
      return { notFound: true };
    }
    city = { name: cityName, state: stateCode, slug, population: 0, lat: 0, lng: 0, zipCodes: [] };
  }

  // ADR-074: Fetch real eBay sold items from MetroTopFinds table
  const metroFinds = await getMetroTopFinds(slug);

  // Transform MetroTopFinds into component format (map eBay data to item structure)
  const topFinds = metroFinds.map((find) => ({
    id: find.id,
    title: find.itemTitle,
    category: find.itemCategory,
    actualPrice: parseFloat(find.soldPrice.toString()),
    photoUrl: find.imageUrl,
    soldAt: new Date(find.soldAt),
  }));

  // For future expansion: fetch recent sales from FindA.Sale database
  const recentSales: any[] = [];

  // Auto-generate tip using template
  const regionType = city.state === 'MI' ? 'midwest' : 'western'; // Simplified for MVP
  const tipMarkdown = generateCityTip({
    cityName: city.name,
    state: city.state,
    population: city.population,
    topCategories: getTopCategoriesForCity(slug),
    regionType,
  });
  const tipContent = markdownToHtml(tipMarkdown);

  const nearbyCities = getNearestCities(slug, 5);
  const topCategories = getTopCategoriesForCity(slug);

  return {
    props: {
      slug,
      cityName: city.name,
      cityState: city.state,
      population: city.population,
      lat: city.lat,
      lng: city.lng,
      zipCodes: city.zipCodes,
      topFinds,
      recentSales,
      tipContent,
      nearbyCities,
      topCategories,
      activeSalesCount: 0,
      totalItemsCount: 0,
      lastUpdated: new Date().toISOString(),
    },
    revalidate: 86400, // Revalidate every 24 hours (ISR)
  };
};
