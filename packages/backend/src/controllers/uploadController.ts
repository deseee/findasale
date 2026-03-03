import { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import path from 'path';
import axios from 'axios';

// Configure Cloudinary from env vars
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer: store uploads in memory (we stream straight to Cloudinary)
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeValid = allowedTypes.test(file.mimetype);
  if (extValid && mimeValid) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
  }
};

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per file
  fileFilter,
});

// Upload a single image buffer to Cloudinary and return the secure URL
const uploadToCloudinary = (buffer: Buffer, folder: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `findasale/${folder}`,
        transformation: [
          { width: 1600, height: 1200, crop: 'limit' }, // Cap dimensions
          { quality: 'auto:good' },                      // Smart compression
          { fetch_format: 'auto' },                      // Serve WebP to modern browsers
        ],
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Cloudinary upload failed'));
        } else {
          resolve(result.secure_url);
        }
      }
    );
    stream.end(buffer);
  });
};

// POST /api/upload/sale-photos  — upload 1–20 photos for a sale
export const uploadSalePhotos = async (req: Request, res: Response) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    if (req.files.length > 20) {
      return res.status(400).json({ message: 'Maximum 20 photos per upload' });
    }

    const urls = await Promise.all(
      (req.files as Express.Multer.File[]).map((file) =>
        uploadToCloudinary(file.buffer, 'sales')
      )
    );

    res.json({ urls });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message || 'Upload failed' });
  }
};

// POST /api/upload/item-photo  — upload a single photo for an item
export const uploadItemPhoto = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const url = await uploadToCloudinary(req.file.buffer, 'items');
    res.json({ url });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message || 'Upload failed' });
  }
};

// Structured AI response shape
interface AIPhotoAnalysis {
  title: string;
  description: string;
  category: string;
  condition: string;
  suggestedPrice: number | null;
}

const VALID_CATEGORIES = new Set([
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles',
  'art', 'jewelry', 'books', 'tools', 'electronics', 'sports', 'other',
]);
const VALID_CONDITIONS = new Set(['mint', 'excellent', 'good', 'fair', 'poor']);

function sanitizeAnalysis(raw: any): AIPhotoAnalysis {
  return {
    title: typeof raw.title === 'string' ? raw.title.slice(0, 80).trim() : '',
    description: typeof raw.description === 'string' ? raw.description.slice(0, 500).trim() : '',
    category: VALID_CATEGORIES.has(raw.category) ? raw.category : 'other',
    condition: VALID_CONDITIONS.has(raw.condition) ? raw.condition : 'good',
    suggestedPrice: typeof raw.suggestedPrice === 'number' && raw.suggestedPrice > 0
      ? Math.round(raw.suggestedPrice * 100) / 100
      : null,
  };
}

function extractJson(text: string): any {
  // Strip markdown code fences if present
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/gi, '').trim();
  // Find the first {...} block
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in model response');
  return JSON.parse(match[0]);
}

// POST /api/upload/analyze-photo  — send image to qwen3-vl:4b, get structured item data back
export const analyzePhotoWithAI = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const ollamaUrl = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
    const model = process.env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';
    const base64Image = req.file.buffer.toString('base64');

    const prompt =
      'You are an assistant that helps estate sale organizers list items quickly. ' +
      'Analyze this photo and return ONLY a JSON object — no markdown, no explanation — with these exact fields:\n' +
      '{\n' +
      '  "title": "short descriptive title (max 60 chars)",\n' +
      '  "description": "1-2 sentences about what the item is and any visible condition details",\n' +
      '  "category": "one of: furniture, decor, vintage, textiles, collectibles, art, jewelry, books, tools, electronics, sports, other",\n' +
      '  "condition": "one of: mint, excellent, good, fair, poor",\n' +
      '  "suggestedPrice": <a number like 25 or 150, or null if uncertain>\n' +
      '}\n' +
      'Return ONLY the JSON object.';

    const start = Date.now();

    const ollamaResponse = await axios.post(
      `${ollamaUrl}/api/chat`,
      {
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [base64Image],
          },
        ],
        stream: false,
        options: {
          temperature: 0.1,  // Low temperature for consistent structured output
          num_predict: 300,
        },
      },
      { timeout: 45000 }  // 45s — vision inference can be slow on first run
    );

    const rawText: string = ollamaResponse.data?.message?.content ?? '';
    console.log(`[ollama/analyze-photo] ${model} responded in ${Date.now() - start}ms`);

    let analysis: AIPhotoAnalysis;
    try {
      const parsed = extractJson(rawText);
      analysis = sanitizeAnalysis(parsed);
    } catch (parseErr: any) {
      console.warn('[ollama/analyze-photo] Failed to parse JSON from model response:', rawText.slice(0, 200));
      return res.status(422).json({
        message: 'AI returned an unstructured response — try again',
        raw: rawText.slice(0, 300),
      });
    }

    res.json(analysis);
  } catch (error: any) {
    const isDown = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND';
    const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');

    if (isDown) {
      console.warn('[ollama/analyze-photo] Ollama unreachable — is it running?');
      return res.status(503).json({ message: 'AI service unavailable — Ollama is not running' });
    }
    if (isTimeout) {
      console.warn('[ollama/analyze-photo] Ollama timed out');
      return res.status(504).json({ message: 'AI analysis timed out — try again' });
    }

    console.error('[ollama/analyze-photo] Error:', error.message);
    res.status(500).json({ message: 'AI analysis failed' });
  }
};
