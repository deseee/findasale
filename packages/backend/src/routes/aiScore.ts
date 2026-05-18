import { Router, Request, Response } from 'express';

const router = Router();

// --- Types ---

interface CheckResult {
  present?: boolean;
  count?: number;
  types?: string[];
  ratio?: number;
  points: number;
}

interface AiScoreChecks {
  jsonLd: CheckResult;
  metaDescription: CheckResult;
  ogTitle: CheckResult;
  ogDescription: CheckResult;
  canonical: CheckResult;
  h1: CheckResult;
  title: CheckResult;
  imgAlt: CheckResult;
}

interface AiScoreResponse {
  url: string;
  score: number;
  grade: string;
  checks: AiScoreChecks;
  summary: string;
}

interface AiScoreError {
  score: 0;
  error: string;
}

// --- Helpers ---

function getGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function getSummary(checks: AiScoreChecks, score: number): string {
  const missing: string[] = [];

  if (!checks.jsonLd.present) missing.push('structured data (JSON-LD)');
  if (!checks.metaDescription.present) missing.push('a meta description');
  if (!checks.ogTitle.present) missing.push('an og:title tag');
  if (!checks.canonical.present) missing.push('a canonical URL');
  if ((checks.imgAlt.ratio ?? 0) < 0.8) missing.push('alt text on all images');
  if (checks.jsonLd.present && !(checks.jsonLd.types ?? []).includes('Event')) {
    missing.push('an Event schema type');
  }

  if (score >= 90) return 'Excellent GEO readiness. This page is well-optimized for AI search assistants.';
  if (score >= 80) return `Strong structured data foundation. Minor improvements available: ${missing.slice(0, 2).join(', ')}.`;
  if (score >= 70) return `Good foundation. Adding ${missing.slice(0, 2).join(' and ')} would improve AI visibility.`;
  if (score >= 60) return `Moderate AI visibility. Missing: ${missing.join(', ')}.`;
  return `Low AI visibility. This page is missing critical signals: ${missing.join(', ')}.`;
}

function extractJsonLdInfo(html: string): { present: boolean; count: number; types: string[] } {
  const scriptMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!scriptMatches || scriptMatches.length === 0) {
    return { present: false, count: 0, types: [] };
  }

  const types: string[] = [];
  for (const block of scriptMatches) {
    const innerMatch = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!innerMatch) continue;
    try {
      const parsed = JSON.parse(innerMatch[1].trim());
      const extractTypes = (obj: unknown): void => {
        if (!obj || typeof obj !== 'object') return;
        const o = obj as Record<string, unknown>;
        if (o['@type']) {
          const t = o['@type'];
          if (Array.isArray(t)) {
            (t as string[]).forEach((v) => { if (!types.includes(v)) types.push(v); });
          } else if (typeof t === 'string' && !types.includes(t)) {
            types.push(t);
          }
        }
        for (const key of Object.keys(o)) {
          if (key !== '@type' && typeof o[key] === 'object') extractTypes(o[key]);
        }
      };
      if (Array.isArray(parsed)) {
        parsed.forEach(extractTypes);
      } else {
        extractTypes(parsed);
      }
    } catch {
      // malformed JSON-LD — still count it as present
    }
  }

  return { present: true, count: scriptMatches.length, types };
}

function extractMetaContent(html: string, name: string): boolean {
  // Matches <meta name="..." content="..."> and <meta property="..." content="...">
  const re = new RegExp(`<meta[^>]+(name|property)=["']${name}["'][^>]*content=["'][^"']+["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["'][^"']+["'][^>]+(name|property)=["']${name}["']`, 'i');
  return re.test(html) || re2.test(html);
}

function extractImgAltRatio(html: string): number {
  const allImgs = html.match(/<img[^>]*>/gi);
  if (!allImgs || allImgs.length === 0) return 1; // no images = full score
  const withAlt = allImgs.filter((tag) => /alt=["'][^"']+["']/i.test(tag));
  return withAlt.length / allImgs.length;
}

// --- Route ---

router.get('/ai-score', async (req: Request, res: Response): Promise<void> => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ score: 0, error: 'Missing url parameter' });
    return;
  }

  // Validate URL format
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ score: 0, error: 'Invalid URL format' });
    return;
  }

  if (parsed.protocol !== 'https:') {
    res.status(400).json({ score: 0, error: 'URL must use HTTPS' });
    return;
  }

  if (!parsed.hostname.endsWith('finda.sale')) {
    res.status(400).json({ score: 0, error: 'URL must be a finda.sale domain' });
    return;
  }

  // Fetch the page
  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const fetchRes = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 compatible FindASale-Auditor/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (!fetchRes.ok) {
      res.status(200).json({ score: 0, error: `Page returned HTTP ${fetchRes.status}` } as AiScoreError);
      return;
    }
    html = await fetchRes.text();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(200).json({ score: 0, error: `Failed to fetch URL: ${message}` } as AiScoreError);
    return;
  }

  // --- Run checks ---

  // JSON-LD
  const jsonLdInfo = extractJsonLdInfo(html);
  let jsonLdPoints = 0;
  if (jsonLdInfo.present) jsonLdPoints += 25;
  if (jsonLdInfo.types.includes('Event')) jsonLdPoints += 15;
  if (jsonLdInfo.types.includes('BreadcrumbList')) jsonLdPoints += 10;

  // Meta tags
  const hasMetaDesc = extractMetaContent(html, 'description');
  const hasOgTitle = extractMetaContent(html, 'og:title');
  const hasOgDesc = extractMetaContent(html, 'og:description');

  // Canonical
  const hasCanonical = /<link[^>]+rel=["']canonical["'][^>]*href=["'][^"']+["']/i.test(html)
    || /<link[^>]+href=["'][^"']+["'][^>]*rel=["']canonical["']/i.test(html);

  // h1
  const hasH1 = /<h1[\s>]/i.test(html);

  // title
  const hasTitle = /<title[\s>]/i.test(html) && /<\/title>/i.test(html);

  // img alt ratio
  const imgAltRatio = extractImgAltRatio(html);

  const checks: AiScoreChecks = {
    jsonLd: { present: jsonLdInfo.present, count: jsonLdInfo.count, types: jsonLdInfo.types, points: jsonLdPoints },
    metaDescription: { present: hasMetaDesc, points: hasMetaDesc ? 10 : 0 },
    ogTitle: { present: hasOgTitle, points: hasOgTitle ? 8 : 0 },
    ogDescription: { present: hasOgDesc, points: hasOgDesc ? 7 : 0 },
    canonical: { present: hasCanonical, points: hasCanonical ? 8 : 0 },
    h1: { present: hasH1, points: hasH1 ? 7 : 0 },
    title: { present: hasTitle, points: hasTitle ? 5 : 0 },
    imgAlt: { ratio: Math.round(imgAltRatio * 100) / 100, points: imgAltRatio >= 0.8 ? 5 : 0 },
  };

  const score = Object.values(checks).reduce((sum, c) => sum + c.points, 0);
  const grade = getGrade(score);
  const summary = getSummary(checks, score);

  const response: AiScoreResponse = { url, score, grade, checks, summary };
  res.json(response);
});

export default router;
