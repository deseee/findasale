/**
 * Upload type rules for the card intake (ADR-134 section 11): CSV, TSV and TXT only. XLSX is NOT accepted in
 * v1 because the exports from all four supported sources are CSV; a renamed workbook is also caught by the
 * binary check in parseSpreadsheet.ts.
 */
export const ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = ['.csv', '.tsv', '.txt'];

/** Browsers report CSV files under several types; octet-stream is what some send for .tsv. */
export const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
  'text/csv',
  'text/tab-separated-values',
  'text/plain',
  'text/x-csv',
  'application/csv',
  'application/x-csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
];
