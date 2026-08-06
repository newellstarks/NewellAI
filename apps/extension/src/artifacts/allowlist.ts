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
