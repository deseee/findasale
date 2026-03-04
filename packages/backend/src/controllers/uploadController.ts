import { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import axios from 'axios';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer — memory storage (buffers go straight to Cloudinary, no disk writes)
export const upload = multer({ storage: multer.memoryStorage() });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';

// Upload a single buffer to Cloudinary — returns the secure URL
const uploadToCloudinary = (buffer: Buffer, folder = 'findasale'): Promise<string> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto', folder },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });

// POST /api/upload/sale-photos — up to 20 images, returns { urls: string[] }
export const uploadSalePhotos = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }

    // H2: Promise.allSettled so a partial batch failure doesn't drop the whole upload
    const results = await Promise.allSettled(
      files.map(f => uploadToCloudinary(f.buffer))
    );

    const urls: string[] = [];
    const partialErrors: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') urls.push(r.value);
      else partialErrors.push(`File ${i + 1}: ${(r.reason as Error)?.message ?? 'upload failed'}`);
    });

    res.json({ urls, ...(partialErrors.length ? { partialErrors } : {}) });
  } catch (error) {
    console.error('uploadSalePhotos error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// POST /api/upload/item-photo — single image, returns { url: string }
export const uploadItemPhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const url = await uploadToCloudinary(file.buffer);
    res.json({ url });
  } catch (error) {
    console.error('uploadItemPhoto error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// POST /api/upload/analyze-photo — sends image to Ollama qwen3-vl:4b
// Returns { title, description, category, condition, suggestedPrice }
export const analyzePhotoWithAI = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

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
      res.status(422).json({ error: 'AI returned unparseable response', raw: response.data.response });
      return;
    }

    res.json(parsed);
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'AI service unavailable' });
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      res.status(504).json({ error: 'AI service timed out' });
    } else {
      console.error('analyzePhotoWithAI error:', error);
      res.status(500).json({ error: 'Photo analysis failed' });
    }
  }
};
