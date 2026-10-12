/**
 * Name agreement between what a photo reading says and what the catalog printing is called (ADR-138 section 3.4).
 * Pure: no database, no I/O. The rule is the same one the catalog lookup uses for names: the normalized names are
 * equal, or the printing name starts with the read name followed by a space ("delver of secrets" agrees with
 * "Delver of Secrets // Insectile Aberration"). A double-faced printing also agrees when the read name equals
 * either face on its own.
 */
import { normalizeCardName } from '../cardCatalog/normalize';

/** True when the read name and the printing name refer to the same card. A blank read name never agrees. */
export function namesAgree(readName: string | null | undefined, printingName: string | null | undefined): boolean {
  const read = normalizeCardName(readName);
  const printing = normalizeCardName(printingName);
  if (read === '' || printing === '') return false;
  if (printing === read || printing.startsWith(`${read} `)) return true;
  const faces = String(printingName ?? '')
    .split('//')
    .map((face) => normalizeCardName(face))
    .filter((face) => face !== '');
  return faces.length > 1 && faces.some((face) => face === read);
}
