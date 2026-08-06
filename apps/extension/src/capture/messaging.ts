import type { Speaker } from "@newellai/contracts";
import { ARTIFACT_MAX_BYTES } from "../artifacts/allowlist";
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
export const ARTIFACT_ENQUEUE_TYPE = "artifactEnqueue" as const;

export interface CaptureEnqueueMessage {
  type: typeof CAPTURE_ENQUEUE_TYPE;
  conversation_id: string;
  source_key: string;
  speaker: Speaker;
  text: string;
  captured_at?: string;
}

export interface ArtifactEnqueueMessage {
  type: typeof ARTIFACT_ENQUEUE_TYPE;
  conversation_id: string;
  client_turn_id: string;
  source_key: string;
  direction: "user_uploaded" | "assistant_generated";
  mime_type: string;
  declared_sha256: string;
  declared_byte_size: number;
  image_provenance?: "uploaded" | "generated" | "screenshot" | "edited_derived";
  original_filename?: string;
  source_url?: string;
  captured_at?: string;
  /**
   * Binary payload from content-script fetch.
   * Wire format prefers Uint8Array (Chrome sendMessage structured-clone);
   * validator also accepts ArrayBuffer and normalizes to ArrayBuffer.
   */
  bytes?: ArrayBuffer;
}

export type CaptureEnqueueValidation =
  | { ok: true; message: CaptureEnqueueMessage }
  | { ok: false; reason: string };

export type ArtifactEnqueueValidation =
  | { ok: true; message: ArtifactEnqueueMessage }
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

const SHA256_RE = /^[a-f0-9]{64}$/i;
const ARTIFACT_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Sanitized structural probe of a received `bytes` field — never logs values.
 */
export interface ArtifactBytesShapeDiag {
  toStringTag: string;
  isArray: boolean;
  isView: boolean;
  ctorName: string;
  numericKeyCount: number;
  numericKeysCapped: boolean;
  hasByteLength: boolean;
  hasLength: boolean;
  byteLength: number | null;
  length: number | null;
}

const NUMERIC_KEY_DIAG_CAP = 64;

export function describeArtifactBytesShape(
  value: unknown,
): ArtifactBytesShapeDiag {
  const toStringTag = Object.prototype.toString.call(value);
  if (value === undefined || value === null || typeof value !== "object") {
    return {
      toStringTag,
      isArray: false,
      isView: false,
      ctorName: value === null ? "null" : typeof value,
      numericKeyCount: 0,
      numericKeysCapped: false,
      hasByteLength: false,
      hasLength: false,
      byteLength: null,
      length: null,
    };
  }
  const obj = value as Record<string, unknown>;
  const ctorName =
    typeof (value as { constructor?: { name?: string } }).constructor?.name ===
    "string"
      ? ((value as { constructor: { name: string } }).constructor.name ||
        "Object")
      : "Object";
  const hasByteLength = typeof obj.byteLength === "number";
  const hasLength = typeof obj.length === "number";
  let numericKeyCount = 0;
  let numericKeysCapped = false;
  for (const key of Object.keys(obj)) {
    if (/^\d+$/.test(key)) {
      numericKeyCount += 1;
      if (numericKeyCount >= NUMERIC_KEY_DIAG_CAP) {
        numericKeysCapped = true;
        break;
      }
    }
  }
  return {
    toStringTag,
    isArray: Array.isArray(value),
    isView: ArrayBuffer.isView(value),
    ctorName: ctorName.slice(0, 40),
    numericKeyCount,
    numericKeysCapped,
    hasByteLength,
    hasLength,
    byteLength: hasByteLength ? (obj.byteLength as number) : null,
    length: hasLength ? (obj.length as number) : null,
  };
}

function bytesFromByteValues(
  length: number,
  at: (index: number) => unknown,
): ArrayBuffer | null {
  if (
    !Number.isInteger(length) ||
    length <= 0 ||
    length > ARTIFACT_MAX_BYTES
  ) {
    return null;
  }
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const v = at(i);
    if (
      typeof v !== "number" ||
      !Number.isInteger(v) ||
      v < 0 ||
      v > 255
    ) {
      return null;
    }
    out[i] = v;
  }
  return out.buffer;
}

/**
 * Normalize chrome.runtime.sendMessage binary payloads.
 *
 * Live Chrome often destroys ArrayBuffer/Uint8Array identity across the
 * content-script → service-worker boundary. Preferred wire format for this
 * slice: plain number[] (0..255), reconstructed here. Still accepts
 * ArrayBuffer / ArrayBufferView / array-like plain objects when present.
 */
export function coerceArtifactBytes(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) {
    return value.byteLength > 0 && value.byteLength <= ARTIFACT_MAX_BYTES
      ? value
      : null;
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    if (view.byteLength <= 0 || view.byteLength > ARTIFACT_MAX_BYTES) {
      return null;
    }
    const copy = new Uint8Array(view.byteLength);
    copy.set(value as unknown as ArrayLike<number>);
    return copy.buffer;
  }
  if (Array.isArray(value)) {
    return bytesFromByteValues(value.length, (i) => value[i]);
  }
  // Cross-realm ArrayBuffer tag without instanceof.
  if (
    value !== null &&
    typeof value === "object" &&
    Object.prototype.toString.call(value) === "[object ArrayBuffer]" &&
    typeof (value as ArrayBuffer).byteLength === "number"
  ) {
    const ab = value as ArrayBuffer;
    return ab.byteLength > 0 && ab.byteLength <= ARTIFACT_MAX_BYTES ? ab : null;
  }
  // Live Chrome shape: plain object / array-like with numeric keys.
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const len =
      typeof obj.length === "number"
        ? obj.length
        : typeof obj.byteLength === "number"
          ? obj.byteLength
          : null;
    if (len !== null) {
      return bytesFromByteValues(len, (i) => obj[i]);
    }
  }
  return null;
}

/** Sanitized kind tag for temporary diagnostics — never logs contents. */
export function artifactBytesKind(value: unknown): string {
  if (value === undefined) return "absent";
  if (value instanceof ArrayBuffer) return "ArrayBuffer";
  if (value instanceof Uint8Array) return "Uint8Array";
  if (ArrayBuffer.isView(value)) return "ArrayBufferView";
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

export function validateArtifactEnqueueMessage(
  raw: unknown,
): ArtifactEnqueueValidation {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, reason: "not_object" };
  }
  const msg = raw as Record<string, unknown>;
  if (msg.type !== ARTIFACT_ENQUEUE_TYPE) {
    return { ok: false, reason: "wrong_type" };
  }
  const conversation_id = validateConversationId(msg.conversation_id);
  if (conversation_id === null) {
    return { ok: false, reason: "conversation_id" };
  }
  if (typeof msg.client_turn_id !== "string" || msg.client_turn_id.trim() === "") {
    return { ok: false, reason: "client_turn_id" };
  }
  if (typeof msg.source_key !== "string") {
    return { ok: false, reason: "source_key" };
  }
  const source_key = validateSourceKey(msg.source_key);
  if (source_key === null) {
    return { ok: false, reason: "source_key" };
  }
  if (
    msg.direction !== "user_uploaded" &&
    msg.direction !== "assistant_generated"
  ) {
    return { ok: false, reason: "direction" };
  }
  if (typeof msg.mime_type !== "string" || !ARTIFACT_MIME.has(msg.mime_type)) {
    return { ok: false, reason: "mime_type" };
  }
  if (
    typeof msg.declared_sha256 !== "string" ||
    !SHA256_RE.test(msg.declared_sha256)
  ) {
    return { ok: false, reason: "declared_sha256" };
  }
  if (
    typeof msg.declared_byte_size !== "number" ||
    !Number.isFinite(msg.declared_byte_size) ||
    msg.declared_byte_size <= 0 ||
    msg.declared_byte_size > ARTIFACT_MAX_BYTES
  ) {
    return { ok: false, reason: "declared_byte_size" };
  }

  let normalizedBytes: ArrayBuffer | undefined;
  if (msg.bytes !== undefined) {
    const coerced = coerceArtifactBytes(msg.bytes);
    if (coerced === null) {
      return { ok: false, reason: "bytes" };
    }
    if (
      coerced.byteLength === 0 ||
      coerced.byteLength > ARTIFACT_MAX_BYTES ||
      coerced.byteLength !== msg.declared_byte_size
    ) {
      return { ok: false, reason: "bytes" };
    }
    normalizedBytes = coerced;
  }

  const captured_at = validateCapturedAt(msg.captured_at);
  const message: ArtifactEnqueueMessage = {
    type: ARTIFACT_ENQUEUE_TYPE,
    conversation_id,
    client_turn_id: msg.client_turn_id.trim(),
    source_key,
    direction: msg.direction,
    mime_type: msg.mime_type,
    declared_sha256: msg.declared_sha256.toLowerCase(),
    declared_byte_size: msg.declared_byte_size,
  };
  if (typeof msg.image_provenance === "string") {
    message.image_provenance =
      msg.image_provenance as ArtifactEnqueueMessage["image_provenance"];
  }
  if (typeof msg.original_filename === "string") {
    message.original_filename = msg.original_filename.slice(0, 512);
  }
  if (typeof msg.source_url === "string") {
    message.source_url = msg.source_url.slice(0, 2048);
  }
  if (captured_at !== undefined) message.captured_at = captured_at;
  if (normalizedBytes !== undefined) message.bytes = normalizedBytes;
  return { ok: true, message };
}

/**
 * Artifact enqueue gate: extension id + ChatGPT location + schema.
 * Never logs bytes or source URLs.
 */
export function authorizeArtifactEnqueue(
  raw: unknown,
  sender: SenderLike,
  extensionId: string,
): ArtifactEnqueueValidation {
  if (sender.id !== extensionId) {
    return { ok: false, reason: "sender_id" };
  }
  if (!isApprovedChatgptLocation(senderLocation(sender))) {
    return { ok: false, reason: "origin" };
  }
  return validateArtifactEnqueueMessage(raw);
}
