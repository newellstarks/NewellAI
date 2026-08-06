import type { SearchHit, Speaker } from "@newellai/contracts";
import { HttpError } from "../errors";
import { likeContainsPattern } from "../search/like";
import { makeSnippet } from "../search/snippet";

/**
 * Turn text search for Desktop Recall v1 (literal LIKE, no FTS).
 */

export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 200;
export const SEARCH_LIMIT_DEFAULT = 25;
export const SEARCH_LIMIT_MAX = 50;

interface SearchRow {
  turn_id: string;
  conversation_id: string;
  client_turn_id: string;
  speaker: string;
  text: string;
  captured_at: string | null;
  created_at: string;
  title: string | null;
}

function requireDb(db: D1Database | undefined): D1Database {
  if (db === undefined) {
    console.error("DB_CONFIGURATION_MISSING");
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }
  return db;
}

export function parseSearchLimit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return SEARCH_LIMIT_DEFAULT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new HttpError("VALIDATION_ERROR", "limit must be a positive integer");
  }
  return Math.min(n, SEARCH_LIMIT_MAX);
}

export function validateSearchQuery(raw: string | null): string {
  if (raw === null) {
    throw new HttpError("VALIDATION_ERROR", "q is required");
  }
  const q = raw.trim();
  if (q.length < SEARCH_QUERY_MIN) {
    throw new HttpError(
      "VALIDATION_ERROR",
      `q must be at least ${SEARCH_QUERY_MIN} characters`,
    );
  }
  if (q.length > SEARCH_QUERY_MAX) {
    throw new HttpError(
      "VALIDATION_ERROR",
      `q must be at most ${SEARCH_QUERY_MAX} characters`,
    );
  }
  return q;
}

/**
 * Literal case-insensitive contains search on turns.text.
 * Order: created_at DESC, turn_id ASC.
 */
export async function searchTurns(
  db: D1Database | undefined,
  query: string,
  limit: number,
): Promise<SearchHit[]> {
  const pattern = likeContainsPattern(query);
  const { results } = await requireDb(db)
    .prepare(
      `SELECT t.turn_id, t.conversation_id, t.client_turn_id, t.speaker,
              t.text, t.captured_at, t.created_at, c.title
         FROM turns t
         JOIN conversations c ON c.conversation_id = t.conversation_id
        WHERE t.text LIKE ? ESCAPE '\\'
        ORDER BY t.created_at DESC, t.turn_id ASC
        LIMIT ?`,
    )
    .bind(pattern, limit)
    .all<SearchRow>();

  return results.map((row) => {
    const hit: SearchHit = {
      conversation_id: row.conversation_id,
      turn_id: row.turn_id,
      client_turn_id: row.client_turn_id,
      speaker: row.speaker as Speaker,
      snippet: makeSnippet(row.text, query),
      created_at: row.created_at,
    };
    if (row.title !== null) hit.title = row.title;
    if (row.captured_at !== null) hit.captured_at = row.captured_at;
    return hit;
  });
}
