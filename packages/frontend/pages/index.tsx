import { useState, useMemo } from 'react';
import Head from 'next/head';
import { GetServerSideProps } from 'next';
import { prisma } from '../../../packages/database';
import SaleCard from '../components/SaleCard';
import SaleMapInner from '../components/SaleMapInner';

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

interface HomeProps {
  sales: Sale[];
}

export default function Home({ sales }: HomeProps) {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  // H4: Weekend calculation logic
  const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchesSearch =
        sale.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.city.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDate = !selectedDate || sale.startDate.includes(selectedDate);

      return matchesSearch && matchesDate;
    });
  }, [sales, searchTerm, selectedDate]);

  return (
    <>
      <Head>
        <title>Estate Sales | FindA.Sale</title>
        <meta name="description" content="Find and bid on estate sales in your area." />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Search Bar */}
        <div className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex gap-4 flex-wrap">
              <input
                type="text"
                placeholder="Search sales..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-4 py-2 rounded-lg ${
                    viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={`px-4 py-2 rounded-lg ${
                    viewMode === 'map'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700'
                  }`}
                >
                  Map
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSales.map((sale) => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          ) : (
            <div className="h-screen">
              <SaleMapInner sales={filteredSales} />
            </div>
          )}

          {filteredSales.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No sales found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async () => {
  try {
    const sales = await prisma.sale.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        organizer: {
          select: { businessName: true },
        },
      },
      take: 100,
    });

    return {
      props: {
        sales: sales.map((s) => ({
          ...s,
          startDate: s.startDate.toISOString(),
          endDate: s.endDate.toISOString(),
        })),
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching sales:', error);
    return {
      props: { sales: [] },
      revalidate: 10,
    };
  }
};
