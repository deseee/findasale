/**
 * Barcode Controller
 *
 * POST /api/barcode/lookup
 * Organizer scans a product barcode → eBay Catalog enrichment → prefill form fields.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { lookupByBarcode, EbayCatalogResult } from '../services/ebayCatalogLookup';

// Numeric barcodes: UPC-A (12), EAN-13 (13), EAN-8 (8), ISBN-13 (13), ISBN-10 (10)
const NUMERIC_CODE_TYPES = new Set([
  'UPC', 'UPC_A', 'UPC-A', 'UPC_E', 'UPC-E',
  'EAN', 'EAN_13', 'EAN-13', 'EAN_8', 'EAN-8',
  'ISBN',
]);

export const lookupBarcode = async (req: AuthRequest, res: Response): Promise<void> => {
  const { code, codeType } = req.body as { code?: string; codeType?: string };

  // ── Input validation ──────────────────────────────────────────────────────
  if (!code || typeof code !== 'string' || !code.trim()) {
    res.status(400).json({ message: 'code is required' });
    return;
  }
  if (!codeType || typeof codeType !== 'string') {
    res.status(400).json({ message: 'codeType is required' });
    return;
  }

  const trimmedCode = code.trim();
  const upperType = codeType.toUpperCase();

  // Numeric barcode types must consist solely of digits
  if (NUMERIC_CODE_TYPES.has(upperType) && !/^\d+$/.test(trimmedCode)) {
    res.status(400).json({ message: `Invalid ${codeType} barcode — expected digits only` });
    return;
  }

  // ── Lookup ────────────────────────────────────────────────────────────────
  let result: EbayCatalogResult | null;
  try {
    result = await lookupByBarcode(trimmedCode, codeType);
  } catch (err: any) {
    console.error('[barcodeController] Lookup error:', err?.message ?? err);
    res.status(500).json({ message: 'Lookup failed — try again or fill in manually' });
    return;
  }

  if (!result) {
    res.status(404).json({ found: false, code: trimmedCode });
    return;
  }

  res.json(result);
};
