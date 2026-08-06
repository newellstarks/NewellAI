/**
 * Exact download allowlist from image recon (Artifact v1 Image Slice).
 * Host: chatgpt.com
 * Path: /backend-api/estuary/content (optional trailing slash)
 *
 * Live `img[src]` often includes `id` (and may omit some signed query names
 * that appear on network download). Require host + path + `id` only.
 */

export const ARTIFACT_DOWNLOAD_HOST = "chatgpt.com";
export const ARTIFACT_DOWNLOAD_PATH = "/backend-api/estuary/content";

export const ARTIFACT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Reject placeholder / metadata-sized bodies that are not real ChatGPT images.
 * Estuary content for user/assistant images is typically tens of KB+.
 */
export const ARTIFACT_MIN_IMAGE_BYTES = 128;

export const ARTIFACT_MIME_ALLOWLIST = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedArtifactMime = (typeof ARTIFACT_MIME_ALLOWLIST)[number];

export function isAllowedArtifactMime(
  mime: string,
): mime is AllowedArtifactMime {
  return (ARTIFACT_MIME_ALLOWLIST as readonly string[]).includes(mime);
}

const PNG_SIG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG_SIG = Uint8Array.of(0xff, 0xd8, 0xff);
const RIFF = Uint8Array.of(0x52, 0x49, 0x46, 0x46); // RIFF
const WEBP = Uint8Array.of(0x57, 0x45, 0x42, 0x50); // WEBP

function startsWith(bytes: Uint8Array, sig: Uint8Array, offset = 0): boolean {
  if (bytes.byteLength < offset + sig.byteLength) return false;
  for (let i = 0; i < sig.byteLength; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

/** Detect image MIME from binary magic only (ignore declared Content-Type). */
export function detectImageMimeFromBytes(
  bytes: ArrayBuffer | Uint8Array,
): AllowedArtifactMime | null {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (startsWith(view, PNG_SIG)) return "image/png";
  if (startsWith(view, JPEG_SIG)) return "image/jpeg";
  if (startsWith(view, RIFF) && startsWith(view, WEBP, 8)) return "image/webp";
  return null;
}

export type ImagePayloadValidation =
  | { ok: true; mime: AllowedArtifactMime }
  | { ok: false; reason: string };

/**
 * Validate fetched image bytes before enqueue.
 * Does not trust Content-Type alone; requires magic signature + size bounds.
 */
export function validateImagePayload(
  bytes: ArrayBuffer | Uint8Array,
  declaredMime: string,
): ImagePayloadValidation {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength === 0) {
    return { ok: false, reason: "empty" };
  }
  if (view.byteLength > ARTIFACT_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  if (view.byteLength < ARTIFACT_MIN_IMAGE_BYTES) {
    return { ok: false, reason: "too_small" };
  }
  if (!isAllowedArtifactMime(declaredMime)) {
    return { ok: false, reason: "mime" };
  }
  const detected = detectImageMimeFromBytes(view);
  if (detected === null) {
    return { ok: false, reason: "not_image" };
  }
  if (detected !== declaredMime) {
    return { ok: false, reason: "mime_mismatch" };
  }
  return { ok: true, mime: detected };
}

export type EstuaryUrlValidation =
  | { ok: true; url: URL; fileId: string }
  | { ok: false; reason: string };

function isEstuaryPath(pathname: string): boolean {
  return (
    pathname === ARTIFACT_DOWNLOAD_PATH ||
    pathname === `${ARTIFACT_DOWNLOAD_PATH}/`
  );
}

/**
 * Validate an estuary content URL. Rejects blob:, other hosts, wrong path.
 * Requires `id` query param; other signed params are optional for discovery.
 */
export function validateEstuaryContentUrl(raw: string): EstuaryUrlValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "protocol" };
  }
  if (url.hostname !== ARTIFACT_DOWNLOAD_HOST) {
    return { ok: false, reason: "host" };
  }
  if (!isEstuaryPath(url.pathname)) {
    return { ok: false, reason: "path" };
  }
  const fileId = url.searchParams.get("id");
  if (fileId === null || fileId.trim().length === 0) {
    return { ok: false, reason: "missing_id" };
  }
  return { ok: true, url, fileId: fileId.trim() };
}
