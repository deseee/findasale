import { useState } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { prisma } from '../../../packages/database';

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
  items: Array<{ id: string; title: string; category: string }>;
  organizer: {
    id: string;
    businessName: string;
    badges: Array<{ name: string; rating: number }>;
  };
}

interface SaleDetailProps {
  sale: Sale;
}

export default function SaleDetailPage({ sale }: SaleDetailProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const filteredItems = selectedCategory
    ? sale.items.filter((item) => item.category === selectedCategory)
    : sale.items;

  // JSON-LD schema markup
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: sale.title,
    description: sale.description,
    startDate: sale.startDate,
    endDate: sale.endDate,
    location: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: sale.address,
        addressLocality: sale.city,
        addressRegion: sale.state,
        postalCode: sale.zip,
      },
    },
    organizer: {
      '@type': 'Organization',
      name: sale.organizer.businessName,
    },
  };

  return (
    <>
      <Head>
        <title>{sale.title} — FindA.Sale</title>
        <meta name="description" content={sale.description} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{sale.title}</h1>
          <p className="text-gray-600 mb-4">{sale.description}</p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-500">Start Date</p>
              <p className="text-lg font-semibold">{new Date(sale.startDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">End Date</p>
              <p className="text-lg font-semibold">{new Date(sale.endDate).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-2">Location</h3>
            <p className="text-gray-600">
              {sale.address}, {sale.city}, {sale.state} {sale.zip}
            </p>
          </div>
        </div>

        {/* Organizer Badges and Ratings */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-3">Organizer: {sale.organizer.businessName}</h3>
          <div className="flex flex-wrap gap-2">
            {sale.organizer.badges.map((badge) => (
              <div key={badge.name} className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">
                {badge.name} ({badge.rating})
              </div>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-3">Items</h3>
          <div className="mb-4">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {Array.from(new Set(sale.items.map((i) => i.category))).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item) => (
              <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900">{item.title}</h4>
                <p className="text-sm text-gray-500 mt-1">{item.category}</p>
                <button className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                  Buy Now / Bid
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<SaleDetailProps> = async ({ params }) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: params?.id as string },
      include: {
        items: true,
        organizer: {
          include: { badges: true },
        },
      },
    });

    if (!sale) {
      return { notFound: true };
    }

    return {
      props: {
        sale: {
          ...sale,
          startDate: sale.startDate.toISOString(),
          endDate: sale.endDate.toISOString(),
        },
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching sale:', error);
    return { notFound: true };
  }
};
