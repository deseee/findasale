interface CityTipsBlockProps {
  tipContent: string; // HTML string (converted from Markdown)
  cityName: string;
  cityState: string;
}

/**
 * Renders city tips content as HTML
 * Tip content should be pre-converted to HTML from Markdown
 */
export function CityTipsBlock({
  tipContent,
  cityName,
  cityState,
}: CityTipsBlockProps) {
  return (
    <section className="py-12 px-4 md:px-8 bg-white dark:bg-slate-800">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-8">
          Hunting Tips for {cityName}, {cityState}
        </h2>

        <div className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300">
          <div
            dangerouslySetInnerHTML={{ __html: tipContent }}
            className="space-y-4"
          />
        </div>
      </div>
    </section>
  );
}
