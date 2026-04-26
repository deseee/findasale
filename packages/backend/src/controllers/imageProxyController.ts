import { Request, Response } from 'express';

// Allowlisted domains for image proxying
const ALLOWED_DOMAINS = [
  'i.ebayimg.com',
  'ir.ebaystatic.com',
  'thumbs.ebaystatic.com',
];

/**
 * Image proxy endpoint for eBay CDN images
 * GET /api/image-proxy?url=<encoded_url>
 *
 * Validates the `url` param is from an allowed domain, fetches the image,
 * caches it for 24 hours, and streams it back with correct Content-Type.
 */
export const imageProxy = async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    // Validate URL parameter is provided
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid url parameter' });
    }

    // Decode the URL
    let decodedUrl: string;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid URL encoding' });
    }

    // Validate domain is in allowlist
    const urlObj = new URL(decodedUrl);
    const isAllowed = ALLOWED_DOMAINS.some(
      domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );

    if (!isAllowed) {
      return res.status(403).json({
        error: `Domain ${urlObj.hostname} not allowed. Allowed domains: ${ALLOWED_DOMAINS.join(', ')}`,
      });
    }

    // Fetch the image from upstream
    const response = await fetch(decodedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'FindA.Sale/1.0 (Image Proxy)',
      },
    });

    if (!response.ok) {
      console.warn(
        `[imageProxy] Upstream returned ${response.status} for ${decodedUrl}`
      );
      return res.status(502).json({
        error: `Failed to fetch image: ${response.status}`,
      });
    }

    // Set cache headers: 24 hours
    res.set('Cache-Control', 'public, max-age=86400');

    // Copy Content-Type from upstream response
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.set('Content-Type', contentType);
    }

    // Stream the response back
    if (response.body) {
      // Convert ReadableStream to Node.js readable stream
      const chunks: Buffer[] = [];
      for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      res.send(buffer);
    } else {
      res.status(502).json({ error: 'No response body' });
    }
  } catch (error: any) {
    console.error('[imageProxy] Error:', error);
    res.status(502).json({
      error: 'Error fetching image',
      message: error.message,
    });
  }
};
