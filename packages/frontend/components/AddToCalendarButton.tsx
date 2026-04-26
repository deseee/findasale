import React from 'react';
import { format, parseISO } from 'date-fns';
import { useToast } from './ToastContext';

interface AddToCalendarButtonProps {
  saleId: string;
  title: string;
  startDate: string; // ISO string
  endDate: string; // ISO string
  address: string;
  city: string;
  state: string;
  description?: string;
}

const AddToCalendarButton: React.FC<AddToCalendarButtonProps> = ({
  saleId,
  title,
  startDate,
  endDate,
  address,
  city,
  state,
  description,
}) => {
  const { showToast } = useToast();

  const generateICS = () => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    // Format dates as YYYYMMDDTHHMMSSZ
    const formatDate = (date: Date) => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
    };

    const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://finda.sale';
    const location = `${address}, ${city}, ${state}`;
    const eventDescription = description ? `${description}\n\nView at ${siteUrl}/sales/${saleId}` : `View at ${siteUrl}/sales/${saleId}`;

    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//FindA.Sale//Sales//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${saleId}@finda.sale
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(start)}
DTEND:${formatDate(end)}
SUMMARY:${title}
DESCRIPTION:${eventDescription}
LOCATION:${location}
URL:${siteUrl}/sales/${saleId}
END:VEVENT
END:VCALENDAR`;

    return ics;
  };

  const handleDownloadICS = () => {
    try {
      const ics = generateICS();
      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics));
      element.setAttribute('download', `${title.replace(/\s+/g, '-')}-${saleId}.ics`);
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      showToast('Calendar event downloaded!', 'success');
    } catch (error) {
      console.error('Calendar download error:', error);
      showToast('Failed to download calendar event', 'error');
    }
  };

  return (
    <button
      onClick={handleDownloadICS}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium text-sm transition-colors"
    >
      📆 Add to Calendar
    </button>
  );
};

export default AddToCalendarButton;
