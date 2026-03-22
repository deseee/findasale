import { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import axios from 'axios';
import { analyzeItemImage, isCloudAIAvailable } from '../services/cloudAIService';
import { enqueueProcessRapidDraft } from '../jobs/processRapidDraft';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { trackCloudinaryServe } from '../lib/cloudinaryBandwidthTracker';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer — memory storage (buffers go straight to Cloudinary, no disk writes)
export const upload = multer({ storage: multer.memoryStorage() });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';

// ── Cloudinary image variants (Phase 14c) ────────────────────────────
// Eager transformations generate optimized variants at upload time.
// No webhooks needed — all variants are ready when the upload resolves.
const EAGER_TRANSFORMS = [
  // Thumbnail: 200×200 auto-crop face/center, WebP, quality 60
  { width: 200, height: 200, crop: 'fill', gravity: 'auto', quality: 60, format: 'webp' },
  // Optimized: 800px wide, auto quality, WebP — listing cards + detail page
  { width: 800, crop: 'limit', quality: 'auto', format: 'webp' },
  // Full-res: 1600px cap, auto quality, WebP — lightbox / zoom
  { width: 1600, crop: 'limit', quality: 'auto:good', format: 'webp' },
];

interface CloudinaryUrls {
  original: string;
  thumbnail: string;
  optimized: string;
  full: string;
}

// Upload a single buffer to Cloudinary — returns multi-res URLs
// Also tracks bandwidth usage (#105)
const uploadToCloudinary = (buffer: Buffer, folder = 'findasale'): Promise<CloudinaryUrls> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder,
        eager: EAGER_TRANSFORMS,
        eager_async: false, // wait for transforms before resolving
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));

        // Track Cloudinary serve for bandwidth monitoring (#105)
        // Each image upload typically produces 4 variants (original + 3 eager transforms)
        trackCloudinaryServe(); // original
        trackCloudinaryServe(); // thumbnail
        trackCloudinaryServe(); // optimized
        trackCloudinaryServe(); // full

        const eager = result.eager || [];
        resolve({
          original: result.secure_url,
          thumbnail: eager[0]?.secure_url || result.secure_url,
          optimized: eager[1]?.secure_url || result.secure_url,
          full: eager[2]?.secure_url || result.secure_url,
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
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        urls.push(r.value.original); // backward-compat: flat URL array
        imageVariants.push(r.value);
      } else {
        partialErrors.push(`File ${i + 1}: ${(r.reason as Error)?.message ?? 'upload failed'}`);
      }
    });

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

    const ollamaPrompt = `You are an estate sale pricing assistant. Look at this image and respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "title": "short descriptive item title",
  "description": "1-2 sentence description mentioning condition and notable features",
  "category": "one of: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Other",
  "condition": "one of: NEW, LIKE_NEW, GOOD, FAIR, POOR",
  "suggestedPrice": 12.50
}`;

    const useCloudAI = isCloudAIAvailable();

    // Process each file: upload to Cloudinary + AI analysis in parallel per file
    const results = await Promise.allSettled(
      files.map(async (file, index) => {
        // Upload to Cloudinary (multi-res)
        const imageUrls = await uploadToCloudinary(file.buffer);

        // AI analysis (best-effort — don't fail the whole batch if AI is down)
        let ai: Record<string, unknown> | null = null;
        const mimeType = (file.mimetype as string) || 'image/jpeg';

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
          try {
            const base64Image = file.buffer.toString('base64');
            const aiResponse = await axios.post(
              `${OLLAMA_URL}/api/generate`,
              { model: OLLAMA_VISION_MODEL, prompt: ollamaPrompt, images: [base64Image], stream: false },
              { timeout: 45000 }
            );
            const raw = aiResponse.data.response.replace(/```json\n?|\n?```/g, '').trim();
            ai = JSON.parse(raw);
          } catch {
            // AI unavailable — organizer fills in manually
          }
        }

        return { index, cloudinaryUrl: imageUrls.original, imageVariants: imageUrls, ai };
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

    const prompt = `You are an estate sale pricing assistant. Look at this image and respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "title": "short descriptive item title",
  "description": "1-2 sentence description mentioning condition and notable features",
  "category": "one of: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Other",
  "condition": "one of: NEW, LIKE_NEW, GOOD, FAIR, POOR",
  "suggestedPrice": 12.50
}`;

    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      { model: OLLAMA_VISION_MODEL, prompt, images: [base64Image], stream: false },
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

    // Upload image to Cloudinary
    let photoUrl: string;
    try {
      const urls = await uploadToCloudinary(file.buffer);
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
        title: 'Untitled Item',
        photoUrls: [photoUrl],
        draftStatus: 'DRAFT',
        status: 'AVAILABLE',
        embedding: [],
        listingType: 'FIXED',
        isActive: true,
        autoEnhanced
      }
    });

    // Queue background job (non-blocking)
    enqueueProcessRapidDraft(item.id);

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