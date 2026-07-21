import { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import axios from 'axios';
import { analyzeItemImage, isCloudAIAvailable } from '../services/cloudAIService';
import { findCatalogMatches, buildCatalogMatchContext, isCatalogMatchEnabled } from '../services/imageMatchService';
import { getEbayImageMatch, buildEbayMatchContext } from '../services/ebayImageSearchService';
import { enqueueProcessRapidDraft } from '../jobs/processRapidDraft';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { trackCloudinaryServe } from '../lib/cloudinaryBandwidthTracker';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// P1 SECURITY FIX: MIME type whitelist for image uploads (prevents SVG/HTML injection)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

// P1 SECURITY FIX: Magic bytes validation function (server-side file signature check)
function validateImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
  // HEIC/HEIF: check for 'ftyp' at offset 4
  if (buffer.length > 11 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return true;

  return false;
}

// Multer — memory storage (buffers go straight to Cloudinary, no disk writes)
// P1 SECURITY FIX: Added fileFilter to enforce MIME type whitelist
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, WebP, GIF, HEIC allowed.`));
    }
  },
});

// Debounce AI analysis to allow "+" button usage (multi-photo grouping)
export const rapidfireAIDebounce = new Map<string, ReturnType<typeof setTimeout>>();
export const heldAnalysisItems = new Set<string>(); // Track items where user explicitly held analysis via hold-analysis endpoint
export const RAPIDFIRE_AI_DELAY_MS = 4500; // 4.5s window for user to add more photos via "+"

export function resetRapidDraftDebounce(itemId: string): void {
  // Do NOT restart the debounce if the item is in hold state
  if (heldAnalysisItems.has(itemId)) {
    return; // Item is held; don't reset the timer
  }
  const existingTimer = rapidfireAIDebounce.get(itemId);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    rapidfireAIDebounce.delete(itemId);
    enqueueProcessRapidDraft(itemId);
  }, RAPIDFIRE_AI_DELAY_MS);
  rapidfireAIDebounce.set(itemId, timer);
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';

// ── Cloudinary image variants ─────────────────────────────────────────
// Transformation URLs are generated on-the-fly from the original URL.
// This ensures the public_id is always preserved and URLs remain valid.
interface CloudinaryUrls {
  original: string;
  thumbnail: string;
  optimized: string;
  full: string;
}

// Upload a single buffer to Cloudinary — returns multi-res URLs
// Retry wrapper for Cloudinary 420 rate limit errors (rapid-fire mode fires in bursts)
const uploadToCloudinaryWithRetry = async (buffer: Buffer, folder = 'findasale', maxRetries = 3): Promise<CloudinaryUrls> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await uploadToCloudinary(buffer, folder);
    } catch (err: any) {
      const is420 = err?.http_code === 420 || err?.status === 420;
      if (is420 && attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        console.warn(`[cloudinary] Rate limited (420), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Cloudinary upload failed after max retries');
};

// Also tracks bandwidth usage (#105)
// P1 SECURITY FIX: Validates magic bytes before upload, resource_type restricted to 'image'
const uploadToCloudinary = (buffer: Buffer, folder = 'findasale'): Promise<CloudinaryUrls> =>
  new Promise((resolve, reject) => {
    // P1 SECURITY FIX: Server-side file signature validation (magic bytes check)
    if (!validateImageMagicBytes(buffer)) {
      return reject(new Error('Invalid image file: magic bytes validation failed. File may not be a valid image.'));
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image', // P1 SECURITY FIX: Restrict to 'image' instead of 'auto' to prevent non-image uploads
        folder,
        exif: true, // #324 EXIF PRESERVATION: Retain EXIF metadata (DateTimeOriginal, GPS, etc.) for temporal clustering in batchAnalyzeController
        // Note: aws_rek_tagging removed — requires paid Cloudinary add-on, caused 420 on all uploads
        // Note: not using eager transforms — transformation URLs are generated on-the-fly
        // from the original URL to ensure public_id is always preserved
      },
      async (error, result) => {
        if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));

        // Note: NSFW check via aws_rek_tagging removed (add-on not active — caused 420 on every upload)

        // Track Cloudinary serve for bandwidth monitoring (#105)
        // Use original URL only — avoid eager transformation URLs which may be incomplete
        trackCloudinaryServe(); // original

        const originalUrl = result.secure_url;

        // Helper to insert transformation before /upload/ in the URL
        // NOTE: This logic is duplicated in @findasale/shared → cloudinaryUtils.insertCloudinaryTransform
        // Once shared is properly set up as a workspace dependency, this should be imported from there
        const insertTransform = (url: string, transform: string): string => {
          const uploadIdx = url.indexOf('/upload/');
          if (uploadIdx === -1) return url;
          return url.slice(0, uploadIdx + 8) + transform + '/' + url.slice(uploadIdx + 8);
        };

        resolve({
          original: originalUrl,
          // Generate transformation URLs on-the-fly from original to ensure public_id is preserved
          thumbnail: insertTransform(originalUrl, 'w_200,h_200,c_fill,g_auto,q_60,f_webp'),
          optimized: insertTransform(originalUrl, 'w_800,c_limit,q_auto,f_webp'),
          full: insertTransform(originalUrl, 'w_1600,c_limit,q_auto:good,f_webp'),
        });
      }
    );
    stream.end(buffer);
  });

// Backward-compat helper — returns just the original URL (used by legacy endpoints)
const uploadToCloudinarySimple = (buffer: Buffer, folder = 'findasale'): Promise<string> =>
  uploadToCloudinary(buffer, folder).then(urls => urls.original).catch((err: unknown) => { console.error('[upload] Cloudinary async upload failed:', err); throw err; });

// POST /api/upload/sale-photos — up to 20 images, returns { urls: string[] }
export const uploadSalePhotos = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ message: 'No files provided' });
      return;
    }

    // H2: Promise.allSettled so a partial batch failure doesn't drop the whole upload
    const results = await Promise.allSettled(
      files.map(f => uploadToCloudinary(f.buffer))
    );

    const urls: string[] = [];
    const imageVariants: CloudinaryUrls[] = [];
    const partialErrors: string[] = [];
    let nsfwDetected = false;

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        urls.push(r.value.original); // backward-compat: flat URL array
        imageVariants.push(r.value);
      } else {
        const reason = r.reason as any;
        if (reason?.code === 'NSFW_DETECTED') {
          nsfwDetected = true;
          partialErrors.push(`File ${i + 1}: ${reason.message}`);
        } else {
          partialErrors.push(`File ${i + 1}: ${(reason as Error)?.message ?? 'upload failed'}`);
        }
      }
    });

    // If NSFW detected, return early with specific error
    if (nsfwDetected) {
      res.status(400).json({
        error: 'NSFW_DETECTED',
        message: 'One or more images were rejected for policy violation',
        partialErrors,
      });
      return;
    }

    // P0-1: Validate that all returned URLs are non-empty strings
    const invalidUrls = imageVariants
      .map((variant, idx) => variant.original)
      .filter((url, idx) => !url || typeof url !== 'string')
      .length;

    if (invalidUrls > 0) {
      const errorCount = partialErrors.length + invalidUrls;
      res.status(500).json({ message: `Upload failed for ${errorCount} file${errorCount !== 1 ? 's' : ''}`,
        partialErrors: [...partialErrors, `${invalidUrls} file${invalidUrls !== 1 ? 's' : ''} uploaded but returned invalid URLs`],
      });
      return;
    }

    res.json({ urls, imageVariants, ...(partialErrors.length ? { partialErrors } : {}) });
  } catch (error) {
    console.error('uploadSalePhotos error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
};

// POST /api/upload/item-photo — single image, returns { url: string }
export const uploadItemPhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file provided' });
      return;
    }

    const urls = await uploadToCloudinary(file.buffer);
    res.json({ url: urls.original, imageVariants: urls });
  } catch (error) {
    console.error('uploadItemPhoto error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
};

// POST /api/upload/rapid-batch — CB1: upload + AI analyze in one call
// Cloud AI (Google Vision + Claude Haiku) with Ollama fallback.
// Accepts up to 20 images. Returns { results: Array<{ index, cloudinaryUrl, ai, error? }> }
export const rapidBatchUpload = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ message: 'No files provided' });
      return;
    }

    const ollamaPrompt = `You are a secondary-sale pricing assistant (estate sales, yard sales, auctions, flea markets, consignment). Look at this image and respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "title": "short descriptive item title",
  "description": "1-2 sentence description mentioning condition and notable features",
  "category": "one of: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Other",
  "condition": "one of: NEW, USED, REFURBISHED, PARTS_OR_REPAIR",
  "suggestedPrice": 12.50
}`;

    const useCloudAI = isCloudAIAvailable();

    // #113: Async AI Tagging — upload immediately, process AI in background
    // Process each file: upload to Cloudinary synchronously, defer AI analysis
    const results = await Promise.allSettled(
      files.map(async (file, index) => {
        // Upload to Cloudinary (multi-res) — synchronous
        const imageUrls = await uploadToCloudinary(file.buffer);

        // #113: Defer AI analysis to background via setImmediate
        // Return immediately without waiting for AI
        const mimeType = (file.mimetype as string) || 'image/jpeg';

        setImmediate(async () => {
          try {
            let ai: Record<string, unknown> | null = null;

            if (useCloudAI) {
              // ── Cloud AI path (CB1): Google Vision + Claude Haiku ──────────────
              try {
                ai = await analyzeItemImage(file.buffer, mimeType) as Record<string, unknown> | null;
              } catch {
                // Cloud AI failed — fall through to Ollama
              }
            }

            if (!ai) {
              // ── Ollama fallback ────────────────────────────────────────────────
              // ADR 2026-07-01 §6: pass catalog-match evidence into the Ollama
              // fallback prompt too, so even full-fallback mode (paid APIs down)
              // benefits from the self-hosted reverse-image corpus. Best-effort —
              // never blocks the fallback path if the embedding service is down.
              try {
                const base64Image = file.buffer.toString('base64');
                let catalogMatchContext = '';
                if (isCatalogMatchEnabled()) {
                  try {
                    const matches = await findCatalogMatches(file.buffer, mimeType);
                    catalogMatchContext = buildCatalogMatchContext(matches);
                  } catch {
                    // catalog match best-effort — proceed without it
                  }
                }
                let ebayMatchContext = '';
                try {
                  ebayMatchContext = buildEbayMatchContext(await getEbayImageMatch(base64Image));
                } catch { /* eBay image-search best-effort (ADR-ebay-searchbyimage-tagging-2026-07-02) */ }
                const aiResponse = await axios.post(
                  `${OLLAMA_URL}/api/generate`,
                  { model: OLLAMA_VISION_MODEL, prompt: ollamaPrompt + catalogMatchContext + ebayMatchContext, images: [base64Image], stream: false },
                  { timeout: 45000 }
                );
                const raw = aiResponse.data.response.replace(/```json\n?|\n?```/g, '').trim();
                ai = JSON.parse(raw);
              } catch {
                // AI unavailable — organizer fills in manually
              }
            }

            // Best-effort: log if AI processing succeeded
            if (ai) {
              console.log(`[async-ai-tagging] Background AI analysis completed for image ${index}`);
            }
          } catch (error) {
            console.error(`[async-ai-tagging] Background error for image ${index}:`, error);
          }
        });

        return { index, cloudinaryUrl: imageUrls.original, imageVariants: imageUrls, ai: null };
      })
    );

    const output = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { index: i, cloudinaryUrl: null, ai: null, error: (r.reason as Error)?.message ?? 'Failed' };
    });

    res.json({ results: output });
  } catch (error) {
    console.error('rapidBatchUpload error:', error);
    res.status(500).json({ message: 'Batch processing failed' });
  }
};

// POST /api/upload/analyze-photo — CB1: Cloud AI (Google Vision + Claude Haiku) with Ollama fallback
// Returns { title, description, category, condition, suggestedPrice }
export const analyzePhotoWithAI = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file provided' });
      return;
    }

    const mimeType = (file.mimetype as string) || 'image/jpeg';

    // ── Cloud AI path (CB1): Google Vision + Claude Haiku ─────────────────────
    if (isCloudAIAvailable()) {
      try {
        const result = await analyzeItemImage(file.buffer, mimeType);
        if (result) {
          res.json(result);
          return;
        }
      } catch (cloudErr: any) {
        // Cloud AI failed — fall through to Ollama
        console.error('Cloud AI error, falling back to Ollama:', cloudErr?.message);
      }
    }

    // ── Ollama fallback ────────────────────────────────────────────────────────
    const base64Image = file.buffer.toString('base64');

    const prompt = `You are a secondary-sale pricing assistant (estate sales, yard sales, auctions, flea markets, consignment). Look at this image and respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "title": "short descriptive item title",
  "description": "1-2 sentence description mentioning condition and notable features",
  "category": "one of: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Other",
  "condition": "one of: NEW, USED, REFURBISHED, PARTS_OR_REPAIR",
  "suggestedPrice": 12.50
}`;

    // ADR 2026-07-01 §6: catalog-match evidence in the Ollama fallback prompt too.
    // Best-effort — never blocks the fallback path if the embedding service is down.
    let catalogMatchContext = '';
    if (isCatalogMatchEnabled()) {
      try {
        const matches = await findCatalogMatches(file.buffer, mimeType);
        catalogMatchContext = buildCatalogMatchContext(matches);
      } catch {
        // catalog match best-effort — proceed without it
      }
    }

    let ebayMatchContext = '';
    try {
      ebayMatchContext = buildEbayMatchContext(await getEbayImageMatch(base64Image));
    } catch { /* eBay image-search best-effort (ADR-ebay-searchbyimage-tagging-2026-07-02) */ }
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      { model: OLLAMA_VISION_MODEL, prompt: prompt + catalogMatchContext + ebayMatchContext, images: [base64Image], stream: false },
      { timeout: 30000 }
    );

    let parsed: Record<string, unknown>;
    try {
      const raw = response.data.response.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      res.status(422).json({ message: 'AI returned unparseable response', raw: response.data.response });
      return;
    }

    res.json(parsed);
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      res.status(503).json({ message: 'AI service unavailable' });
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      res.status(504).json({ message: 'AI service timed out' });
    } else {
      console.error('analyzePhotoWithAI error:', error);
      res.status(500).json({ message: 'Photo analysis failed' });
    }
  }
};

// POST /api/upload/rapidfire — Phase 2A: Single image upload for Rapidfire Mode
// Accepts { saleId: string, imageBase64: string } OR multipart form
// Creates DRAFT Item immediately, queues background AI processing
// Returns { itemId, status: 'DRAFT' }
export const uploadRapidfire = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      res.status(403).json({ message: 'Organizer access required' });
      return;
    }

    const { saleId } = req.body;
    const file = req.file;

    if (!saleId) {
      res.status(400).json({ message: 'saleId is required' });
      return;
    }

    if (!file) {
      res.status(400).json({ message: 'No image provided' });
      return;
    }

    // Verify sale exists and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: { select: { userId: true } }
      }
    });

    if (!sale) {
      res.status(404).json({ message: 'Sale not found' });
      return;
    }

    if (sale.organizer.userId !== req.user.id) {
      res.status(403).json({ message: 'Not your sale' });
      return;
    }

    // Upload image to Cloudinary (with retry for 420 rate limits from rapid-fire bursts)
    let photoUrl: string;
    try {
      const urls = await uploadToCloudinaryWithRetry(file.buffer);
      photoUrl = urls.original;
    } catch (uploadErr) {
      console.error('[rapidfire] Cloudinary upload failed:', uploadErr);
      res.status(500).json({ message: 'Image upload failed' });
      return;
    }

    // Create DRAFT Item with minimal required fields
    const autoEnhanced = req.body.autoEnhanced === true || req.body.autoEnhanced === 'true';
    const item = await prisma.item.create({
      data: {
        saleId,
        organizerId: sale.organizerId,
        title: 'Untitled Item',
        photoUrls: [photoUrl],
        draftStatus: 'DRAFT',
        status: 'AVAILABLE',
        embedding: [],
        listingType: 'FIXED',
        isActive: true,
        autoEnhanced,
      }
    });

    // #319/#325/#328: Sync Photo table — fire-and-forget, never blocks response
    prisma.photo.create({
      data: {
        itemId: item.id,
        url: photoUrl,
        isPrimary: true,
        orderIndex: 0,
      },
    }).catch(err => console.warn('[Photo sync] create failed on uploadRapidfire:', err));

    // Debounce: start AI trigger timer (4.5s window for user to add more photos via "+")
    resetRapidDraftDebounce(item.id);

    // Return immediately with itemId and DRAFT status
    res.status(201).json({
      itemId: item.id,
      status: 'DRAFT',
      photoUrl
    });
  } catch (error) {
    console.error('[rapidfire] uploadRapidfire error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
};