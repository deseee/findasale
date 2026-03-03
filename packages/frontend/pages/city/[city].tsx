import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetServerSideProps } from 'next';
import api from '../../lib/api';
import { format } from 'date-fns';

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
  formattedCity: string;
}

const CityPage: React.FC<CityPageProps> = ({ city, sales, formattedCity }) => {
  // Format dates safely
  const formatSaleDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'TBA';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Generate JSON-LD for schema.org structured data
  const generateJsonLd = () => {
    const siteUrl = 'https://finda.sale';
    const citySlug = city;

    const itemListData = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": `Estate Sales in ${formattedCity}`,
      "description": `Find estate sales and auctions in ${formattedCity}`,
      "url": `${siteUrl}/city/${citySlug}`,
      "numberOfItems": sales.length,
      "itemListElement": sales.map((sale, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": "Event",
          "name": sale.title,
          "url": `${siteUrl}/sales/${sale.id}`,
          "startDate": sale.startDate,
          "endDate": sale.endDate,
          "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
          "eventStatus": "https://schema.org/EventScheduled",
          "image": sale.photoUrls && sale.photoUrls.length > 0 ? [sale.photoUrls[0]] : undefined,
          "location": {
            "@type": "Place",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": sale.address,
              "addressLocality": sale.city,
              "addressRegion": sale.state,
              "postalCode": sale.zip,
              "addressCountry": "US"
            }
          },
          "organizer": {
            "@type": "Organization",
            "name": sale.organizer.businessName
          }
        }
      }))
    };

    const breadcrumbData = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": siteUrl },
        { "@type": "ListItem", "position": 2, "name": `Estate Sales in ${formattedCity}`, "item": `${siteUrl}/city/${citySlug}` }
      ]
    };

    return { itemList: JSON.stringify(itemListData), breadcrumb: JSON.stringify(breadcrumbData) };
  };

  const jsonLd = generateJsonLd();

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Estate Sales in {formattedCity} | FindA.Sale</title>
        <meta 
          name="description" 
          content={`Find the best estate sales and auctions happening in ${formattedCity}. Browse listings, items, and locations.`} 
        />
        
        {/* Open Graph Meta Tags */}
        <meta property="og:title" content={`Estate Sales in ${formattedCity} | FindA.Sale`} />
        <meta 
          property="og:description" 
          content={`Find the best estate sales and auctions happening in ${formattedCity}. Browse listings, items, and locations.`} 
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://finda.sale/city/${city}`} />
        
        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`Estate Sales in ${formattedCity} | FindA.Sale`} />
        <meta 
          name="twitter:description" 
          content={`Find the best estate sales and auctions happening in ${formattedCity}. Browse listings, items, and locations.`} 
        />
        
        {/* JSON-LD Structured Data */}
        {jsonLd && (
          <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd.itemList }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd.breadcrumb }} />
          </>
        )}
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Estate Sales in {formattedCity}</h1>
          <p className="text-gray-600">
            Discover the best estate sales, garage sales, and auctions happening in {formattedCity}
          </p>
        </div>

        {/* Map Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Sales Map</h2>
          <div className="h-96 bg-gray-200 rounded-lg flex items-center justify-center">
            <p className="text-gray-600">Interactive map showing sales locations in {formattedCity}</p>
          </div>
        </div>

        {/* Upcoming Sales Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">Upcoming Sales in {formattedCity}</h2>
          
          {sales.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">No upcoming sales in {formattedCity} at the moment.</p>
              <Link 
                href="/" 
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
              >
                Browse All Sales
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sales.map((sale) => (
                <Link href={`/sales/${sale.id}`} key={sale.id} className="block">
                  <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                    {sale.photoUrls && sale.photoUrls.length > 0 ? (
                      <img 
                        src={sale.photoUrls[0]} 
                        alt={sale.title}
                        className="w-full h-48 object-cover"
                      />
                    ) : (
                      <div className="bg-gray-200 h-48 flex items-center justify-center">
                        <span className="text-gray-500">No image available</span>
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="text-xl font-semibold mb-2 text-gray-900">{sale.title}</h3>
                      <p className="text-gray-600 mb-2">{sale.description}</p>
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-sm text-gray-500">
                          {formatSaleDate(sale.startDate)} - {formatSaleDate(sale.endDate)}
                        </span>
                        <span className="text-sm font-medium text-blue-600">
                          {sale.organizer.businessName}
                        </span>
                      </div>
                      <div className="mt-3 text-sm text-gray-500">
                        {sale.city}, {sale.state}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { city } = context.params as { city: string };
  
  // Format city name (convert kebab-case to Title Case)
  const formattedCity = city
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  try {
    // Fetch sales for this city
    const response = await api.get(`/sales?city=${formattedCity}`);
    const sales = response.data.sales || response.data;

    // Filter to ensure we only get sales for this specific city
    const citySales = Array.isArray(sales) 
      ? sales.filter(sale => 
          sale.city.toLowerCase() === formattedCity.toLowerCase()
        )
      : [];

    return {
      props: {
        city,
        sales: citySales,
        formattedCity,
      },
    };
  } catch (error) {
    console.error('Error fetching city sales:', error);
    return {
      props: {
        city,
        sales: [],
        formattedCity,
      },
    };
  }
};

export default CityPage;
