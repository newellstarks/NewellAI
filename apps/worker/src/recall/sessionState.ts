/**
 * In-memory Desktop Recall sessions for the Worker isolate.
 * Opaque cookie values are stored as SHA-256 hashes only.
 * Never log raw session ids.
 */

export const RECALL_SESSION_COOKIE = "recall_session";
/** 12 hours */
export const RECALL_SESSION_MAX_AGE_SEC = 12 * 60 * 60;

interface SessionRecord {
  expiresAtMs: number;
}

const sessions = new Map<string, SessionRecord>();

export async function hashSessionToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createRecallSession(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hash = await hashSessionToken(raw);
  sessions.set(hash, {
    expiresAtMs: Date.now() + RECALL_SESSION_MAX_AGE_SEC * 1000,
  });
  return raw;
}

export async function recallSessionValid(raw: string): Promise<boolean> {
  if (raw.length === 0) return false;
  const hash = await hashSessionToken(raw);
  const rec = sessions.get(hash);
  if (rec === undefined) return false;
  if (Date.now() >= rec.expiresAtMs) {
    sessions.delete(hash);
    return false;
  }
  return true;
}

export async function revokeRecallSession(raw: string): Promise<void> {
  if (raw.length === 0) return;
  const hash = await hashSessionToken(raw);
  sessions.delete(hash);
}

/** Test helper — clear all sessions. */
export function resetRecallSessionsForTests(): void {
  sessions.clear();
}
