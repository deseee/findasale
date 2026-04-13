/**
 * Strips HTML tags and script-injectable content from user input.
 * Lightweight alternative to sanitize-html for user-generated text fields.
 */
export function sanitizeText(input: string): string {
  if (!input) return input;
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}
