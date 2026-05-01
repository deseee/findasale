/**
 * Simple Markdown to HTML converter for city tips
 * Supports basic formatting: headings, paragraphs, bold, italics, lists
 */

export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Escape HTML special characters first (except our markup)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&amp;lt;/g, '&lt;')
    .replace(/&amp;gt;/g, '&gt;');

  // H1
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>');

  // H2
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-5 mb-3">$1</h2>');

  // H3
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // Italic
  html = html.replace(/_(.+?)_/g, '<em class="italic">$1</em>');

  // Unordered lists
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*<\/li>)/, (match) => {
    return '<ul class="list-disc list-inside space-y-2 mb-4">' + match + '</ul>';
  });

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p class="mb-4 leading-relaxed">');
  html = '<p class="mb-4 leading-relaxed">' + html + '</p>';

  // Clean up multiple paragraph tags
  html = html.replace(/<\/p>\s*<p class="mb-4 leading-relaxed">/g, '</p><p class="mb-4 leading-relaxed">');

  // Remove paragraph wrapping from lists
  html = html.replace(/<p class="mb-4 leading-relaxed">(<ul>)/g, '<ul>');
  html = html.replace(/(<\/ul>)<\/p>/g, '</ul>');

  return html;
}
