/**
 * cityFaqs.ts: FAQ helpers shared by the city category pages.
 *
 * Used by both the curated ISR page (pages/city/[slug]/[category].tsx) and its SSR long-tail
 * sibling (pages/internal-ssr/city-category/[slug]/[category].tsx), so the two page families
 * always render and mark up the same FAQ list.
 */
import type { FaqItem } from '@/lib/seo/cityData';

/** Live-data FAQs first (city-specific, current), then curated ones; duplicate questions are dropped. */
export function mergeFaqs(live: FaqItem[], curated: FaqItem[]): FaqItem[] {
  const seen = new Set<string>();
  const out: FaqItem[] = [];
  for (const faq of [...live, ...curated]) {
    if (!faq || !faq.question?.trim() || !faq.answer?.trim()) continue;
    const key = faq.question.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(faq);
  }
  return out;
}
