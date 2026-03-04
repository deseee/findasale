import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { prisma } from '../../../packages/database';
import SaleCard from '../../components/SaleCard';

interface Sale {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  photoUrls: string[];
  organizer: {
    businessName: string;
  };
}

interface CityPageProps {
  city: string;
  sales: Sale[];
}

export default function CityPage({ city, sales }: CityPageProps) {
  // JSON-LD breadcrumb schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://finda.sale',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: city,
        item: `https://finda.sale/city/${city}`,
      },
    ],
  };

  return (
    <>
      <Head>
        <title>Estate Sales in {city} — FindA.Sale</title>
        <meta name="description" content={`Find estate sales happening in ${city} on FindA.Sale.`} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Estate Sales in {city}</h1>

        {sales.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No sales currently scheduled in {city}.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sales.map((sale) => (
              <SaleCard key={sale.id} sale={sale} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<CityPageProps> = async ({ params }) => {
  try {
    const city = params?.city as string;

    const sales = await prisma.sale.findMany({
      where: {
        city: { equals: city, mode: 'insensitive' },
        status: 'PUBLISHED',
      },
      include: {
        organizer: {
          select: { businessName: true },
        },
      },
    });

    return {
      props: {
        city,
        sales: sales.map((s) => ({
          ...s,
          startDate: s.startDate.toISOString(),
          endDate: s.endDate.toISOString(),
        })),
      },
      revalidate: 3600,
    };
  } catch (error) {
    console.error('Error fetching sales for city:', error);
    return { notFound: true };
  }
};
