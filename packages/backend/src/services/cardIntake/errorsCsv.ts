/**
 * errors.csv support (ADR-134 section 4.5 step 7 and section 11). Every cell goes through utils/csvSafe
 * csvCell, so a value that starts with = + - or @ (or a tab or carriage return) cannot run as a formula when the
 * file is opened in a spreadsheet. The server renders each line so the browser only has to join them:
 * csv = header + "\n" + lines.join("\n").
 */
import { csvCell } from '../../utils/csvSafe';
import type { SourceRecord } from './types';

export const ERROR_COLUMN_NAME = 'FindASale Error';

/** Original columns plus the error column, as one CSV line (no trailing newline). */
export function errorsCsvHeader(headers: readonly string[]): string {
  return [...headers, ERROR_COLUMN_NAME].map(csvCell).join(',');
}

export function errorsCsvLine(headers: readonly string[], source: SourceRecord, message: string): string {
  return [...headers.map((h) => source[h] ?? ''), message].map(csvCell).join(',');
}
