import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { prisma } from '../../../packages/database';

interface Organizer {
  id: string;
  businessName: string;
  email: string;
  phone?: string;
  upcomingSales: Array<{ id: string; title: string; startDate: string }>;
  pastSales: Array<{ id: string; title: string; endDate: string }>;
  badges: Array<{ name: string; icon: string }>;
}

interface OrganizerProfileProps {
  organizer: Organizer;
}

export default function OrganizerProfilePage({ organizer }: OrganizerProfileProps) {
  return (
    <>
      <Head>
        <title>{organizer.businessName} — FindA.Sale</title>
        <meta name="description" content={`View estate sales by ${organizer.businessName}`} />
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{organizer.businessName}</h1>
          <p className="text-gray-600 mb-4">Email: {organizer.email}</p>
          {organizer.phone && <p className="text-gray-600 mb-4">Phone: {organizer.phone}</p>}

          <div className="mt-4">
            <h3 className="font-semibold text-gray-900 mb-2">Badges</h3>
            <div className="flex flex-wrap gap-2">
              {organizer.badges.map((badge) => (
                <div key={badge.name} className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                  <span>{badge.icon}</span>
                  <span>{badge.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">Upcoming Sales</h2>
            {organizer.upcomingSales.length === 0 ? (
              <p className="text-gray-500">No upcoming sales.</p>
            ) : (
              <ul className="space-y-2">
                {organizer.upcomingSales.map((sale) => (
                  <li key={sale.id}>
                    <Link href={`/sales/${sale.id}`} className="text-blue-600 hover:underline">
                      {sale.title}
                    </Link>
                    <p className="text-sm text-gray-500">Starting {new Date(sale.startDate).toLocaleDateString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">Past Sales</h2>
            {organizer.pastSales.length === 0 ? (
              <p className="text-gray-500">No past sales.</p>
            ) : (
              <ul className="space-y-2">
                {organizer.pastSales.map((sale) => (
                  <li key={sale.id}>
                    <Link href={`/sales/${sale.id}`} className="text-blue-600 hover:underline">
                      {sale.title}
                    </Link>
                    <p className="text-sm text-gray-500">Ended {new Date(sale.endDate).toLocaleDateString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<OrganizerProfileProps> = async ({ params }) => {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: params?.id as string },
      include: {
        user: true,
        sales: {
          where: { status: 'PUBLISHED' },
          orderBy: { startDate: 'desc' },
        },
        badges: true,
      },
    });

    if (!organizer) {
      return { notFound: true };
    }

    const now = new Date();
    const upcoming = organizer.sales.filter((s) => new Date(s.startDate) > now);
    const past = organizer.sales.filter((s) => new Date(s.startDate) <= now);

    return {
      props: {
        organizer: {
          id: organizer.id,
          businessName: organizer.businessName,
          email: organizer.user.email,
          phone: organizer.phone,
          upcomingSales: upcoming.map((s) => ({
            id: s.id,
            title: s.title,
            startDate: s.startDate.toISOString(),
          })),
          pastSales: past.map((s) => ({
            id: s.id,
            title: s.title,
            endDate: s.endDate.toISOString(),
          })),
          badges: organizer.badges,
        },
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching organizer:', error);
    return { notFound: true };
  }
};
