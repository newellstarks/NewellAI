/**
 * Bounded snippet around the first case-insensitive literal match.
 * Never returns the full turn when the text is longer than the window.
 */

export const SNIPPET_RADIUS = 80;
export const SNIPPET_MAX_CHARS = SNIPPET_RADIUS * 2 + 64;

export function makeSnippet(
  text: string,
  query: string,
  radius: number = SNIPPET_RADIUS,
): string {
  if (text.length === 0) return "";
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let idx = lowerText.indexOf(lowerQuery);
  if (idx < 0) {
    // Fallback: truncate only (should not happen when SQL already matched).
    const cut = text.slice(0, Math.min(text.length, SNIPPET_MAX_CHARS));
    return text.length > SNIPPET_MAX_CHARS ? `${cut}…` : cut;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  if (snippet.length > SNIPPET_MAX_CHARS) {
    snippet = `${snippet.slice(0, SNIPPET_MAX_CHARS)}…`;
  }
  return snippet;
}
