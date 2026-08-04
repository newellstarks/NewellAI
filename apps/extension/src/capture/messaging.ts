import type { Speaker } from "@newellai/contracts";
import {
  CHATGPT_ORIGINS,
  MAX_CONVERSATION_ID_LENGTH,
  MAX_TURN_TEXT_LENGTH,
} from "./constants";
import { MAX_SOURCE_KEY_LENGTH, validateSourceKey } from "../queue/queue";

/**
 * Content-script → service-worker captureEnqueue bridge
 * and legacy enqueue authorization (docs/CaptureClient.md Slice 2).
 */

export const CAPTURE_ENQUEUE_TYPE = "captureEnqueue" as const;

export interface CaptureEnqueueMessage {
  type: typeof CAPTURE_ENQUEUE_TYPE;
  conversation_id: string;
  source_key: string;
  speaker: Speaker;
  text: string;
  captured_at?: string;
}

export type CaptureEnqueueValidation =
  | { ok: true; message: CaptureEnqueueMessage }
  | { ok: false; reason: string };

export type AuthResult = { ok: true } | { ok: false; reason: string };

export interface SenderLike {
  id?: string;
  url?: string;
  origin?: string;
  tab?: { url?: string };
}

/**
 * Derive sender location from MessageSender fields (preferred order).
 */
export function senderLocation(sender: SenderLike): string | undefined {
  if (typeof sender.tab?.url === "string" && sender.tab.url.length > 0) {
    return sender.tab.url;
  }
  if (typeof sender.url === "string" && sender.url.length > 0) {
    return sender.url;
  }
  if (typeof sender.origin === "string" && sender.origin.length > 0) {
    return sender.origin;
  }
  return undefined;
}

/**
 * Accept only exact HTTPS ChatGPT origins (URL parse; no substring/suffix match).
 */
export function isApprovedChatgptLocation(
  location: string | undefined,
): boolean {
  if (location === undefined || location.length === 0) return false;
  try {
    const parsed = new URL(location);
    if (parsed.protocol !== "https:") return false;
    return (CHATGPT_ORIGINS as readonly string[]).includes(parsed.origin);
  } catch {
    return false;
  }
}

/** @deprecated use isApprovedChatgptLocation */
export function isApprovedChatgptUrl(url: string | undefined): boolean {
  return isApprovedChatgptLocation(url);
}

function isOwnExtensionUrl(url: string, extensionId: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "chrome-extension:" && parsed.hostname === extensionId
    );
  } catch {
    return false;
  }
}

/**
 * Legacy synthetic/manual enqueue — extension pages only.
 * Rejects any sender with a tab (including ChatGPT content scripts).
 */
export function authorizeLegacyEnqueue(
  sender: SenderLike,
  extensionId: string,
): AuthResult {
  if (sender.id !== extensionId) {
    return { ok: false, reason: "sender_id" };
  }
  if (sender.tab !== undefined && sender.tab !== null) {
    return { ok: false, reason: "tab_context" };
  }
  if (typeof sender.url === "string" && sender.url.length > 0) {
    if (!isOwnExtensionUrl(sender.url, extensionId)) {
      return { ok: false, reason: "extension_url" };
    }
  }
  return { ok: true };
}

function isSpeaker(value: unknown): value is Speaker {
  return value === "user" || value === "assistant";
}

function validateConversationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CONVERSATION_ID_LENGTH) {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function validateText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_TURN_TEXT_LENGTH) return null;
  return value;
}

function validateCapturedAt(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return undefined;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  return value;
}

export function validateCaptureEnqueueMessage(
  raw: unknown,
): CaptureEnqueueValidation {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, reason: "not_object" };
  }
  const msg = raw as Record<string, unknown>;
  if (msg.type !== CAPTURE_ENQUEUE_TYPE) {
    return { ok: false, reason: "wrong_type" };
  }
  const conversation_id = validateConversationId(msg.conversation_id);
  if (conversation_id === null) {
    return { ok: false, reason: "conversation_id" };
  }
  if (typeof msg.source_key !== "string") {
    return { ok: false, reason: "source_key" };
  }
  const source_key = validateSourceKey(msg.source_key);
  if (source_key === null) {
    return { ok: false, reason: "source_key" };
  }
  if (source_key.length > MAX_SOURCE_KEY_LENGTH) {
    return { ok: false, reason: "source_key" };
  }
  if (!isSpeaker(msg.speaker)) {
    return { ok: false, reason: "speaker" };
  }
  const text = validateText(msg.text);
  if (text === null) {
    return { ok: false, reason: "text" };
  }
  const captured_at = validateCapturedAt(msg.captured_at);
  const message: CaptureEnqueueMessage = {
    type: CAPTURE_ENQUEUE_TYPE,
    conversation_id,
    source_key,
    speaker: msg.speaker,
    text,
    ...(captured_at !== undefined ? { captured_at } : {}),
  };
  return { ok: true, message };
}

/**
 * Full SW gate: extension id + ChatGPT location + schema.
 * Diagnostics reasons never include turn text.
 */
export function authorizeCaptureEnqueue(
  raw: unknown,
  sender: SenderLike,
  extensionId: string,
): CaptureEnqueueValidation {
  if (sender.id !== extensionId) {
    return { ok: false, reason: "sender_id" };
  }
  if (!isApprovedChatgptLocation(senderLocation(sender))) {
    return { ok: false, reason: "origin" };
  }
  return validateCaptureEnqueueMessage(raw);
}
