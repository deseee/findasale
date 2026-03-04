import { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// H2: Fallback handling for Cloudinary
export const uploadPhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    try {
      // Try uploading to Cloudinary
      const result = await cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'findasale',
        },
        (error, result) => {
          if (error) throw error;
          res.json({ url: result.secure_url });
        }
      );
      result.end(file.buffer);
    } catch (cloudinaryError) {
      console.warn('Cloudinary upload failed, using fallback:', cloudinaryError);
      // H2: Fallback to local storage or alternative service
      res.status(503).json({ error: 'Upload service temporarily unavailable', fallback: true });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// H2: AI photo analysis with Ollama vision model (qwen3-vl:4b)
export const analyzePhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      res.status(400).json({ error: 'Image URL required' });
      return;
    }

    // Fetch image and convert to base64
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const base64Image = Buffer.from(response.data).toString('base64');

    // Call Ollama vision model
    const visionResponse = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: 'qwen3-vl:4b',
      prompt: 'Describe the items visible in this image. List categories and estimated condition.',
      images: [base64Image],
      stream: false,
    });

    res.json({ analysis: visionResponse.data.response });
  } catch (error) {
    console.error('Photo analysis error:', error);
    res.status(500).json({ error: 'Photo analysis failed' });
  }
};
