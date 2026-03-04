import React from 'react';
import Link from 'next/link';
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
    id: string;
    businessName: string;
  };
}

interface SaleCardProps {
  sale: Sale;
}

const SaleCard: React.FC<SaleCardProps> = ({ sale }) => {
  const [imgError, setImgError] = React.useState(false);

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

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      <Link href={`/sales/${sale.id}`} className="block">
        {sale.photoUrls && sale.photoUrls.length > 0 && !imgError ? (
          <img
            src={sale.photoUrls[0]}
            alt={sale.title}
            className="w-full h-48 object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="bg-gray-200 h-48 flex items-center justify-center">
            <img
              src="/images/placeholder.svg"
              alt="Placeholder"
              className="w-16 h-16 text-gray-400"
              loading="lazy"
            />
          </div>
        )}
        <div className="p-4">
          <h3 className="text-xl font-semibold mb-2 text-gray-900">{sale.title}</h3>
          <p className="text-gray-600 mb-2 line-clamp-2">{sale.description}</p>
          <div className="flex justify-between items-center mt-4">
            <span className="text-sm text-gray-500">
              {formatSaleDate(sale.startDate)} – {formatSaleDate(sale.endDate)}
            </span>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {sale.city}, {sale.state}
          </div>
        </div>
      </Link>
      <div className="px-4 pb-4">
        <Link
          href={`/organizers/${sale.organizer.id}`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          {sale.organizer.businessName}
        </Link>
      </div>
    </div>
  );
};

export default SaleCard;
