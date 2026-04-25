/**
 * EBTH Scraping Proxy — Vercel API Route
 * Railway backend calls this endpoint; Vercel's IPs make the request to EBTH.
 * Usage: GET /api/proxy/ebth?q=griswold+cast+iron&page=1
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { q = '', page = '1' } = req.query;
  const query = Array.isArray(q) ? q[0] : q;

  const ebthUrl = `https://www.ebth.com/search?utf8=%E2%9C%93&q=${encodeURIComponent(query)}&page=${page}&status=closed`;

  try {
    const response = await fetch(ebthUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    const html = await response.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600'); // Vercel edge cache 1hr
    res.status(200).send(html);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
