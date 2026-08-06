import type { ArtifactDirection, ImageProvenance } from "@newellai/contracts";
import {
  isAllowedArtifactMime,
  validateEstuaryContentUrl,
  validateImagePayload,
} from "../../artifacts/allowlist";
import { MESSAGE_ROOT_SELECTORS } from "./selectors";

/**
 * Content-script image download (recon-proven page-context fetch).
 * Does not run in the service worker.
 * User-uploaded and assistant-generated share this estuary fetch path.
 */

export interface FetchedArtifactBytes {
  bytes: ArrayBuffer;
  mime_type: string;
  sha256: string;
  byte_size: number;
  original_filename?: string;
  file_id: string;
  source_url: string;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function filenameFromContentDisposition(
  header: string | null,
): string | undefined {
  if (header === null || header.length === 0) return undefined;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim());
    } catch {
      return utf[1].trim();
    }
  }
  const plain =
    /filename="([^"]+)"/i.exec(header) ?? /filename=([^;]+)/i.exec(header);
  if (plain?.[1]) return plain[1].trim();
  return undefined;
}

export type FetchArtifactResult =
  | { ok: true; artifact: FetchedArtifactBytes }
  | { ok: false; reason: string };

/**
 * Validate estuary URL, fetch with credentials, enforce MIME/size/signature.
 * Shared by user_uploaded and assistant_generated discovery.
 */
export async function fetchEstuaryImageBytes(
  rawUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<FetchArtifactResult> {
  const validated = validateEstuaryContentUrl(rawUrl);
  if (!validated.ok) {
    return { ok: false, reason: validated.reason };
  }

  let response: Response;
  try {
    response = await fetchFn(validated.url.toString(), {
      method: "GET",
      credentials: "include",
      redirect: "manual",
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (response.status >= 300 && response.status < 400) {
    return { ok: false, reason: "redirect" };
  }
  if (!response.ok) {
    return { ok: false, reason: `http_${response.status}` };
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ??
    "";
  if (!isAllowedArtifactMime(contentType)) {
    return { ok: false, reason: "mime" };
  }

  const buf = await response.arrayBuffer();
  const payload = validateImagePayload(buf, contentType);
  if (!payload.ok) {
    return { ok: false, reason: payload.reason };
  }

  const sha256 = await sha256Hex(buf);
  const filename = filenameFromContentDisposition(
    response.headers.get("content-disposition"),
  );

  const artifact: FetchedArtifactBytes = {
    bytes: buf,
    mime_type: payload.mime,
    sha256,
    byte_size: buf.byteLength,
    file_id: validated.fileId,
    source_url: validated.url.toString(),
  };
  if (filename !== undefined) artifact.original_filename = filename;
  return { ok: true, artifact };
}

export interface DiscoveredImage {
  source_url: string;
  direction: ArtifactDirection;
  image_provenance: ImageProvenance;
  client_turn_id: string;
  turn_source_key: string;
}

/**
 * Live ChatGPT often puts attachments as siblings of
 * `[data-message-author-role]` under the conversation-turn container.
 * Prefer the turn root (article/section/`data-turn`), not only the role node.
 */
export const TURN_ROOT_SELECTOR =
  'article[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"], section[data-turn], [data-turn], .group\\/conversation-turn';

export function imageSearchRoot(messageEl: Element): Element {
  try {
    const turn = messageEl.closest(TURN_ROOT_SELECTOR);
    if (turn) return turn;
  } catch {
    /* some hosts reject escaped selectors */
  }

  // Fallback: climb while staying inside a known message-root wrapper.
  let cur: Element | null = messageEl.parentElement;
  for (let i = 0; i < 8 && cur; i++) {
    for (const sel of MESSAGE_ROOT_SELECTORS) {
      try {
        if (cur.matches(sel)) return cur;
      } catch {
        /* ignore invalid selectors in some hosts */
      }
    }
    // Prefer an ancestor that already looks like a turn container.
    try {
      if (cur.matches(TURN_ROOT_SELECTOR)) return cur;
    } catch {
      /* ignore */
    }
    cur = cur.parentElement;
  }
  return messageEl;
}

function tryEstuaryUrl(raw: string): string | null {
  if (raw.length === 0 || raw.startsWith("blob:")) return null;
  const direct = validateEstuaryContentUrl(raw);
  if (direct.ok) return direct.url.toString();
  try {
    const abs = new URL(raw, "https://chatgpt.com").toString();
    const v2 = validateEstuaryContentUrl(abs);
    return v2.ok ? v2.url.toString() : null;
  } catch {
    return null;
  }
}

/** First absolute URL token from a srcset attribute. */
function firstSrcsetUrl(srcset: string): string | null {
  const part = srcset.split(",")[0]?.trim();
  if (!part) return null;
  const url = part.split(/\s+/)[0];
  return url && url.length > 0 ? url : null;
}

function collectCandidateUrls(node: Element): string[] {
  const out: string[] = [];
  const attrs = ["src", "href", "data-src"] as const;
  for (const name of attrs) {
    const v = node.getAttribute(name);
    if (v) out.push(v);
  }
  const srcset = node.getAttribute("srcset");
  if (srcset) {
    const first = firstSrcsetUrl(srcset);
    if (first) out.push(first);
  }
  if (typeof HTMLImageElement !== "undefined" && node instanceof HTMLImageElement) {
    if (node.currentSrc) out.push(node.currentSrc);
  }
  // blob:<img> often wrapped by estuary <a href>
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    if (src.startsWith("blob:")) {
      const anchor = node.closest("a[href]");
      const href = anchor?.getAttribute("href");
      if (href) out.push(href);
    }
  }
  // Live DOM sometimes stashes the durable URL on a data-* attribute.
  for (const attr of Array.from(node.attributes)) {
    const v = attr.value;
    if (
      v.includes("/backend-api/estuary/content") ||
      v.includes("estuary/content")
    ) {
      out.push(v);
    }
  }
  return out;
}

export type ArtifactDiagRejectReason =
  | "invalid_url"
  | "protocol"
  | "host"
  | "path"
  | "missing_id"
  | "other";

/** Sanitized discovery probe — never includes URL values, bytes, or tokens. */
export interface ArtifactDiscoveryStageReport {
  role: "user" | "assistant" | "other";
  has_turn_root: boolean;
  turn_tag: string;
  root_kind: "turn" | "role_fallback";
  img_count: number;
  blob_img_count: number;
  anchor_count: number;
  raw_url_candidates: number;
  reject: Partial<Record<ArtifactDiagRejectReason, number>>;
  accepted: number;
}

function classifyReject(reason: string): ArtifactDiagRejectReason {
  if (
    reason === "invalid_url" ||
    reason === "protocol" ||
    reason === "host" ||
    reason === "path" ||
    reason === "missing_id"
  ) {
    return reason;
  }
  return "other";
}

/**
 * Stage-level discovery diagnostics for one role node (console-safe).
 */
export function probeArtifactDiscovery(
  messageEl: Element,
): ArtifactDiscoveryStageReport {
  const roleAttr = messageEl.getAttribute("data-message-author-role");
  const role: ArtifactDiscoveryStageReport["role"] =
    roleAttr === "user" || roleAttr === "assistant" ? roleAttr : "other";
  const root = imageSearchRoot(messageEl);
  const hasTurn = root !== messageEl;
  let turnTag = root.tagName;
  try {
    if (root.getAttribute("data-turn")) turnTag = `${turnTag}[data-turn]`;
    else if (root.getAttribute("data-testid")?.includes("conversation-turn")) {
      turnTag = `${turnTag}[turn-testid]`;
    }
  } catch {
    /* ignore */
  }

  const imgs = Array.from(root.querySelectorAll("img"));
  const anchors = Array.from(root.querySelectorAll("a[href]"));
  let blobImgCount = 0;
  for (const img of imgs) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("blob:")) blobImgCount += 1;
  }

  const reject: Partial<Record<ArtifactDiagRejectReason, number>> = {};
  const acceptedUrls = new Set<string>();
  let rawCount = 0;
  const nodes: Element[] = [
    ...imgs,
    ...anchors,
    ...Array.from(root.querySelectorAll("source[srcset], source[src]")),
  ];
  for (const node of nodes) {
    for (const raw of collectCandidateUrls(node)) {
      rawCount += 1;
      if (raw.length === 0 || raw.startsWith("blob:")) continue;
      const validated = validateEstuaryContentUrl(raw);
      if (validated.ok) {
        acceptedUrls.add(validated.url.toString());
        continue;
      }
      try {
        const abs = new URL(raw, "https://chatgpt.com").toString();
        const v2 = validateEstuaryContentUrl(abs);
        if (v2.ok) {
          acceptedUrls.add(v2.url.toString());
          continue;
        }
        const key = classifyReject(v2.reason);
        reject[key] = (reject[key] ?? 0) + 1;
      } catch {
        const key = classifyReject(validated.reason);
        reject[key] = (reject[key] ?? 0) + 1;
      }
    }
  }

  return {
    role,
    has_turn_root: hasTurn,
    turn_tag: turnTag.slice(0, 32),
    root_kind: hasTurn ? "turn" : "role_fallback",
    img_count: imgs.length,
    blob_img_count: blobImgCount,
    anchor_count: anchors.length,
    raw_url_candidates: rawCount,
    reject,
    accepted: acceptedUrls.size,
  };
}

/**
 * True when the turn shows a user/assistant image attachment (blob or estuary).
 * Used so image-only user turns can complete before estuary URL appears.
 */
export function turnHasImageAttachment(messageEl: Element): boolean {
  const root = imageSearchRoot(messageEl);
  for (const img of Array.from(root.querySelectorAll("img[src]"))) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("blob:")) return true;
    if (tryEstuaryUrl(src) !== null) return true;
  }
  for (const a of Array.from(root.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") ?? "";
    if (tryEstuaryUrl(href) !== null) return true;
  }
  return false;
}

/**
 * Find estuary image URLs inside a message / turn container.
 */
export function discoverEstuaryImagesInElement(
  messageEl: Element,
  direction: ArtifactDirection,
  clientTurnId: string,
  turnSourceKey: string,
): DiscoveredImage[] {
  const provenance: ImageProvenance =
    direction === "user_uploaded" ? "uploaded" : "generated";
  const root = imageSearchRoot(messageEl);
  const urls = new Set<string>();
  const out: DiscoveredImage[] = [];

  const nodes: Element[] = [
    ...Array.from(root.querySelectorAll("img")),
    ...Array.from(root.querySelectorAll("a[href]")),
    ...Array.from(root.querySelectorAll("source[srcset], source[src]")),
  ];

  for (const node of nodes) {
    for (const raw of collectCandidateUrls(node)) {
      const url = tryEstuaryUrl(raw);
      if (url === null || urls.has(url)) continue;
      urls.add(url);
      out.push({
        source_url: url,
        direction,
        image_provenance: provenance,
        client_turn_id: clientTurnId,
        turn_source_key: turnSourceKey,
      });
    }
  }
  return out;
}
