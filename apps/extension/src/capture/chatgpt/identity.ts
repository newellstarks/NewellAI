import { MAX_SOURCE_KEY_LENGTH } from "../../queue/queue";
import type { Speaker } from "@newellai/contracts";

/**
 * Turn identity for ChatGPT capture (docs/CaptureClient.md, ADR-0006).
 *
 * Prefer a validated source-provided id. Else deterministic synthetic:
 *   conversation_id|speaker|normalizedText|occurrenceIndex (0-based)
 * among same speaker + same normalized text in the visible scan set.
 *
 * When the literal key exceeds MAX_SOURCE_KEY_LENGTH (128), the text
 * segment is replaced with h:<sha256hex> so the key stays within the
 * existing queue validation bound without redesigning identity policy.
 */

export function isValidSourceProvidedId(value: string | null | undefined): value is string {
  if (value === null || value === undefined) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SOURCE_KEY_LENGTH) return false;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false;
  return true;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the synthetic source_key. Occurrence index is 0-based among turns
 * with the same speaker and same normalized text in one scan.
 */
export async function buildSyntheticSourceKey(
  conversationId: string,
  speaker: Speaker,
  normalizedText: string,
  occurrenceIndex: number,
): Promise<string> {
  const literal = `${conversationId}|${speaker}|${normalizedText}|${occurrenceIndex}`;
  if (literal.length <= MAX_SOURCE_KEY_LENGTH && !/[\u0000-\u001f\u007f]/.test(literal)) {
    return literal;
  }
  const hash = await sha256Hex(normalizedText);
  const compact = `${conversationId}|${speaker}|h:${hash}|${occurrenceIndex}`;
  if (compact.length > MAX_SOURCE_KEY_LENGTH) {
    // Extreme conversation_id lengths: hash the whole logical key.
    const fullHash = await sha256Hex(literal);
    return `h:${fullHash}`.slice(0, MAX_SOURCE_KEY_LENGTH);
  }
  return compact;
}

export interface TurnForIdentity {
  speaker: Speaker;
  text: string;
  /** Adapter-extracted source id when present. */
  sourceProvidedId?: string | null;
}

export interface TurnWithSourceKey extends TurnForIdentity {
  source_key: string;
}

/**
 * Assign source_key for a completed scan set (DOM order).
 * Source-provided ids win; synthetic keys use per-(speaker,text) occurrence.
 */
export async function assignSourceKeys(
  conversationId: string,
  turns: TurnForIdentity[],
): Promise<TurnWithSourceKey[]> {
  const occurrence = new Map<string, number>();
  const out: TurnWithSourceKey[] = [];

  for (const turn of turns) {
    if (isValidSourceProvidedId(turn.sourceProvidedId)) {
      out.push({ ...turn, source_key: turn.sourceProvidedId.trim() });
      continue;
    }
    const bucket = `${turn.speaker}\0${turn.text}`;
    const index = occurrence.get(bucket) ?? 0;
    occurrence.set(bucket, index + 1);
    const source_key = await buildSyntheticSourceKey(
      conversationId,
      turn.speaker,
      turn.text,
      index,
    );
    out.push({ ...turn, source_key });
  }

  return out;
}
