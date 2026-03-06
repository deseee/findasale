/**
 * Utility functions for CSV export
 */

export interface ExportableItem {
  id: string;
  title: string;
  category?: string | null;
  condition?: string | null;
  price?: number | null;
  status: string;
}

/**
 * Generate CSV content from items array
 */
export const generateCSV = (items: ExportableItem[], saleName?: string): string => {
  const headers = ['ID', 'Title', 'Category', 'Condition', 'Price', 'Status'];
  const csvHeaders = headers.join(',');

  const csvRows = items.map((item) => {
    const escapeCsvField = (field: string | null | undefined): string => {
      if (!field) return '';
      const fieldStr = String(field);
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (fieldStr.includes(',') || fieldStr.includes('\n') || fieldStr.includes('"')) {
        return `"${fieldStr.replace(/"/g, '""')}"`;
      }
      return fieldStr;
    };

    return [
      escapeCsvField(item.id),
      escapeCsvField(item.title),
      escapeCsvField(item.category),
      escapeCsvField(item.condition),
      item.price ? item.price.toFixed(2) : '',
      escapeCsvField(item.status),
    ].join(',');
  });

  return [csvHeaders, ...csvRows].join('\n');
};

/**
 * Download CSV file
 */
export const downloadCSV = (csvContent: string, filename: string): void => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export items to CSV file
 */
export const exportItemsToCSV = (items: ExportableItem[], saleName: string = 'items'): void => {
  const csvContent = generateCSV(items, saleName);
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${saleName}-${timestamp}.csv`;
  downloadCSV(csvContent, filename);
};
