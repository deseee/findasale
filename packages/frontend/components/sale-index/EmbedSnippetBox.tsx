import { useState } from 'react';

/**
 * Copy-to-clipboard embed snippet for the Weekend Sale Index.
 * Gives journalists / bloggers an iframe embed plus a raw attribution link so
 * non-iframe embedders still drop a backlink to finda.sale.
 * No @findasale/shared import.
 */

const IFRAME_SNIPPET = `<iframe src="https://finda.sale/embed/sale-index" width="100%" height="600" frameborder="0" title="The Weekend Sale Index by FindA.Sale" loading="lazy"></iframe>
<p style="font-size:12px;text-align:center;font-family:sans-serif;">Data: <a href="https://finda.sale/sale-index" rel="noopener" target="_blank">The Weekend Sale Index by FindA.Sale</a></p>`;

export default function EmbedSnippetBox() {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(IFRAME_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API unavailable (older browsers / insecure context) — fall back
      // to selecting the text so the user can copy manually.
      const el = document.getElementById('sale-index-embed-code');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    } finally {
      setCopying(false);
    }
  };

  return (
    <section className="mt-12 rounded-xl border border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-800/40 p-6">
      <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-2">
        Embed the Weekend Sale Index
      </h2>
      <p className="text-sm text-warm-600 dark:text-warm-300 mb-4">
        Writing about secondary sales? Drop this live, auto-updating index into your
        article or site. It refreshes on its own — no maintenance required.
      </p>

      <div className="relative">
        <pre
          id="sale-index-embed-code"
          className="overflow-x-auto rounded-lg bg-warm-900 dark:bg-gray-950 text-warm-100 text-xs leading-relaxed p-4 pr-24 whitespace-pre-wrap break-all"
        >
          <code>{IFRAME_SNIPPET}</code>
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          disabled={copying}
          className="absolute top-3 right-3 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
        >
          {copied ? 'Copied!' : copying ? 'Copying…' : 'Copy'}
        </button>
      </div>

      <p className="text-xs text-warm-500 dark:text-warm-400 mt-3">
        Prefer a plain link? Cite{' '}
        <a
          href="https://finda.sale/sale-index"
          rel="noopener"
          className="text-amber-700 dark:text-amber-400 hover:underline"
        >
          The Weekend Sale Index by FindA.Sale
        </a>
        .
      </p>
    </section>
  );
}
