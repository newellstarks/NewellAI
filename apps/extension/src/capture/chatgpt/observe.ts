import type { Speaker } from "@newellai/contracts";
import {
  CAPTURE_STABILITY_MS,
  OBSERVER_DEBOUNCE_MS,
  PERIODIC_RESCAN_MS,
} from "../constants";
import {
  conversationIdFromUrl,
  extractRawMessages,
  selectCompletedCandidates,
} from "./adapter";
import type { StabilityTracker } from "./completion";
import { assignSourceKeys, isValidSourceProvidedId } from "./identity";
import { CAPTURE_ENQUEUE_TYPE, ARTIFACT_ENQUEUE_TYPE } from "../messaging";
import { validateEstuaryContentUrl } from "../../artifacts/allowlist";
import {
  discoverEstuaryImagesInElement,
  fetchEstuaryImageBytes,
} from "./images";

/** In-memory bytes before content-script conversion to number[] wire format. */
function toWireBytes(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

function artifactAttemptKey(
  conversationId: string,
  sourceUrl: string,
): string | null {
  let validated = validateEstuaryContentUrl(sourceUrl);
  if (!validated.ok) {
    try {
      validated = validateEstuaryContentUrl(
        new URL(sourceUrl, "https://chatgpt.com").toString(),
      );
    } catch {
      return null;
    }
  }
  if (!validated.ok) return null;
  return `${conversationId}\0${validated.fileId}`;
}

/**
 * Page-session observation: MutationObserver + bounded rescans +
 * conversation_id buffering (docs/CaptureClient.md).
 */

export interface CaptureEnqueuePayload {
  type: typeof CAPTURE_ENQUEUE_TYPE;
  conversation_id: string;
  source_key: string;
  speaker: Speaker;
  text: string;
  captured_at: string;
}

/** Durable turn identity returned after enqueue (or already_known). */
export type EnqueueSendResult = {
  client_turn_id: string;
};

export type EnqueueSender = (
  payload: CaptureEnqueuePayload,
) => void | Promise<void | EnqueueSendResult>;

export interface CaptureArtifactPayload {
  type: typeof ARTIFACT_ENQUEUE_TYPE;
  conversation_id: string;
  /**
   * Turn source_key for durable identity lookup in the service worker.
   * Must match the turn enqueue source_key; background resolves client_turn_id.
   */
  client_turn_id: string;
  source_key: string;
  direction: "user_uploaded" | "assistant_generated";
  mime_type: string;
  declared_sha256: string;
  declared_byte_size: number;
  image_provenance?: "uploaded" | "generated" | "screenshot" | "edited_derived";
  original_filename?: string;
  source_url?: string;
  captured_at: string;
  /** In-memory bytes before bridge conversion to number[]. */
  bytes: Uint8Array;
}

export type ArtifactEnqueueSendResult =
  | { ok: true; status?: string }
  | { ok: false; error?: string };

export type ArtifactEnqueueSender = (
  payload: CaptureArtifactPayload,
) => void | Promise<void | ArtifactEnqueueSendResult>;

/** Initial attempt + one retry after rejection; then stop re-fetching. */
const ARTIFACT_ENQUEUE_MAX_ATTEMPTS = 2;

export interface ObserveCandidate {
  speaker: Speaker;
  text: string;
  sourceProvidedId: string | null;
  element?: Element;
}

export interface ObserveDeps {
  document: Document;
  getHref: () => string;
  isCaptureEnabled: () => boolean;
  sendEnqueue: EnqueueSender;
  sendArtifactEnqueue?: ArtifactEnqueueSender;
  fetchFn?: typeof fetch;
  now?: () => number;
  stabilityMs?: number;
  debounceMs?: number;
  rescanMs?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}

export interface ChatgptObserver {
  start: () => void;
  stop: () => void;
  rescan: () => Promise<void>;
  resetSession: () => void;
}

/**
 * Coalesce a candidate list for buffer/flush:
 * - validated source-provided ids: first occurrence wins (dedupe by id)
 * - missing source ids: keep every entry in order (no speaker+text collapse)
 */
export function coalesceCandidates(
  candidates: ObserveCandidate[],
): ObserveCandidate[] {
  const out: ObserveCandidate[] = [];
  const seenSourceIds = new Set<string>();
  for (const c of candidates) {
    if (isValidSourceProvidedId(c.sourceProvidedId)) {
      const id = c.sourceProvidedId.trim();
      if (seenSourceIds.has(id)) continue;
      seenSourceIds.add(id);
      out.push({
      speaker: c.speaker,
      text: c.text,
      sourceProvidedId: id,
      ...(c.element !== undefined ? { element: c.element } : {}),
    });
      continue;
    }
    out.push({
      speaker: c.speaker,
      text: c.text,
      sourceProvidedId: null,
      ...(c.element !== undefined ? { element: c.element } : {}),
    });
  }
  return out;
}

export function createChatgptObserver(deps: ObserveDeps): ChatgptObserver {
  const now = deps.now ?? Date.now;
  const stabilityMs = deps.stabilityMs ?? CAPTURE_STABILITY_MS;
  const debounceMs = deps.debounceMs ?? OBSERVER_DEBOUNCE_MS;
  const rescanMs = deps.rescanMs ?? PERIODIC_RESCAN_MS;
  const schedule = deps.setTimeout ?? setTimeout;
  const clearSchedule = deps.clearTimeout ?? clearTimeout;
  const interval = deps.setInterval ?? setInterval;
  const clearIntervalFn = deps.clearInterval ?? clearInterval;

  const tracker: StabilityTracker = new Map();
  /** Snapshot of completed turns while waiting for /c/<id>. */
  let buffered: ObserveCandidate[] = [];
  /** Skip further fetch/enqueue after a successful bridge ack. */
  const artifactSucceeded = new Set<string>();
  /** Failed enqueue attempts per artifact (max ARTIFACT_ENQUEUE_MAX_ATTEMPTS). */
  const artifactFailCounts = new Map<string, number>();
  let lastHref = deps.getHref();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let periodicTimer: ReturnType<typeof setInterval> | null = null;
  let observer: MutationObserver | null = null;
  let running = false;

  function resetSession(): void {
    tracker.clear();
    buffered = [];
    artifactSucceeded.clear();
    artifactFailCounts.clear();
  }

  function shouldSkipArtifact(attemptKey: string | null): boolean {
    if (attemptKey === null) return false;
    if (artifactSucceeded.has(attemptKey)) return true;
    return (
      (artifactFailCounts.get(attemptKey) ?? 0) >= ARTIFACT_ENQUEUE_MAX_ATTEMPTS
    );
  }

  async function deliverArtifact(
    attemptKey: string | null,
    payload: CaptureArtifactPayload,
  ): Promise<void> {
    if (deps.sendArtifactEnqueue === undefined) return;
    const result = await deps.sendArtifactEnqueue(payload);
    if (attemptKey === null) return;
    if (result && typeof result === "object" && "ok" in result) {
      if (result.ok) {
        artifactSucceeded.add(attemptKey);
        artifactFailCounts.delete(attemptKey);
        return;
      }
      // Turn identity may not exist yet — allow later rescans to retry.
      if (result.error === "turn_identity_unknown") {
        return;
      }
      const fails = (artifactFailCounts.get(attemptKey) ?? 0) + 1;
      artifactFailCounts.set(attemptKey, fails);
      return;
    }
    // Legacy void sender: treat as success so we do not loop forever in tests.
    artifactSucceeded.add(attemptKey);
  }

  /**
   * Enqueue the turn first; return the durable client_turn_id when available,
   * otherwise the turn source_key (matches client_turn_id for validated keys).
   */
  async function enqueueTurnAndResolveId(
    conversationId: string,
    sourceKey: string,
    speaker: Speaker,
    text: string,
    captured_at: string,
  ): Promise<string> {
    const result = await deps.sendEnqueue({
      type: CAPTURE_ENQUEUE_TYPE,
      conversation_id: conversationId,
      source_key: sourceKey,
      speaker,
      text,
      captured_at,
    });
    if (
      result &&
      typeof result === "object" &&
      typeof result.client_turn_id === "string" &&
      result.client_turn_id.length > 0
    ) {
      return result.client_turn_id;
    }
    return sourceKey;
  }

  async function enqueueImagesForTurn(
    conversationId: string,
    element: Element,
    speaker: Speaker,
    turnSourceKey: string,
    captured_at: string,
  ): Promise<void> {
    if (deps.sendArtifactEnqueue === undefined) return;
    const direction =
      speaker === "user" ? "user_uploaded" : "assistant_generated";
    const images = discoverEstuaryImagesInElement(
      element,
      direction,
      // Wire field carries turn source_key for background identity lookup.
      turnSourceKey,
      turnSourceKey,
    );
    for (const image of images) {
      const attemptKey = artifactAttemptKey(conversationId, image.source_url);
      if (shouldSkipArtifact(attemptKey)) continue;
      const fetched = await fetchEstuaryImageBytes(
        image.source_url,
        deps.fetchFn ?? fetch,
      );
      if (!fetched.ok) continue;
      const payload: CaptureArtifactPayload = {
        type: ARTIFACT_ENQUEUE_TYPE,
        conversation_id: conversationId,
        // Must equal the turn's durable source_key (not a recomputed variant).
        client_turn_id: turnSourceKey,
        source_key: fetched.artifact.file_id,
        direction: image.direction,
        mime_type: fetched.artifact.mime_type,
        declared_sha256: fetched.artifact.sha256,
        declared_byte_size: fetched.artifact.byte_size,
        image_provenance: image.image_provenance,
        source_url: fetched.artifact.source_url,
        captured_at,
        bytes: toWireBytes(fetched.artifact.bytes),
      };
      if (fetched.artifact.original_filename !== undefined) {
        payload.original_filename = fetched.artifact.original_filename;
      }
      await deliverArtifact(attemptKey, payload);
    }
  }

  async function flushCompleted(
    conversationId: string,
    candidates: ObserveCandidate[],
  ): Promise<void> {
    if (candidates.length === 0) return;
    const keyed = await assignSourceKeys(conversationId, candidates);
    const captured_at = new Date(now()).toISOString();
    for (let i = 0; i < keyed.length; i++) {
      const turn = keyed[i]!;
      const candidate = candidates[i];
      // Ensure durable turn identity exists before linking artifacts.
      await enqueueTurnAndResolveId(
        conversationId,
        turn.source_key,
        turn.speaker,
        turn.text,
        captured_at,
      );

      if (
        deps.sendArtifactEnqueue === undefined ||
        candidate?.element === undefined
      ) {
        continue;
      }
      await enqueueImagesForTurn(
        conversationId,
        candidate.element,
        turn.speaker,
        turn.source_key,
        captured_at,
      );
    }
  }

  async function rescan(): Promise<void> {
    if (!deps.isCaptureEnabled()) return;

    try {
      const href = deps.getHref();
      if (href !== lastHref) {
        const prevId = conversationIdFromUrl(lastHref);
        const nextId = conversationIdFromUrl(href);
        // Preserve buffer/tracker when URL first gains /c/<id> (null → id).
        // Reset when switching conversations or leaving one.
        const graduating = prevId === null && nextId !== null;
        if (prevId !== nextId && !graduating) {
          resetSession();
        }
        lastHref = href;
      }

      const conversationId = conversationIdFromUrl(href);
      const raw = extractRawMessages(deps.document);
      const completed = coalesceCandidates(
        selectCompletedCandidates(raw, tracker, now(), stabilityMs),
      );

      if (conversationId === null) {
        // Replace snapshot — do not accumulate across rescans (would multiply
        // missing-id turns). coalesce already preserves duplicate texts once.
        buffered = completed;
        return;
      }

      // Prefer the current DOM scan; fall back to buffer if the DOM briefly
      // has no completed nodes when /c/<id> first appears.
      const toSend =
        completed.length > 0 ? completed : coalesceCandidates(buffered);
      buffered = [];
      await flushCompleted(conversationId, toSend);
      // Second pass: same completed-turn identity set as flushCompleted — never
      // invent a parallel source_key from a solo role-node assignSourceKeys.
      await flushArtifactsForCompletedTurns(conversationId);
    } catch (err) {
      const name = err instanceof Error ? err.name.slice(0, 24) : "unknown";
      console.warn("[newellai] capture rescan failed:", name);
    }
  }

  /**
   * Recover estuary images for completed turns only, using the same
   * extract → completion → assignSourceKeys path as turn enqueue.
   */
  async function flushArtifactsForCompletedTurns(
    conversationId: string,
  ): Promise<void> {
    if (deps.sendArtifactEnqueue === undefined) return;
    const raw = extractRawMessages(deps.document);
    const completed = coalesceCandidates(
      selectCompletedCandidates(raw, tracker, now(), stabilityMs),
    );
    if (completed.length === 0) return;
    const keyed = await assignSourceKeys(conversationId, completed);
    const captured_at = new Date(now()).toISOString();
    for (let i = 0; i < keyed.length; i++) {
      const turn = keyed[i]!;
      const candidate = completed[i];
      if (candidate?.element === undefined) continue;
      await enqueueTurnAndResolveId(
        conversationId,
        turn.source_key,
        turn.speaker,
        turn.text,
        captured_at,
      );
      await enqueueImagesForTurn(
        conversationId,
        candidate.element,
        turn.speaker,
        turn.source_key,
        captured_at,
      );
    }
  }

  function scheduleRescan(): void {
    if (debounceTimer !== null) clearSchedule(debounceTimer);
    debounceTimer = schedule(() => {
      debounceTimer = null;
      void rescan();
    }, debounceMs);
  }

  function start(): void {
    if (running) return;
    running = true;
    lastHref = deps.getHref();
    observer = new MutationObserver(() => scheduleRescan());
    const root = deps.document.body ?? deps.document.documentElement;
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    periodicTimer = interval(() => {
      if (deps.document.visibilityState === "hidden") return;
      void rescan();
    }, rescanMs);
    void rescan();
  }

  function stop(): void {
    running = false;
    observer?.disconnect();
    observer = null;
    if (debounceTimer !== null) clearSchedule(debounceTimer);
    debounceTimer = null;
    if (periodicTimer !== null) clearIntervalFn(periodicTimer);
    periodicTimer = null;
  }

  return { start, stop, rescan, resetSession };
}
