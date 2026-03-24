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
PRODID:-//FindA.Sale//Estate Sales//EN
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
      className="px-6 py-3 rounded-lg font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200 transition flex items-center gap-2"
    >
      📆 Add to Calendar
    </button>
  );
};

export default AddToCalendarButton;
