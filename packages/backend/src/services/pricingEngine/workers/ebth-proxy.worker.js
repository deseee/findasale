/**
 * EBTH Scraping Proxy — Cloudflare Worker
 * Deploy at: workers.dev or custom domain
 * Env var needed in Railway: EBTH_WORKER_URL=https://your-worker.workers.dev
 *
 * Deploy steps:
 * 1. Create account at workers.cloudflare.com (free)
 * 2. Create new Worker
 * 3. Paste this script
 * 4. Copy the worker URL into Railway env var EBTH_WORKER_URL
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const page = url.searchParams.get('page') || '1';

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
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
