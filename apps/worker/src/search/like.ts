/**
 * Literal LIKE pattern helpers for GET /v1/search (Desktop Recall v1).
 * Escape %, _, and the ESCAPE character so user input is matched literally.
 */

export const LIKE_ESCAPE = "\\";

/** Escape LIKE wildcards and the escape character itself. */
export function escapeLikeLiteral(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/** Build a contains-pattern for parameterized LIKE … ESCAPE '\'. */
export function likeContainsPattern(literalQuery: string): string {
  return `%${escapeLikeLiteral(literalQuery)}%`;
}
