/**
 * CityTipsBlock (ADR-074 city cluster, wired 2026-09-29).
 *
 * Renders editorial tips for a city as plain text paragraphs. The earlier draft took an HTML
 * string and used dangerouslySetInnerHTML; that was the open "needs HTML sanitizing" question.
 * The decision is to remove the need: this component takes an array of strings and lets React
 * escape them, so no HTML can ever reach the page from a tip source.
 *
 * Renders nothing when there are no paragraphs. Auto-generated generic tips are intentionally NOT
 * fed into it (ADR-074 section 9: thin, near-duplicate city pages risk a search penalty).
 */
interface CityTipsBlockProps {
  cityName: string;
  cityState: string;
  paragraphs: string[];
}

export function CityTipsBlock({ cityName, cityState, paragraphs }: CityTipsBlockProps) {
  const clean = paragraphs.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 pb-8" aria-labelledby="city-tips">
      <h2 id="city-tips" className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-3">
        Hunting Tips for {cityName}, {cityState}
      </h2>
      <div className="space-y-3 text-warm-700 dark:text-warm-300 leading-relaxed">
        {clean.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}
